import { Injectable, Logger } from '@nestjs/common';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableLambda, RunnablePassthrough, RunnableSequence } from '@langchain/core/runnables';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AiSessionMemoryService } from '../ai/ai-session-memory.service';
import { buildResolvedChatMessages } from '../ai/prompt-template.util';
import { KnowledgeBaseModelService } from './knowledge-base-model.service';
import { KnowledgeBasePromptResolverService } from './knowledge-base-prompt-resolver.service';
import { KnowledgeBaseRetrievalService } from './knowledge-base-retrieval.service';
import { KnowledgeBaseService } from './knowledge-base.service';
import type { AuthenticatedRequestUser } from './knowledge-base.types';

/**
 * 知识库问答服务
 *
 * 负责把“问题 -> 检索上下文 -> 模型流式回答 -> 问答日志”这一段串起来，
 * 并通过 SSE 把回答持续推给前端。
 */
@Injectable()
export class KnowledgeBaseChatService {
  private readonly logger = new Logger(KnowledgeBaseChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly retrievalService: KnowledgeBaseRetrievalService,
    private readonly modelService: KnowledgeBaseModelService,
    private readonly sessionMemoryService: AiSessionMemoryService,
    private readonly promptResolverService: KnowledgeBasePromptResolverService,
  ) {}

  /**
   * 流式回答
   *
   * 这条链路只在当前知识库内检索，先返回 sources，再逐步返回 answer_delta，
   * 这样前端可以同时展示引用来源和流式回答。
   */
  async streamAnswer(
    knowledgeBaseId: string,
    question: string,
    user: AuthenticatedRequestUser,
    res: Response,
    requestId: string,
    inputSessionId?: string,
  ) {
    const startedAt = Date.now();
    const sessionId = this.sessionMemoryService.resolveSessionId(inputSessionId);
    const conversationContext = await this.sessionMemoryService.getConversationContext({
      feature: 'knowledge_base',
      userId: user.sub,
      knowledgeBaseId,
      sessionId,
    });
    this.logger.log(
      JSON.stringify({
        requestId,
        stage: 'rag_request_started',
        knowledgeBaseId,
        userId: user.sub,
        sessionId,
      }),
    );

    this.writeEvent(res, 'meta', {
      type: 'meta',
      requestId,
      sessionId,
      knowledgeBaseId,
      timestamp: new Date().toISOString(),
    });

    try {
      this.writeEvent(res, 'loading', {
        type: 'loading',
        stage: 'retrieving',
        message: '正在检索知识库内容...',
      });

      const knowledgeBaseCheckStartedAt = Date.now();
      const knowledgeBase = await this.knowledgeBaseService.ensureKnowledgeBaseExists(knowledgeBaseId);
      const knowledgeBaseCheckDurationMs = Date.now() - knowledgeBaseCheckStartedAt;

      const readyDocumentsCheckStartedAt = Date.now();
      const readyDocumentCount = await this.knowledgeBaseService.countReadyDocuments(knowledgeBaseId);
      const readyDocumentCountDurationMs = Date.now() - readyDocumentsCheckStartedAt;

      this.logger.log(
        JSON.stringify({
          requestId,
          stage: 'rag_precheck_completed',
          knowledgeBaseCheckDurationMs,
          readyDocumentCountDurationMs,
          readyDocumentCount,
        }),
      );

      if (readyDocumentCount === 0) {
        await this.persistQaLog({
          knowledgeBaseId,
          userId: user.sub,
          requestId,
          question,
          answer: '当前知识库还没有可用文档，请先在管理端上传并处理完成后再提问。',
          thinking: null,
          sourceCount: 0,
          durationMs: Date.now() - startedAt,
          success: false,
          errorMessage: 'NO_READY_DOCUMENTS',
        });
        this.writeEvent(res, 'answer_delta', {
          type: 'answer_delta',
          delta: '当前知识库还没有可用文档，请先在管理端上传并处理完成后再提问。',
        });
        this.writeEvent(res, 'sources', {
          type: 'sources',
          items: [],
        });
        this.writeEvent(res, 'done', {
          type: 'done',
          durationMs: Date.now() - startedAt,
          sourceCount: 0,
        });
        this.logger.log(
          JSON.stringify({
            requestId,
            stage: 'rag_request_completed',
            durationMs: Date.now() - startedAt,
            sourceCount: 0,
            reason: 'no_ready_documents',
          }),
        );
        return;
      }

      const preparedAnswer = await this.createAnswerPreparationChain({
        systemPromptOverride: knowledgeBase.systemPromptOverride ?? null,
        answerStyle: knowledgeBase.answerStyle.toLowerCase() as 'concise' | 'balanced' | 'detailed',
        citationMode: knowledgeBase.citationMode.toLowerCase() as 'required' | 'optional' | 'hidden',
        strictMode: knowledgeBase.strictMode,
      }).invoke({
        knowledgeBaseId,
        question,
        retrievalHistoryText: conversationContext.retrievalHistoryText,
        answerHistoryText: conversationContext.answerHistoryText,
        conversationSummaryText: conversationContext.summaryText,
        requestId,
      });
      const { retrievalQuestionResult, retrieved, resolvedPrompt } = preparedAnswer;

      if (!retrieved.candidates.length) {
        await this.persistQaLog({
          knowledgeBaseId,
          userId: user.sub,
          requestId,
          question,
          answer: '当前知识库里还没有可命中的内容，可以先上传文档或换个问法再试。',
          thinking: null,
          sourceCount: 0,
          durationMs: Date.now() - startedAt,
          success: false,
          errorMessage: 'NO_RETRIEVAL_CANDIDATES',
        });
        this.writeEvent(res, 'answer_delta', {
          type: 'answer_delta',
          delta: '当前知识库里还没有可命中的内容，可以先上传文档或换个问法再试。',
        });
        this.writeEvent(res, 'sources', {
          type: 'sources',
          items: [],
        });
        this.writeEvent(res, 'done', {
          type: 'done',
          durationMs: Date.now() - startedAt,
          sourceCount: 0,
        });
        this.logger.log(
          JSON.stringify({
            requestId,
            stage: 'rag_request_completed',
            durationMs: Date.now() - startedAt,
            sourceCount: 0,
            reason: 'no_retrieval_candidates',
            retrievalMetrics: retrieved.metrics,
          }),
        );
        return;
      }

      this.writeEvent(res, 'sources', {
        type: 'sources',
        items: retrieved.sources,
      });

      const llmStartedAt = Date.now();
      const chatModelInfo = this.modelService.getChatModelInfo();
      const model = this.modelService.createChatModel();
      this.writeEvent(res, 'loading', {
        type: 'loading',
        stage: 'generating_answer',
        message: '正在组织答案...',
      });

      const stream = await this.createAnswerGenerationChain(model).stream(resolvedPrompt);
      const llmRequestDurationMs = Date.now() - llmStartedAt;

      this.logger.log(
        JSON.stringify({
          requestId,
          stage: 'rag_answer_generation_started',
          chatModel: chatModelInfo.model,
          chatProvider: chatModelInfo.provider,
          answerStyle: knowledgeBase.answerStyle,
          citationMode: knowledgeBase.citationMode,
          strictMode: knowledgeBase.strictMode,
          llmRequestDurationMs,
          sourceCount: retrieved.sources.length,
          retrievalQuestion: retrievalQuestionResult.retrievalQuestion,
          retrievalQuestionRewritten: retrievalQuestionResult.rewritten,
          retrievalMetrics: retrieved.metrics,
        }),
      );

      let answer = '';
      let thinkingText = '';
      let answerChunkCount = 0;
      let firstChunkDurationMs: number | null = null;
      let thinkingStarted = false;
      let thinkingFinished = false;
      // 首包耗时是体验最敏感的指标，所以这里单独打点，便于定位慢点是在检索还是回答模型。
      for await (const chunk of stream) {
        const thinkingDelta = this.extractThinking(chunk);
        if (thinkingDelta) {
          thinkingStarted = true;
          thinkingText += thinkingDelta;
          this.writeEvent(res, 'thinking_delta', {
            type: 'thinking_delta',
            delta: thinkingDelta,
          });
        }

        const delta = this.extractText(chunk.content);
        if (!delta) {
          continue;
        }

        if (thinkingStarted && !thinkingFinished) {
          thinkingFinished = true;
          this.writeEvent(res, 'thinking_done', {
            type: 'thinking_done',
          });
        }

        answerChunkCount += 1;
        if (firstChunkDurationMs === null) {
          firstChunkDurationMs = Date.now() - llmStartedAt;
          this.logger.log(
            JSON.stringify({
              requestId,
              stage: 'rag_answer_first_chunk',
              firstChunkDurationMs,
            }),
          );
        }

        answer += delta;
        this.writeEvent(res, 'answer_delta', {
          type: 'answer_delta',
          delta,
        });
      }

      if (thinkingStarted && !thinkingFinished) {
        this.writeEvent(res, 'thinking_done', {
          type: 'thinking_done',
        });
      }

      const qaLogStartedAt = Date.now();
      await this.persistQaLog({
        knowledgeBaseId,
        userId: user.sub,
        requestId,
        question,
        answer,
        thinking: thinkingText || null,
        sourceCount: retrieved.sources.length,
        durationMs: Date.now() - startedAt,
        success: true,
      });
      await this.sessionMemoryService.appendTurn(
        {
          feature: 'knowledge_base',
          userId: user.sub,
          knowledgeBaseId,
          sessionId,
        },
        question,
        answer,
      );
      const qaLogDurationMs = Date.now() - qaLogStartedAt;
      const answerDurationMs = Date.now() - llmStartedAt;

      this.writeEvent(res, 'done', {
        type: 'done',
        durationMs: Date.now() - startedAt,
        sourceCount: retrieved.sources.length,
      });

      this.logger.log(
        JSON.stringify({
          requestId,
          stage: 'rag_request_completed',
          durationMs: Date.now() - startedAt,
          sessionId,
          sourceCount: retrieved.sources.length,
          answerLength: answer.length,
          answerChunkCount,
          answerDurationMs,
          firstChunkDurationMs,
          qaLogDurationMs,
          retrievalMetrics: retrieved.metrics,
        }),
      );
    } catch (error) {
      await this.persistQaLog({
        knowledgeBaseId,
        userId: user.sub,
        requestId,
        question,
        answer: null,
        thinking: null,
        sourceCount: 0,
        durationMs: Date.now() - startedAt,
        success: false,
        errorMessage: error instanceof Error ? error.message : '知识库问答失败，请稍后再试',
      });
      this.logger.error(
        JSON.stringify({
          requestId,
          stage: 'rag_stream_failed',
          knowledgeBaseId,
          question,
          sessionId,
          userId: user.sub,
          message: error instanceof Error ? error.message : String(error),
        }),
      );

      this.writeEvent(res, 'error', {
        type: 'error',
        code: 'RAG_STREAM_FAILED',
        message: error instanceof Error ? error.message : '知识库问答失败，请稍后再试',
      });
    } finally {
      res.end();
    }
  }

  // 统一封装 SSE 事件格式，避免每次手写字符串模板。
  private writeEvent(res: Response, event: string, payload: unknown) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  // LangChain 返回的 chunk content 结构不完全固定，这里做一次兼容性提取。
  private extractText(content: unknown) {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((item) => {
          if (typeof item === 'string') {
            return item;
          }

          if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') {
            return item.text;
          }

          return '';
        })
        .join('');
    }

    return '';
  }

  /**
   * 从 LangChain chunk 中尽量提取“思考过程”文本。
   *
   * 说明：
   * - 不同模型/适配层可能把 think 放在 additional_kwargs 或 response_metadata
   * - 这里做兼容提取，前端能优先看到模型思考过程，正文开始时再自动折叠
   */
  private extractThinking(chunk: unknown) {
    if (!chunk || typeof chunk !== 'object') {
      return '';
    }

    const objectChunk = chunk as {
      additional_kwargs?: Record<string, unknown>;
      response_metadata?: Record<string, unknown>;
    };

    return (
      this.normalizeThinkingValue(objectChunk.additional_kwargs?.reasoning_content) ||
      this.normalizeThinkingValue(objectChunk.additional_kwargs?.reasoning) ||
      this.normalizeThinkingValue(objectChunk.additional_kwargs?.thinking) ||
      this.normalizeThinkingValue(objectChunk.response_metadata?.reasoning_content) ||
      this.normalizeThinkingValue(objectChunk.response_metadata?.reasoning) ||
      this.normalizeThinkingValue(objectChunk.response_metadata?.thinking)
    );
  }

  private normalizeThinkingValue(value: unknown): string {
    if (!value) {
      return '';
    }

    if (typeof value === 'string') {
      return value;
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === 'string') {
            return item;
          }

          if (item && typeof item === 'object') {
            if ('text' in item && typeof item.text === 'string') {
              return item.text;
            }

            if ('content' in item && typeof item.content === 'string') {
              return item.content;
            }
          }

          return '';
        })
        .join('');
    }

    if (typeof value === 'object') {
      if ('text' in value && typeof value.text === 'string') {
        return value.text;
      }

      if ('content' in value && typeof value.content === 'string') {
        return value.content;
      }
    }

    return '';
  }

  /**
   * 多轮追问时，先把当前问题改写成适合检索的独立问题。
   *
   * 这样既能保留回答阶段的会话记忆，又避免直接拿整段历史做 embedding 污染召回。
   */
  private async resolveRetrievalQuestion(input: {
    question: string;
    retrievalHistoryText?: string;
    conversationSummaryText?: string;
    requestId?: string;
  }) {
    const retrievalHistoryText = input.retrievalHistoryText?.trim() ?? '';
    const conversationSummaryText = input.conversationSummaryText?.trim() ?? '';

    if (!retrievalHistoryText && !conversationSummaryText) {
      return {
        retrievalQuestion: input.question,
        rewritten: false,
      };
    }

    const startedAt = Date.now();

    try {
      const resolvedPrompt = await this.promptResolverService.resolveKnowledgeBaseRetrievalRewritePrompt({
        question: input.question,
        retrievalHistoryText,
        conversationSummaryText,
      });
      const model = this.modelService.createChatModel();
      const retrievalQuestion = this.normalizeRetrievalQuestion(
        await this.createRetrievalRewriteChain(model).invoke(resolvedPrompt),
        input.question,
      );

      this.logger.log(
        JSON.stringify({
          requestId: input.requestId,
          stage: 'rag_retrieval_question_resolved',
          durationMs: Date.now() - startedAt,
          rewritten: retrievalQuestion !== input.question,
          originalQuestion: input.question,
          retrievalQuestion,
        }),
      );

      return {
        retrievalQuestion,
        rewritten: retrievalQuestion !== input.question,
      };
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          requestId: input.requestId,
          stage: 'rag_retrieval_question_rewrite_failed',
          message: error instanceof Error ? error.message : String(error),
        }),
      );

      return {
        retrievalQuestion: input.question,
        rewritten: false,
      };
    }
  }

  private normalizeRetrievalQuestion(rawQuestion: string, fallbackQuestion: string) {
    const normalized = rawQuestion
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
      .replace(/^(检索问题|改写后问题|最终问题|问题)\s*[:：]\s*/i, '')
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean)
      .join(' ')
      .trim();

    return normalized || fallbackQuestion;
  }

  // 把“已解析 prompt -> LangChain 消息 -> chat model”收口成一条 Runnable，
  // 这样知识库回答链路就不需要在主流程里手动拼装消息数组了。
  private createAnswerGenerationChain(model: ReturnType<KnowledgeBaseModelService['createChatModel']>) {
    return RunnableSequence.from([
      RunnableLambda.from(this.formatResolvedPromptAsPromptValue.bind(this)),
      model,
    ]);
  }

  /**
   * 主链路里最重的“问题改写 -> 检索 -> Prompt 解析”三步收口成 Runnable，
   * 这样知识库问答在结构上更接近标准 RAG chain，而不是完全手写流程拼装。
   */
  private createAnswerPreparationChain(promptConfig: {
    systemPromptOverride: string | null;
    answerStyle: 'concise' | 'balanced' | 'detailed';
    citationMode: 'required' | 'optional' | 'hidden';
    strictMode: boolean;
  }) {
    return RunnableSequence.from([
      RunnablePassthrough.assign({
        retrievalQuestionResult: RunnableLambda.from(
          async (input: {
            question: string;
            retrievalHistoryText?: string;
            conversationSummaryText?: string;
            requestId?: string;
          }) =>
            this.resolveRetrievalQuestion({
              question: input.question,
              retrievalHistoryText: input.retrievalHistoryText,
              conversationSummaryText: input.conversationSummaryText,
              requestId: input.requestId,
            }),
        ),
      }),
      RunnablePassthrough.assign({
        retrieved: RunnableLambda.from(
          async (input: {
            knowledgeBaseId: string;
            requestId?: string;
            retrievalQuestionResult: {
              retrievalQuestion: string;
              rewritten: boolean;
            };
          }) =>
            this.retrievalService.retrieveContext(
              input.knowledgeBaseId,
              input.retrievalQuestionResult.retrievalQuestion,
              input.requestId,
            ),
        ),
      }),
      RunnablePassthrough.assign({
        resolvedPrompt: RunnableLambda.from(
          async (input: {
            question: string;
            answerHistoryText?: string;
            conversationSummaryText?: string;
            retrieved: {
              contextText: string;
            };
          }) =>
            this.promptResolverService.resolveKnowledgeBaseAnswerPrompt({
              promptConfig,
              question: input.question,
              contextText: input.retrieved.contextText,
              answerHistoryText: input.answerHistoryText,
              conversationSummaryText: input.conversationSummaryText,
            }),
        ),
      }),
    ]);
  }

  // 检索问题改写只需要最终字符串，因此这里直接接 StringOutputParser，
  // 保持“Prompt -> Model -> 文本”的标准 LangChain 链式结构。
  private createRetrievalRewriteChain(model: ReturnType<KnowledgeBaseModelService['createChatModel']>) {
    return RunnableSequence.from([
      RunnableLambda.from(this.formatResolvedPromptAsPromptValue.bind(this)),
      model,
      new StringOutputParser(),
    ]);
  }

  private async formatResolvedPromptAsPromptValue(input: {
    systemPrompt: string;
    userPrompt: string;
  }) {
    return buildResolvedChatMessages(input);
  }

  /**
   * 问答失败时也尽量保留日志，但日志写失败不能反过来把 SSE 主流程打断。
   *
   * 同时这里会跳过不存在的知识库，避免最早的 not found 错误被外键错误覆盖。
   */
  private async persistQaLog(data: {
    knowledgeBaseId: string;
    userId: string;
    requestId: string;
    question: string;
    answer: string | null;
    thinking: string | null;
    sourceCount: number;
    durationMs: number;
    success: boolean;
    errorMessage?: string;
  }) {
    try {
      const knowledgeBase = await this.prisma.knowledgeBase.findUnique({
        where: { id: data.knowledgeBaseId },
        select: { id: true },
      });

      if (!knowledgeBase) {
        return;
      }

      await this.prisma.qaLog.create({
        data,
      });
    } catch (logError) {
      this.logger.error(
        JSON.stringify({
          requestId: data.requestId,
          stage: 'qa_log_persist_failed',
          message: logError instanceof Error ? logError.message : String(logError),
        }),
      );
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { buildKnowledgeBaseAnswerPrompt } from '../ai/prompts';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeBaseModelService } from './knowledge-base-model.service';
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
  ) {
    const requestId = randomUUID();
    const startedAt = Date.now();

    this.logger.log(
      JSON.stringify({
        requestId,
        stage: 'rag_request_started',
        knowledgeBaseId,
        userId: user.sub,
      }),
    );

    this.writeEvent(res, 'meta', {
      type: 'meta',
      requestId,
      knowledgeBaseId,
      timestamp: new Date().toISOString(),
    });

    try {
      const knowledgeBaseCheckStartedAt = Date.now();
      await this.knowledgeBaseService.ensureKnowledgeBaseExists(knowledgeBaseId);
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

      // 先把检索阶段跑完，回答模型只消费预算后的上下文，避免 prompt 过大。
      const retrieved = await this.retrievalService.retrieveContext(knowledgeBaseId, question, requestId);

      if (!retrieved.candidates.length) {
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
      // prompt 单独收口后，后续调回答风格或补规则时不用再改问答主流程。
      const stream = await model.stream(
        buildKnowledgeBaseAnswerPrompt({
          question,
          contextText: retrieved.contextText,
        }),
      );
      const llmRequestDurationMs = Date.now() - llmStartedAt;

      this.logger.log(
        JSON.stringify({
          requestId,
          stage: 'rag_answer_generation_started',
          chatModel: chatModelInfo.model,
          chatProvider: chatModelInfo.provider,
          llmRequestDurationMs,
          sourceCount: retrieved.sources.length,
          retrievalMetrics: retrieved.metrics,
        }),
      );

      let answer = '';
      let answerChunkCount = 0;
      let firstChunkDurationMs: number | null = null;
      // 首包耗时是体验最敏感的指标，所以这里单独打点，便于定位慢点是在检索还是回答模型。
      for await (const chunk of stream) {
        const delta = this.extractText(chunk.content);
        if (!delta) {
          continue;
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

      const qaLogStartedAt = Date.now();
      await this.prisma.qaLog.create({
        data: {
          knowledgeBaseId,
          userId: user.sub,
          question,
          answer,
          sourceCount: retrieved.sources.length,
        },
      });
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
      this.logger.error(
        JSON.stringify({
          requestId,
          stage: 'rag_stream_failed',
          knowledgeBaseId,
          question,
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
}

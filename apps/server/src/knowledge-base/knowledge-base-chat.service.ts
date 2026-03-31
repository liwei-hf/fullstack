import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeBaseModelService } from './knowledge-base-model.service';
import { KnowledgeBaseRetrievalService } from './knowledge-base-retrieval.service';
import { KnowledgeBaseService } from './knowledge-base.service';
import type { AuthenticatedRequestUser } from './knowledge-base.types';

@Injectable()
export class KnowledgeBaseChatService {
  private readonly logger = new Logger(KnowledgeBaseChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly retrievalService: KnowledgeBaseRetrievalService,
    private readonly modelService: KnowledgeBaseModelService,
  ) {}

  async streamAnswer(
    knowledgeBaseId: string,
    question: string,
    user: AuthenticatedRequestUser,
    res: Response,
  ) {
    const requestId = randomUUID();
    const startedAt = Date.now();

    this.writeEvent(res, 'meta', {
      type: 'meta',
      requestId,
      knowledgeBaseId,
      timestamp: new Date().toISOString(),
    });

    try {
      await this.knowledgeBaseService.ensureKnowledgeBaseExists(knowledgeBaseId);
      const readyDocumentCount = await this.knowledgeBaseService.countReadyDocuments(knowledgeBaseId);

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
        return;
      }

      const retrieved = await this.retrievalService.retrieveContext(knowledgeBaseId, question);

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
        return;
      }

      this.writeEvent(res, 'sources', {
        type: 'sources',
        items: retrieved.sources,
      });

      const model = this.modelService.createChatModel();
      const stream = await model.stream(
        [
          '你是一个企业知识库问答助手。',
          '请只根据给定的文档上下文回答，不能虚构事实。',
          '如果上下文不能支持完整回答，要明确说明“当前文档里没有足够信息”。',
          '回答请使用中文，适合手机端阅读，先给结论，再补充关键依据。',
          '',
          `用户问题：${question}`,
          '',
          '知识库上下文：',
          retrieved.contextText,
        ].join('\n'),
      );

      let answer = '';
      for await (const chunk of stream) {
        const delta = this.extractText(chunk.content);
        if (!delta) {
          continue;
        }

        answer += delta;
        this.writeEvent(res, 'answer_delta', {
          type: 'answer_delta',
          delta,
        });
      }

      await this.prisma.qaLog.create({
        data: {
          knowledgeBaseId,
          userId: user.sub,
          question,
          answer,
          sourceCount: retrieved.sources.length,
        },
      });

      this.writeEvent(res, 'done', {
        type: 'done',
        durationMs: Date.now() - startedAt,
        sourceCount: retrieved.sources.length,
      });
    } catch (error) {
      this.logger.error(
        JSON.stringify({
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

  private writeEvent(res: Response, event: string, payload: unknown) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

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

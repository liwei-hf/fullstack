import { Injectable, Logger } from '@nestjs/common';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { KnowledgeBaseChunkStrategy } from '@fullstack/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  RAG_CHUNK_OVERLAP,
  RAG_CHUNK_SIZE,
  RAG_SOURCE_SNIPPET_MAX_CHARS,
} from './knowledge-base.constants';
import { fromPersistenceChunkStrategy } from './knowledge-base-chunk-strategy.util';
import { KnowledgeBaseParserService } from './knowledge-base-parser.service';
import { KnowledgeBaseCacheService } from './knowledge-base-cache.service';
import { KnowledgeBaseRetrievalService } from './knowledge-base-retrieval.service';
import { KnowledgeBaseStorageService } from './knowledge-base-storage.service';

@Injectable()
export class KnowledgeBaseIngestionService {
  private readonly logger = new Logger(KnowledgeBaseIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: KnowledgeBaseStorageService,
    private readonly parserService: KnowledgeBaseParserService,
    private readonly cacheService: KnowledgeBaseCacheService,
    private readonly retrievalService: KnowledgeBaseRetrievalService,
  ) {}

  /**
   * 上传接口只负责接收文件和建立文档记录，
   * 实际的解析、切片和向量化放到后台异步执行，避免阻塞上传请求。
   */
  async processDocument(
    documentId: string,
    options?: {
      rethrowOnFailure?: boolean;
    },
  ) {
    let knowledgeBaseId: string | null = null;
    try {
      await this.prisma.document.update({
        where: { id: documentId },
        data: {
          status: 'PROCESSING',
          failureReason: null,
        },
      });

      const document = await this.prisma.document.findUnique({
        where: { id: documentId },
      });

      if (!document) {
        return;
      }
      knowledgeBaseId = document.knowledgeBaseId;

      const fileBuffer = await this.storageService.getObjectBuffer(document.objectKey);
      const parsed = await this.parserService.parseDocument({
        originalname: document.fileName,
        mimetype: document.fileType,
        buffer: fileBuffer,
      });

      const chunkStrategy = fromPersistenceChunkStrategy(document.chunkStrategy);
      const chunks = await this.splitIntoChunks(parsed.content, chunkStrategy);

      await this.prisma.$transaction(async (tx) => {
        await tx.documentChunk.deleteMany({
          where: { documentId },
        });

        if (chunks.length > 0) {
          await tx.documentChunk.createMany({
            data: chunks.map((content: string, index: number) => ({
              documentId,
              sequence: index + 1,
              content,
              excerpt: content.slice(0, RAG_SOURCE_SNIPPET_MAX_CHARS),
              metadata: {
                fileType: parsed.fileType,
                chunkStrategy,
                knowledgeBaseId: document.knowledgeBaseId,
                documentId,
                documentName: document.fileName,
                sequence: index + 1,
                excerpt: content.slice(0, RAG_SOURCE_SNIPPET_MAX_CHARS),
              },
            })),
          });
        }

        await tx.document.update({
          where: { id: documentId },
          data: {
            fileType: parsed.fileType,
            chunkCount: chunks.length,
            characterCount: parsed.content.length,
          },
        });
      });

      const createdChunks = await this.prisma.documentChunk.findMany({
        where: { documentId },
        orderBy: { sequence: 'asc' },
        select: {
          id: true,
          content: true,
        },
      });

      if (createdChunks.length > 0) {
        await this.retrievalService.embedChunks(
          createdChunks.map((item) => item.id),
          createdChunks.map((item) => item.content),
        );
      }

      await this.prisma.document.update({
        where: { id: documentId },
        data: {
          status: 'READY',
          failureReason: null,
        },
      });
      await this.cacheService.invalidateKnowledgeBase(document.knowledgeBaseId);
    } catch (error) {
      this.logger.error(
        `文档处理失败: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.prisma.document.updateMany({
        where: { id: documentId },
        data: {
          status: 'FAILED',
          failureReason: error instanceof Error ? error.message : '文档处理失败',
        },
      });
      if (knowledgeBaseId) {
        await this.cacheService.invalidateKnowledgeBase(knowledgeBaseId);
      }
      if (options?.rethrowOnFailure) {
        throw error;
      }
    }
  }

  /**
   * 当前只保留两种切片模式：
   * - fixed：按固定窗口切，便于稳定控制 chunk 大小
   * - recursive：优先按自然语言边界切，再逐步回退到更细分隔符
   */
  private async splitIntoChunks(content: string, strategy: KnowledgeBaseChunkStrategy) {
    switch (strategy) {
      case 'recursive':
        return this.splitByRecursive(content);
      case 'fixed':
      default:
        return this.splitByFixedSize(content);
    }
  }

  private async splitByFixedSize(content: string) {
    const normalizedContent = content.replace(/\r\n/g, '\n').trim();
    if (!normalizedContent) {
      return [];
    }

    const chunks: string[] = [];
    const step = Math.max(1, RAG_CHUNK_SIZE - RAG_CHUNK_OVERLAP);

    for (let start = 0; start < normalizedContent.length; start += step) {
      const chunk = normalizedContent.slice(start, start + RAG_CHUNK_SIZE).trim();
      if (!chunk) {
        continue;
      }

      chunks.push(chunk);
      if (start + RAG_CHUNK_SIZE >= normalizedContent.length) {
        break;
      }
    }

    return this.normalizeChunkTexts(chunks);
  }

  private async splitByRecursive(content: string) {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: RAG_CHUNK_SIZE,
      chunkOverlap: RAG_CHUNK_OVERLAP,
      separators: ['\n\n', '\n', '。', '！', '？', '. ', '! ', '? ', '；', ';', '，', '、', ' ', ''],
    });

    return this.normalizeChunkTexts(await splitter.splitText(content));
  }

  private normalizeChunkTexts(chunks: string[]) {
    return chunks
      .map((chunk) => chunk.trim())
      .filter(Boolean);
  }
}

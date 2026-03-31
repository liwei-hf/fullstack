import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  RAG_CHUNK_OVERLAP,
  RAG_CHUNK_SIZE,
  RAG_SOURCE_SNIPPET_MAX_CHARS,
} from './knowledge-base.constants';
import { KnowledgeBaseParserService } from './knowledge-base-parser.service';
import { KnowledgeBaseRetrievalService } from './knowledge-base-retrieval.service';
import { KnowledgeBaseStorageService } from './knowledge-base-storage.service';

@Injectable()
export class KnowledgeBaseIngestionService {
  private readonly logger = new Logger(KnowledgeBaseIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: KnowledgeBaseStorageService,
    private readonly parserService: KnowledgeBaseParserService,
    private readonly retrievalService: KnowledgeBaseRetrievalService,
  ) {}

  /**
   * 上传接口只负责接收文件和建立文档记录，
   * 实际的解析、切片和向量化放到后台异步执行，避免阻塞上传请求。
   */
  async processDocument(documentId: string) {
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

      const fileBuffer = await this.storageService.getObjectBuffer(document.objectKey);
      const parsed = await this.parserService.parseDocument({
        originalname: document.fileName,
        mimetype: document.fileType,
        buffer: fileBuffer,
      });

      const chunks = this.splitIntoChunks(parsed.content);

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
    } catch (error) {
      this.logger.error(
        `文档处理失败: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.prisma.document.update({
        where: { id: documentId },
        data: {
          status: 'FAILED',
          failureReason: error instanceof Error ? error.message : '文档处理失败',
        },
      });
    }
  }

  /**
   * 这里先保留一个轻量递归切片实现：
   * - 优先按段落切，再按句子切，最后退化到固定窗口
   * - 这样能满足 MVP 的上下文连续性，也不会额外引入更多依赖路径不稳定因素
   */
  private splitIntoChunks(content: string) {
    const segments = content
      .split(/\n{2,}/)
      .map((item) => item.trim())
      .filter(Boolean);

    const chunks: string[] = [];
    let current = '';

    const pushCurrent = () => {
      if (current.trim()) {
        chunks.push(current.trim());
      }
      current = '';
    };

    for (const segment of segments) {
      if (!segment) {
        continue;
      }

      if ((current + '\n\n' + segment).trim().length <= RAG_CHUNK_SIZE) {
        current = current ? `${current}\n\n${segment}` : segment;
        continue;
      }

      pushCurrent();
      if (segment.length <= RAG_CHUNK_SIZE) {
        current = segment;
        continue;
      }

      const sentences = segment.split(/(?<=[。！？.!?])\s*/).filter(Boolean);
      for (const sentence of sentences) {
        if ((current + sentence).length <= RAG_CHUNK_SIZE) {
          current += sentence;
          continue;
        }

        pushCurrent();
        if (sentence.length <= RAG_CHUNK_SIZE) {
          current = sentence;
          continue;
        }

        for (let index = 0; index < sentence.length; index += RAG_CHUNK_SIZE - RAG_CHUNK_OVERLAP) {
          chunks.push(sentence.slice(index, index + RAG_CHUNK_SIZE).trim());
        }
        current = '';
      }
    }

    pushCurrent();
    return chunks.filter(Boolean);
  }
}

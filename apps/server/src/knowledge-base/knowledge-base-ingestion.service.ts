import { Injectable, Logger } from '@nestjs/common';
import {
  MarkdownTextSplitter,
  RecursiveCharacterTextSplitter,
} from '@langchain/textsplitters';
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
   * 这里先保留一个轻量递归切片实现：
   * - 优先按段落切，再按句子切，最后退化到固定窗口
   * - 这样能满足 MVP 的上下文连续性，也不会额外引入更多依赖路径不稳定因素
   */
  private async splitIntoChunks(content: string, strategy: KnowledgeBaseChunkStrategy) {
    switch (strategy) {
      case 'paragraph':
        return this.splitByParagraph(content);
      case 'heading':
        return this.splitByHeading(content);
      case 'fixed':
      default:
        return this.splitByFixedSize(content);
    }
  }

  private async splitByFixedSize(content: string) {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: RAG_CHUNK_SIZE,
      chunkOverlap: RAG_CHUNK_OVERLAP,
      separators: [''],
    });

    return this.normalizeChunkTexts(await splitter.splitText(content));
  }

  private async splitByParagraph(content: string) {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: RAG_CHUNK_SIZE,
      chunkOverlap: RAG_CHUNK_OVERLAP,
      separators: ['\n\n', '\n', '。', '！', '？', '. ', '! ', '? ', '；', ';', '，', '、', ' ', ''],
    });

    return this.normalizeChunkTexts(await splitter.splitText(content));
  }

  private async splitByHeading(content: string) {
    const sections = this.splitSectionsByHeading(content);
    if (sections.length === 0) {
      return this.splitByParagraph(content);
    }

    const markdownSplitter = new MarkdownTextSplitter({
      chunkSize: RAG_CHUNK_SIZE,
      chunkOverlap: RAG_CHUNK_OVERLAP,
    });
    const paragraphSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: RAG_CHUNK_SIZE,
      chunkOverlap: RAG_CHUNK_OVERLAP,
      separators: ['\n\n', '\n', '。', '！', '？', '. ', '! ', '? ', '；', ';', '，', '、', ' ', ''],
    });

    const allChunks: string[] = [];
    for (const section of sections) {
      const normalizedSection = this.toMarkdownHeadingSection(section);
      const splitSections = await markdownSplitter.splitText(normalizedSection);

      for (const chunk of splitSections) {
        const restoredChunk = this.restoreArtificialMarkdownHeading(chunk);
        if (restoredChunk.length <= RAG_CHUNK_SIZE) {
          allChunks.push(restoredChunk);
          continue;
        }

        allChunks.push(...(await paragraphSplitter.splitText(restoredChunk)));
      }
    }

    return this.normalizeChunkTexts(allChunks);
  }

  private isHeadingLine(line: string) {
    return (
      /^#{1,6}\s+/.test(line) ||
      /^第[\d一二三四五六七八九十百千]+[章节条]\s*/.test(line) ||
      /^[\d]+(\.[\d]+)*[、.)．]?\s+/.test(line) ||
      /^[一二三四五六七八九十百千]+[、.．]\s*/.test(line)
    );
  }

  private splitSectionsByHeading(content: string) {
    const lines = content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const sections: string[] = [];
    let currentHeading = '';
    let currentBody: string[] = [];

    const pushSection = () => {
      const section = [currentHeading, ...currentBody].filter(Boolean).join('\n');
      if (section.trim()) {
        sections.push(section.trim());
      }
      currentHeading = '';
      currentBody = [];
    };

    for (const line of lines) {
      if (this.isHeadingLine(line)) {
        pushSection();
        currentHeading = line;
        continue;
      }

      currentBody.push(line);
    }

    pushSection();
    return sections;
  }

  // MarkdownTextSplitter 更擅长吃 markdown heading，因此这里把中文编号标题
  // 先标准化成 markdown 形式，再交给 LangChain 做真正的 chunk 切分。
  private toMarkdownHeadingSection(section: string) {
    return section
      .split('\n')
      .map((line) => {
        if (!line.trim()) {
          return '';
        }

        if (line.trim().startsWith('#')) {
          return line;
        }

        if (this.isHeadingLine(line)) {
          return `## ${line}`;
        }

        return line;
      })
      .join('\n');
  }

  private restoreArtificialMarkdownHeading(content: string) {
    return content
      .split('\n')
      .map((line) => {
        if (!line.startsWith('## ')) {
          return line;
        }

        const normalizedLine = line.slice(3).trim();
        return this.isHeadingLine(normalizedLine) ? normalizedLine : line;
      })
      .join('\n');
  }

  private normalizeChunkTexts(chunks: string[]) {
    return chunks
      .map((chunk) => chunk.trim())
      .filter(Boolean);
  }
}

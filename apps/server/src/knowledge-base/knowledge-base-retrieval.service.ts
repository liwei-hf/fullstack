import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  RAG_CONTEXT_MAX_CHARS,
  RAG_FINAL_CONTEXT_MAX_CHUNKS,
  RAG_MAX_CHUNKS_PER_DOCUMENT,
  RAG_SOURCE_SNIPPET_MAX_CHARS,
  RAG_VECTOR_TOP_K,
} from './knowledge-base.constants';
import { KnowledgeBaseModelService } from './knowledge-base-model.service';
import { KnowledgeBaseRerankService } from './knowledge-base-rerank.service';
import type { RetrievalCandidate } from './knowledge-base.types';

@Injectable()
export class KnowledgeBaseRetrievalService {
  private readonly logger = new Logger(KnowledgeBaseRetrievalService.name);
  private vectorReady = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly modelService: KnowledgeBaseModelService,
    private readonly rerankService: KnowledgeBaseRerankService,
  ) {}

  async ensureVectorSupport() {
    if (this.vectorReady) {
      return;
    }

    try {
      await this.prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector');
      await this.prisma.$executeRawUnsafe(
        'ALTER TABLE "DocumentChunk" ADD COLUMN IF NOT EXISTS embedding vector',
      );
      this.vectorReady = true;
    } catch (error) {
      throw new InternalServerErrorException(
        `pgvector 初始化失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async embedChunks(chunkIds: string[], contents: string[]) {
    await this.ensureVectorSupport();
    const embeddings = await this.modelService.createEmbeddingModel().embedDocuments(contents);

    for (let index = 0; index < chunkIds.length; index += 1) {
      const chunkId = chunkIds[index];
      const embedding = embeddings[index];
      const vectorLiteral = this.vectorToSqlLiteral(embedding);

      await this.prisma.$executeRawUnsafe(
        `UPDATE "DocumentChunk" SET embedding = '${vectorLiteral}'::vector WHERE id = $1`,
        chunkId,
      );
    }
  }

  async retrieveContext(knowledgeBaseId: string, question: string) {
    await this.ensureVectorSupport();
    const [queryEmbedding] = await this.modelService
      .createEmbeddingModel()
      .embedDocuments([question]);

    const vectorLiteral = this.vectorToSqlLiteral(queryEmbedding);
    const rows = await this.prisma.$queryRawUnsafe<RetrievalCandidate[]>(
      `
        SELECT
          c.id AS "chunkId",
          c."documentId" AS "documentId",
          d."fileName" AS "documentName",
          c.sequence AS "sequence",
          c.content AS "content",
          c.excerpt AS "excerpt",
          1 - (c.embedding <=> '${vectorLiteral}'::vector) AS "score"
        FROM "DocumentChunk" c
        INNER JOIN "Document" d ON d.id = c."documentId"
        WHERE d."knowledgeBaseId" = $1
          AND d.status = 'READY'
          AND c.embedding IS NOT NULL
        ORDER BY c.embedding <=> '${vectorLiteral}'::vector
        LIMIT ${RAG_VECTOR_TOP_K}
      `,
      knowledgeBaseId,
    );

    if (!rows.length) {
      return {
        candidates: [] as RetrievalCandidate[],
        sources: [],
        contextText: '',
      };
    }

    const reranked = await this.rerankService.rerank(
      question,
      rows.map((row) => ({
        ...row,
        score: Number(row.score),
      })),
    );
    const selected = this.buildContext(reranked);

    return {
      candidates: selected,
      sources: selected.map((item) => ({
        documentId: item.documentId,
        documentName: item.documentName,
        chunkId: item.chunkId,
        snippet: item.excerpt.slice(0, RAG_SOURCE_SNIPPET_MAX_CHARS),
      })),
      contextText: selected
        .map((item, index) => {
          return [
            `片段 ${index + 1}`,
            `文档：${item.documentName}`,
            `内容：${item.content}`,
          ].join('\n');
        })
        .join('\n\n'),
    };
  }

  private buildContext(candidates: RetrievalCandidate[]) {
    const selected: RetrievalCandidate[] = [];
    const documentUsage = new Map<string, number>();
    let currentChars = 0;

    for (const candidate of candidates) {
      if (selected.length >= RAG_FINAL_CONTEXT_MAX_CHUNKS) {
        break;
      }

      const used = documentUsage.get(candidate.documentId) ?? 0;
      if (used >= RAG_MAX_CHUNKS_PER_DOCUMENT) {
        continue;
      }

      if (currentChars + candidate.content.length > RAG_CONTEXT_MAX_CHARS) {
        continue;
      }

      selected.push(candidate);
      documentUsage.set(candidate.documentId, used + 1);
      currentChars += candidate.content.length;
    }

    this.logger.log(
      JSON.stringify({
        stage: 'rag_context_built',
        selectedCount: selected.length,
        finalContextChars: currentChars,
      }),
    );

    return selected;
  }

  private vectorToSqlLiteral(vector: number[]) {
    return `[${vector.map((value) => Number(value).toFixed(8)).join(',')}]`;
  }
}

import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  RAG_CONTEXT_MAX_CHARS,
  RAG_FINAL_CONTEXT_MAX_CHUNKS,
  RAG_MAX_CHUNKS_PER_DOCUMENT,
  RAG_SOURCE_SNIPPET_MAX_CHARS,
  RAG_VECTOR_TOP_K,
} from './knowledge-base.constants';
import { normalizeDocumentFileName } from './knowledge-base-file-name.util';
import { KnowledgeBaseModelService } from './knowledge-base-model.service';
import { KnowledgeBaseRerankService } from './knowledge-base-rerank.service';
import type { RagRetrievalResult, RetrievalCandidate } from './knowledge-base.types';

/**
 * 检索服务
 *
 * 负责向量召回、rerank、上下文预算控制，以及最终给回答模型准备上下文文本。
 */
@Injectable()
export class KnowledgeBaseRetrievalService {
  private readonly logger = new Logger(KnowledgeBaseRetrievalService.name);
  private vectorReady = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly modelService: KnowledgeBaseModelService,
    private readonly rerankService: KnowledgeBaseRerankService,
  ) {}

  // pgvector 是检索层的底座，这里启动时按需兜底，避免首次调用直接报错。
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

  /**
   * 文档向量化
   *
   * ingestion 在切片完成后调用这个方法，把 chunk 文本批量转成 embedding，
   * 再写回 DocumentChunk.embedding，供后续相似度检索使用。
   */
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

  /**
   * 检索当前知识库上下文
   *
   * 流程：
   * 1. 对用户问题做 embedding
   * 2. 在 pgvector 中召回 topK 候选
   * 3. 可选 rerank
   * 4. 按字符预算和单文档数量上限裁剪上下文
   */
  async retrieveContext(
    knowledgeBaseId: string,
    question: string,
    requestId?: string,
  ): Promise<RagRetrievalResult> {
    const retrievalStartedAt = Date.now();
    const embeddingModelInfo = this.modelService.getEmbeddingModelInfo();
    const rerankModelInfo = this.modelService.getRerankModelInfo();

    const vectorSupportStartedAt = Date.now();
    await this.ensureVectorSupport();
    const vectorSupportDurationMs = Date.now() - vectorSupportStartedAt;

    const queryEmbeddingStartedAt = Date.now();
    const embeddingModel = this.modelService.createEmbeddingModel();
    // 查询向量和文档向量分开处理，更符合 embedding 模型的设计意图，
    // 比直接对单条 query 调用 embedDocuments 更稳一些。
    const queryEmbedding = await embeddingModel.embedQuery(question);
    const queryEmbeddingDurationMs = Date.now() - queryEmbeddingStartedAt;

    const vectorLiteral = this.vectorToSqlLiteral(queryEmbedding);
    const vectorQueryStartedAt = Date.now();
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
    const vectorQueryDurationMs = Date.now() - vectorQueryStartedAt;

    if (!rows.length) {
      const metrics = {
        vectorSupportDurationMs,
        queryEmbeddingDurationMs,
        vectorQueryDurationMs,
        rerankDurationMs: 0,
        contextBuildDurationMs: 0,
        totalRetrievalDurationMs: Date.now() - retrievalStartedAt,
        initialCandidateCount: 0,
        finalCandidateCount: 0,
        finalContextChars: 0,
        rerankApplied: false,
      };

      this.logger.log(
        JSON.stringify({
          requestId,
          stage: 'rag_retrieval_completed',
          embeddingModel: embeddingModelInfo.model,
          embeddingProvider: embeddingModelInfo.provider,
          rerankModel: rerankModelInfo?.model ?? null,
          rerankProvider: rerankModelInfo?.provider ?? null,
          ...metrics,
        }),
      );

      return {
        candidates: [] as RetrievalCandidate[],
        sources: [],
        contextText: '',
        metrics,
      };
    }

    const rerankStartedAt = Date.now();
    const reranked = await this.rerankService.rerank(
      question,
      rows.map((row) => ({
        ...row,
        documentName: normalizeDocumentFileName(row.documentName),
        score: Number(row.score),
      })),
    );
    const rerankDurationMs = Date.now() - rerankStartedAt;

    const contextBuildStartedAt = Date.now();
    const { selected, finalContextChars } = this.buildContext(reranked);
    const contextBuildDurationMs = Date.now() - contextBuildStartedAt;
    const metrics = {
      vectorSupportDurationMs,
      queryEmbeddingDurationMs,
      vectorQueryDurationMs,
      rerankDurationMs,
      contextBuildDurationMs,
      totalRetrievalDurationMs: Date.now() - retrievalStartedAt,
      initialCandidateCount: rows.length,
      finalCandidateCount: selected.length,
      finalContextChars,
      rerankApplied: true,
    };

    this.logger.log(
      JSON.stringify({
        requestId,
        stage: 'rag_retrieval_completed',
        embeddingModel: embeddingModelInfo.model,
        embeddingProvider: embeddingModelInfo.provider,
        rerankModel: rerankModelInfo?.model ?? null,
        rerankProvider: rerankModelInfo?.provider ?? null,
        ...metrics,
      }),
    );

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
      metrics,
    };
  }

  // 最终上下文不是简单取前 N 条，而是同时受总 chunk 数、单文档占比和字符预算控制。
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

    return {
      selected,
      finalContextChars: currentChars,
    };
  }

  // pgvector 需要把 number[] 序列化成 vector literal，这里统一处理精度和格式。
  private vectorToSqlLiteral(vector: number[]) {
    return `[${vector.map((value) => Number(value).toFixed(8)).join(',')}]`;
  }
}

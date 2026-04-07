import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import { Document } from '@langchain/core/documents';
import { BaseRetriever } from '@langchain/core/retrievers';
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
import type {
  RagRetrievalResult,
  RetrievalCandidate,
  RetrievalDocumentMetadata,
} from './knowledge-base.types';

class KnowledgeBasePgVectorRetriever extends BaseRetriever {
  lc_namespace = ['fullstack', 'knowledge_base', 'retriever'];

  constructor(
    private readonly options: {
      knowledgeBaseId: string;
      topK: number;
      vectorStore: PGVectorStore;
      mapDocument: (
        document: Document<Record<string, unknown>>,
        score:
          | number
          | {
              distance: number;
              similarity: number;
            },
      ) => Document<RetrievalDocumentMetadata>;
      filterReadyDocuments: (
        documents: Document<RetrievalDocumentMetadata>[],
      ) => Promise<Document<RetrievalDocumentMetadata>[]>;
    },
  ) {
    super({});
  }

  async _getRelevantDocuments(query: string) {
    const results = await this.options.vectorStore.similaritySearchWithScore(query, this.options.topK, {
      knowledgeBaseId: this.options.knowledgeBaseId,
    });

    const documents = results.map(([document, score]) => this.options.mapDocument(document, score));
    return this.options.filterReadyDocuments(documents);
  }
}

/**
 * 检索服务
 *
 * 负责向量召回、rerank、上下文预算控制，以及最终给回答模型准备上下文文本。
 */
@Injectable()
export class KnowledgeBaseRetrievalService {
  private readonly logger = new Logger(KnowledgeBaseRetrievalService.name);
  private vectorReady = false;
  private vectorStorePromise: Promise<PGVectorStore> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
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
      // LangChain PGVectorStore 主要通过 metadata 做过滤，因此这里顺手把历史 chunk
      // 也补齐成统一结构，避免切到新的检索层后老数据无法按知识库隔离。
      await this.prisma.$executeRawUnsafe(`
        UPDATE "DocumentChunk" c
        SET metadata = COALESCE(c.metadata::jsonb, '{}'::jsonb) || jsonb_build_object(
          'chunkId', c.id,
          'knowledgeBaseId', d."knowledgeBaseId",
          'documentId', d.id,
          'documentName', d."fileName",
          'sequence', c.sequence,
          'excerpt', c.excerpt
        )
        FROM "Document" d
        WHERE d.id = c."documentId"
          AND (
            c.metadata IS NULL
            OR NOT (c.metadata::jsonb ? 'knowledgeBaseId')
            OR NOT (c.metadata::jsonb ? 'documentId')
            OR NOT (c.metadata::jsonb ? 'documentName')
            OR NOT (c.metadata::jsonb ? 'sequence')
            OR NOT (c.metadata::jsonb ? 'excerpt')
            OR NOT (c.metadata::jsonb ? 'chunkId')
          )
      `);
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
        `UPDATE "DocumentChunk"
         SET embedding = '${vectorLiteral}'::vector,
             metadata = COALESCE(metadata::jsonb, '{}'::jsonb) || jsonb_build_object('chunkId', id)
         WHERE id = $1`,
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

    const vectorQueryStartedAt = Date.now();
    const retriever = await this.createRetriever(knowledgeBaseId);
    const retrievedDocuments = await retriever.invoke(question);
    const rows = retrievedDocuments.map((document) =>
      this.toRetrievalCandidate(document as Document<RetrievalDocumentMetadata>),
    );
    const vectorQueryDurationMs = Date.now() - vectorQueryStartedAt;
    const queryEmbeddingDurationMs = 0;

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
        documents: [],
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
    const { selected, documents, finalContextChars } = this.buildContext(reranked);
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
      documents,
      sources: selected.map((item) => ({
        documentId: item.documentId,
        documentName: item.documentName,
        chunkId: item.chunkId,
        snippet: item.excerpt.slice(0, RAG_SOURCE_SNIPPET_MAX_CHARS),
      })),
      contextText: this.buildContextText(documents),
      metrics,
    };
  }

  // 最终上下文不是简单取前 N 条，而是同时受总 chunk 数、单文档占比和字符预算控制。
  private buildContext(candidates: RetrievalCandidate[]) {
    const selected: RetrievalCandidate[] = [];
    const documents: Document<RetrievalDocumentMetadata>[] = [];
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
      documents.push(this.toLangChainDocument(candidate));
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
      documents,
      finalContextChars: currentChars,
    };
  }

  private buildContextText(documents: Document<RetrievalDocumentMetadata>[]) {
    return documents
      .map((document, index) => {
        return [
          `片段 ${index + 1}`,
          `文档：${document.metadata.documentName}`,
          `内容：${document.pageContent}`,
        ].join('\n');
      })
      .join('\n\n');
  }

  private toLangChainDocument(candidate: RetrievalCandidate) {
    return new Document<RetrievalDocumentMetadata>({
      pageContent: candidate.content,
      metadata: {
        chunkId: candidate.chunkId,
        documentId: candidate.documentId,
        documentName: candidate.documentName,
        sequence: candidate.sequence,
        score: candidate.score,
        excerpt: candidate.excerpt,
      },
    });
  }

  async createRetriever(knowledgeBaseId: string) {
    const vectorStore = await this.getVectorStore();

    return new KnowledgeBasePgVectorRetriever({
      knowledgeBaseId,
      topK: RAG_VECTOR_TOP_K,
      vectorStore,
      mapDocument: this.toRetrieverDocument.bind(this),
      filterReadyDocuments: this.filterReadyDocuments.bind(this),
    });
  }

  /**
   * 统一初始化 LangChain 的 PGVectorStore。
   *
   * 这里直接复用现有 DocumentChunk 表，而不是额外新建一套向量表，
   * 这样可以保持当前 Prisma 数据模型和历史数据恢复流程不变。
   */
  private async getVectorStore() {
    await this.ensureVectorSupport();

    if (!this.vectorStorePromise) {
      const databaseUrl = this.configService.get<string>('DATABASE_URL');
      if (!databaseUrl) {
        throw new InternalServerErrorException('缺少 DATABASE_URL 配置');
      }

      this.vectorStorePromise = PGVectorStore.initialize(
        this.modelService.createEmbeddingModel(),
        {
          postgresConnectionOptions: {
            connectionString: databaseUrl,
          },
          tableName: '"DocumentChunk"',
          columns: {
            idColumnName: 'id',
            vectorColumnName: 'embedding',
            contentColumnName: 'content',
            metadataColumnName: 'metadata',
          },
          distanceStrategy: 'cosine',
          scoreNormalization: 'similarity',
        },
      ).catch((error) => {
        this.vectorStorePromise = null;
        throw new InternalServerErrorException(
          `LangChain PGVectorStore 初始化失败：${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }

    return this.vectorStorePromise;
  }

  // Document 状态仍由业务层掌控，避免把“只有 READY 文档能被检索”这条规则泄漏到向量库配置里。
  private async filterReadyDocuments(documents: Document<RetrievalDocumentMetadata>[]) {
    if (!documents.length) {
      return [];
    }

    const documentIds = Array.from(new Set(documents.map((item) => item.metadata.documentId)));
    const readyDocuments = await this.prisma.document.findMany({
      where: {
        id: {
          in: documentIds,
        },
        status: 'READY',
      },
      select: {
        id: true,
      },
    });
    const readyDocumentIds = new Set(readyDocuments.map((item) => item.id));

    return documents.filter((item) => readyDocumentIds.has(item.metadata.documentId));
  }

  private toRetrieverDocument(
    document: Document<Record<string, unknown>>,
    score:
      | number
      | {
          distance: number;
          similarity: number;
        },
  ): Document<RetrievalDocumentMetadata> {
    const metadata = document.metadata ?? {};

    return new Document<RetrievalDocumentMetadata>({
      pageContent: document.pageContent,
      metadata: {
        chunkId: String(metadata.chunkId ?? ''),
        documentId: String(metadata.documentId ?? ''),
        documentName: normalizeDocumentFileName(String(metadata.documentName ?? '未命名文档')),
        sequence: Number(metadata.sequence ?? 0),
        excerpt:
          typeof metadata.excerpt === 'string'
            ? metadata.excerpt
            : document.pageContent.slice(0, RAG_SOURCE_SNIPPET_MAX_CHARS),
        score: typeof score === 'number' ? score : score.similarity,
      },
    });
  }

  private toRetrievalCandidate(document: Document<RetrievalDocumentMetadata>): RetrievalCandidate {
    return {
      chunkId: document.metadata.chunkId,
      documentId: document.metadata.documentId,
      documentName: document.metadata.documentName,
      sequence: document.metadata.sequence,
      content: document.pageContent,
      excerpt: document.metadata.excerpt,
      score: document.metadata.score,
    };
  }

  // pgvector 需要把 number[] 序列化成 vector literal，这里统一处理精度和格式。
  private vectorToSqlLiteral(vector: number[]) {
    return `[${vector.map((value) => Number(value).toFixed(8)).join(',')}]`;
  }
}

import type { Document } from '@langchain/core/documents';
import type { Response } from 'express';

// 从 JWT 中解析出的最小用户信息，供知识库模块内部复用。
export interface AuthenticatedRequestUser {
  sub: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled';
  sessionId?: string;
}

// 解析器统一返回的纯文本结构，后续切片不需要再关心文件原始格式。
export interface ParsedDocumentPayload {
  fileType: string;
  content: string;
}

// 单个检索候选 chunk 的统一结构，向量检索和 rerank 都围绕它工作。
export interface RetrievalCandidate {
  chunkId: string;
  documentId: string;
  documentName: string;
  sequence: number;
  content: string;
  excerpt: string;
  score: number;
}

export interface RetrievalDocumentMetadata {
  chunkId: string;
  documentId: string;
  documentName: string;
  sequence: number;
  score: number;
  excerpt: string;
}

// 检索阶段的耗时指标，用于定位慢点是在 embedding、向量查询还是 rerank。
export interface RagRetrievalMetrics {
  vectorSupportDurationMs: number;
  queryEmbeddingDurationMs: number;
  vectorQueryDurationMs: number;
  rerankDurationMs: number;
  contextBuildDurationMs: number;
  totalRetrievalDurationMs: number;
  initialCandidateCount: number;
  finalCandidateCount: number;
  finalContextChars: number;
  rerankApplied: boolean;
}

// 检索服务最终返回给问答服务的结构，包含候选、引用来源和上下文文本。
export interface RagRetrievalResult {
  candidates: RetrievalCandidate[];
  documents: Document<RetrievalDocumentMetadata>[];
  sources: Array<{
    documentId: string;
    documentName: string;
    chunkId: string;
    snippet: string;
  }>;
  contextText: string;
  metrics: RagRetrievalMetrics;
}

// SSE 问答链路里常用的上下文结构，后续如果扩展工具调用可继续复用。
export interface RagStreamContext {
  knowledgeBaseId: string;
  question: string;
  user: AuthenticatedRequestUser;
  res: Response;
}

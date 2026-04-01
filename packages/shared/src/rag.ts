/**
 * 文档知识库与 RAG 问答相关共享类型
 *
 * 用途说明：
 * - 统一管理知识库、文档、问答流式事件的跨端契约
 * - 让管理端、手机端和服务端在同一套结构上联调
 * - 为后续接入更多文档状态、引用来源和评估日志预留边界
 */

/**
 * 文档处理状态
 *
 * 说明：
 * - UPLOADED: 元数据已入库，等待后台处理
 * - PROCESSING: 正在解析、切片和向量化
 * - READY: 可参与检索和问答
 * - FAILED: 处理失败
 * - DELETING: 正在删除，已从检索中剔除
 * - DELETE_FAILED: 删除失败，等待重试
 */
export const KNOWLEDGE_BASE_STATUSES = [
  'UPLOADED',
  'PROCESSING',
  'READY',
  'FAILED',
  'DELETING',
  'DELETE_FAILED',
] as const;

export type KnowledgeBaseStatus = (typeof KNOWLEDGE_BASE_STATUSES)[number];

/**
 * 文档切片策略
 *
 * 说明：
 * - fixed: 固定长度切片，适合通用文档和 MVP 默认策略
 * - paragraph: 段落优先切片，适合制度、手册等自然正文
 * - heading: 标题结构切片，适合章节层级清晰的文档
 */
export const KNOWLEDGE_BASE_CHUNK_STRATEGIES = [
  'fixed',
  'paragraph',
  'heading',
] as const;

export type KnowledgeBaseChunkStrategy = (typeof KNOWLEDGE_BASE_CHUNK_STRATEGIES)[number];

/**
 * 知识库列表项
 */
export interface KnowledgeBaseItem {
  id: string;
  name: string;
  description: string | null;
  documentCount: number;
  readyDocumentCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 知识库详情
 */
export interface KnowledgeBaseDetail extends KnowledgeBaseItem {
  createdBy: {
    id: string;
    username: string;
  };
}

/**
 * 文档列表项
 */
export interface KnowledgeBaseDocumentItem {
  id: string;
  knowledgeBaseId: string;
  fileName: string;
  fileType: string;
  chunkStrategy: KnowledgeBaseChunkStrategy;
  objectKey: string;
  status: KnowledgeBaseStatus;
  chunkCount: number;
  characterCount: number;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  uploadedBy: {
    id: string;
    username: string;
  };
}

/**
 * 创建知识库请求
 */
export interface CreateKnowledgeBaseRequest {
  name: string;
  description?: string;
}

/**
 * RAG 问答请求
 */
export interface RagChatStreamRequest {
  question: string;
}

/**
 * 上传文档请求
 */
export interface UploadKnowledgeBaseDocumentRequest {
  chunkStrategy: KnowledgeBaseChunkStrategy;
}

/**
 * 引用来源
 */
export interface RagSourceItem {
  documentId: string;
  documentName: string;
  chunkId: string;
  snippet: string;
}

/**
 * RAG 流式事件
 */
export type RagSseEvent =
  | {
      type: 'meta';
      requestId: string;
      knowledgeBaseId: string;
      timestamp: string;
    }
  | {
      type: 'answer_delta';
      delta: string;
    }
  | {
      type: 'sources';
      items: RagSourceItem[];
    }
  | {
      type: 'done';
      durationMs: number;
      sourceCount: number;
    }
  | {
      type: 'error';
      code: string;
      message: string;
    };

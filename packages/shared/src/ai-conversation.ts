import type { RagSourceItem } from './rag';

/**
 * AI 会话类型
 *
 * 用途说明：
 * - sql: 智能问数
 * - knowledge_base: 知识库问答
 * - 让两端在同一套本地会话模型上承载连续对话
 */
export const AI_CONVERSATION_KINDS = ['sql', 'knowledge_base'] as const;

export type AiConversationKind = (typeof AI_CONVERSATION_KINDS)[number];

/**
 * 消息角色
 */
export const AI_CONVERSATION_ROLES = ['user', 'assistant'] as const;

export type AiConversationRole = (typeof AI_CONVERSATION_ROLES)[number];

/**
 * 消息状态
 */
export const AI_CONVERSATION_MESSAGE_STATUSES = ['streaming', 'done', 'error'] as const;

export type AiConversationMessageStatus = (typeof AI_CONVERSATION_MESSAGE_STATUSES)[number];

/**
 * 单条会话消息
 *
 * 说明：
 * - assistant 消息可以附带 SQL、引用来源和 think 文本
 * - 每轮回答都保存自己的辅助信息，避免被后续追问覆盖
 */
export interface AiConversationMessage {
  id: string;
  role: AiConversationRole;
  content: string;
  createdAt: string;
  status: AiConversationMessageStatus;
  sessionId?: string;
  sql?: string;
  sqlExpanded?: boolean;
  sources?: RagSourceItem[];
  sourcesExpanded?: boolean;
  thinking?: string;
  thinkingExpanded?: boolean;
  loadingMessage?: string;
  errorMessage?: string;
}

/**
 * 会话元信息
 *
 * 说明：
 * - knowledgeBaseId 只在知识库问答场景下使用
 * - title 由第一轮问题自动生成
 */
export interface AiConversationSession {
  id: string;
  kind: AiConversationKind;
  title: string;
  createdAt: string;
  updatedAt: string;
  sessionId?: string;
  knowledgeBaseId?: string;
  lastMessagePreview?: string;
  messages: AiConversationMessage[];
}

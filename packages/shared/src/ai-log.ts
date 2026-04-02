/**
 * AI 问答日志共享契约
 *
 * 用于把“智能问数”和“知识库问答”的历史记录统一成前后端都能理解的结构，
 * 管理端日志页可以直接按类型切换，不需要关心底层分别来自哪张表。
 */
export const AI_LOG_TYPES = ['sql_query', 'knowledge_base'] as const;
export type AiLogType = (typeof AI_LOG_TYPES)[number];

export interface AiLogItem {
  id: string;
  type: AiLogType;
  requestId: string | null;
  question: string;
  answer: string | null;
  success: boolean;
  errorMessage: string | null;
  durationMs: number | null;
  rowCount: number | null;
  sourceCount: number | null;
  createdAt: string;
  knowledgeBase: {
    id: string;
    name: string;
  } | null;
}

/**
 * AI 问答日志详情
 *
 * 列表页只需要摘要字段，但详情抽屉需要拿到 SQL 或 think 这类补充内容，
 * 所以这里额外定义一份详情模型，避免列表接口越来越重。
 */
export interface AiLogDetailItem extends AiLogItem {
  sql: string | null;
  thinking: string | null;
}

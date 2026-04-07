import type { AiSqlVisibility } from './ai';

/**
 * AI 相关系统设置契约
 *
 * 当前先承接智能问数的 SQL 展示策略，
 * 后续如果继续扩展 AI 配置页，可以沿用这组契约继续向下加字段。
 */
export interface AiSettings {
  sqlVisibility: AiSqlVisibility;
}

export interface UpdateAiSettingsRequest {
  sqlVisibility: AiSqlVisibility;
}

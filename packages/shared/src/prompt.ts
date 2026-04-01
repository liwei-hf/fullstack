/**
 * Prompt 管理相关共享契约
 *
 * 用途：
 * - 统一管理后台、服务端对 Prompt 模板、版本和测试日志的数据结构
 * - 支持后续做 Prompt 版本发布、回滚和测试台
 */

export const PROMPT_TEMPLATE_CODES = [
  'sql_generation',
  'sql_answer',
  'knowledge_base_answer',
] as const;

export type PromptTemplateCode = (typeof PROMPT_TEMPLATE_CODES)[number];

export const PROMPT_SCENES = ['nl2sql', 'rag'] as const;
export type PromptScene = (typeof PROMPT_SCENES)[number];

export const PROMPT_VERSION_STATUSES = ['draft', 'active', 'archived'] as const;
export type PromptVersionStatus = (typeof PROMPT_VERSION_STATUSES)[number];

export interface PromptTemplateListItem {
  id: string;
  code: PromptTemplateCode;
  name: string;
  description: string | null;
  scene: PromptScene;
  activeVersion: {
    id: string;
    version: number;
    status: PromptVersionStatus;
    updatedAt: string;
  } | null;
  versionCount: number;
  updatedAt: string;
}

export interface PromptVersionItem {
  id: string;
  templateId: string;
  version: number;
  systemPrompt: string;
  userPromptTemplate: string;
  variablesSchema: Record<string, unknown> | null;
  status: PromptVersionStatus;
  createdBy: {
    id: string;
    username: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface PromptTemplateDetail {
  id: string;
  code: PromptTemplateCode;
  name: string;
  description: string | null;
  scene: PromptScene;
  defaultDraft: {
    systemPrompt: string;
    userPromptTemplate: string;
    variablesSchema: Record<string, unknown> | null;
  };
  activeVersionId: string | null;
  versions: PromptVersionItem[];
}

export interface CreatePromptVersionRequest {
  systemPrompt: string;
  userPromptTemplate: string;
  variablesSchema?: Record<string, unknown>;
}

export interface UpdatePromptVersionRequest {
  systemPrompt: string;
  userPromptTemplate: string;
  variablesSchema?: Record<string, unknown>;
}

export interface PromptTestRequest {
  templateCode: PromptTemplateCode;
  promptVersionId?: string;
  variables: Record<string, unknown>;
}

export interface PromptTestResult {
  requestId: string;
  templateCode: PromptTemplateCode;
  promptVersionId: string | null;
  resolvedPrompt: {
    systemPrompt: string;
    userPrompt: string;
  };
  output: string;
  durationMs: number;
  source: 'default' | 'database';
}

export interface PromptTestLogItem {
  id: string;
  templateCode: PromptTemplateCode;
  promptVersionId: string | null;
  input: Record<string, unknown>;
  resolvedPrompt: {
    systemPrompt: string;
    userPrompt: string;
  };
  output: string | null;
  durationMs: number | null;
  success: boolean;
  errorMessage: string | null;
  createdBy: {
    id: string;
    username: string;
  };
  createdAt: string;
}

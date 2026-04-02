/**
 * Prompt 管理相关共享契约
 *
 * 当前版本改成“单模板直接编辑”模式：
 * - 不再暴露版本、发布、回滚这些概念
 * - 每个模板只维护一份当前生效内容
 * - 测试台始终基于这份当前模板内容执行
 */

export const PROMPT_TEMPLATE_CODES = [
  'sql_generation',
  'sql_answer',
  'knowledge_base_answer',
] as const;

export type PromptTemplateCode = (typeof PROMPT_TEMPLATE_CODES)[number];

export const PROMPT_SCENES = ['nl2sql', 'rag'] as const;
export type PromptScene = (typeof PROMPT_SCENES)[number];

export interface PromptTemplateListItem {
  id: string;
  code: PromptTemplateCode;
  name: string;
  description: string | null;
  scene: PromptScene;
  updatedAt: string;
}

export interface PromptTemplateDetail {
  id: string;
  code: PromptTemplateCode;
  name: string;
  description: string | null;
  scene: PromptScene;
  systemPrompt: string;
  userPromptTemplate: string;
  variablesSchema: Record<string, unknown> | null;
}

export interface UpdatePromptTemplateRequest {
  systemPrompt: string;
  userPromptTemplate: string;
  variablesSchema?: Record<string, unknown>;
}

export interface PromptTestRequest {
  templateCode: PromptTemplateCode;
  variables: Record<string, unknown>;
}

export interface PromptTestResult {
  requestId: string;
  templateCode: PromptTemplateCode;
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

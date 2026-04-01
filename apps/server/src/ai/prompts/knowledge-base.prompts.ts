import type { PromptScene, PromptTemplateCode } from '@fullstack/shared';
import {
  buildCommonChineseAnswerRules,
  buildCommonInsufficientInfoRules,
} from './common.prompts';

export interface DefaultKnowledgeBasePromptTemplateDefinition {
  code: PromptTemplateCode;
  name: string;
  description: string;
  scene: PromptScene;
  systemPrompt: string;
  userPromptTemplate: string;
  variablesSchema: Record<string, unknown> | null;
}

/**
 * 知识库问答变量
 *
 * 运行时由检索层把 question 和 contextText 传进来，
 * Prompt 管理只负责决定用什么话术组织这两个变量。
 */
export function buildKnowledgeBaseAnswerVariables(input: {
  question: string;
  contextText: string;
  historyText?: string;
}) {
  return {
    question: input.question,
    contextText: input.contextText,
    historyText: input.historyText ?? '',
  };
}

export const KNOWLEDGE_BASE_ANSWER_DEFAULT_TEMPLATE: DefaultKnowledgeBasePromptTemplateDefinition = {
  code: 'knowledge_base_answer',
  name: '知识库问答 - 回答生成',
  description: '基于检索到的知识库上下文组织最终回答。',
  scene: 'rag',
  systemPrompt: [
    '你是一个企业知识库问答助手。',
    '请只根据给定的文档上下文回答，不能虚构事实。',
    '如果文档上下文不能支持完整回答，要优先说明当前文档里没有足够信息。',
    buildCommonChineseAnswerRules(),
    buildCommonInsufficientInfoRules(),
  ].join('\n'),
  userPromptTemplate: [
    '用户问题：{{question}}',
    '',
    '最近对话上下文：',
    '{{historyText}}',
    '',
    '知识库上下文：',
    '{{contextText}}',
  ].join('\n'),
  variablesSchema: {
    question: 'string',
    contextText: 'string',
    historyText: 'string',
  },
};

import type { PromptTemplateCode } from '@fullstack/shared';
import {
  KNOWLEDGE_BASE_ANSWER_DEFAULT_TEMPLATE,
  buildKnowledgeBaseAnswerVariables,
  KNOWLEDGE_BASE_RETRIEVAL_REWRITE_DEFAULT_TEMPLATE,
  buildKnowledgeBaseRetrievalRewriteVariables,
} from './prompts/knowledge-base.prompts';
import {
  SQL_ANSWER_DEFAULT_TEMPLATE,
  SQL_GENERATION_DEFAULT_TEMPLATE,
  buildSqlAnswerVariables,
  buildSqlGenerationVariables,
} from './prompts/sql.prompts';

export const PROMPT_DEFAULT_DEFINITIONS = [
  SQL_GENERATION_DEFAULT_TEMPLATE,
  SQL_ANSWER_DEFAULT_TEMPLATE,
  KNOWLEDGE_BASE_ANSWER_DEFAULT_TEMPLATE,
  KNOWLEDGE_BASE_RETRIEVAL_REWRITE_DEFAULT_TEMPLATE,
] as const;

export function getPromptDefaultDefinition(code: PromptTemplateCode) {
  const definition = PROMPT_DEFAULT_DEFINITIONS.find((item) => item.code === code);
  if (!definition) {
    throw new Error(`未知的 Prompt 模板编码: ${code}`);
  }

  return definition;
}

export {
  buildKnowledgeBaseAnswerVariables,
  buildKnowledgeBaseRetrievalRewriteVariables,
  buildSqlAnswerVariables,
  buildSqlGenerationVariables,
};

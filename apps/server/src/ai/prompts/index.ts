// 所有服务端 prompt 从这里统一导出，后续改提示词只需要进入 ai/prompts 目录维护。
export {
  buildCommonChineseAnswerRules,
  buildCommonInsufficientInfoRules,
} from './common.prompts';
export {
  KNOWLEDGE_BASE_ANSWER_DEFAULT_TEMPLATE,
  buildKnowledgeBaseAnswerVariables,
} from './knowledge-base.prompts';
export {
  SQL_ANSWER_DEFAULT_TEMPLATE,
  SQL_GENERATION_DEFAULT_TEMPLATE,
  SQL_SCHEMA_DESCRIPTION,
  buildSqlAnswerVariables,
  buildSqlGenerationVariables,
} from './sql.prompts';

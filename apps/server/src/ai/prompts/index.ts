// 所有服务端 prompt 从这里统一导出，后续改提示词只需要进入 ai/prompts 目录维护。
export {
  buildCommonChineseAnswerRules,
  buildCommonInsufficientInfoRules,
} from './common.prompts';
export { buildKnowledgeBaseAnswerPrompt } from './knowledge-base.prompts';
export { buildSqlAnswerMessages, buildSqlGenerationMessages } from './sql.prompts';

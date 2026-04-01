import {
  buildCommonChineseAnswerRules,
  buildCommonInsufficientInfoRules,
} from './common.prompts';

/**
 * 知识库问答 prompt 构建
 *
 * 知识库 RAG 这条链路只需要关心：
 * - 怎么约束模型必须基于命中文档回答
 * - 怎么组织“问题 + 上下文”这段输入
 */
export function buildKnowledgeBaseAnswerPrompt(input: {
  question: string;
  contextText: string;
}) {
  return [
    '你是一个企业知识库问答助手。',
    '请只根据给定的文档上下文回答，不能虚构事实。',
    '如果文档上下文不能支持完整回答，要优先说明当前文档里没有足够信息。',
    buildCommonChineseAnswerRules(),
    buildCommonInsufficientInfoRules(),
    '',
    `用户问题：${input.question}`,
    '',
    '知识库上下文：',
    input.contextText,
  ].join('\n');
}

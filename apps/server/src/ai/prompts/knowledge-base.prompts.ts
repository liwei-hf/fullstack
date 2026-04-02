import type {
  KnowledgeBaseAnswerStyle,
  KnowledgeBaseCitationMode,
  PromptScene,
  PromptTemplateCode,
} from '@fullstack/shared';
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

/**
 * 知识库级 Prompt 覆盖规则
 *
 * 这里不让每个知识库直接写一整段 Prompt，而是只暴露少量结构化选项，
 * 让系统还能维持统一底座，同时支持不同知识库的回答风格差异。
 */
export function buildKnowledgeBasePromptOverrideRules(input: {
  systemPromptOverride?: string | null;
  answerStyle: KnowledgeBaseAnswerStyle;
  citationMode: KnowledgeBaseCitationMode;
  strictMode: boolean;
}) {
  const styleRule =
    input.answerStyle === 'concise'
      ? '回答要优先给出直接结论，控制在简洁的 3 到 5 句内，避免冗长展开。'
      : input.answerStyle === 'detailed'
        ? '回答要先给结论，再分点展开说明背景、依据和边界，必要时做详细解释。'
        : '回答要先给结论，再补充必要依据和说明，保持简洁与完整的平衡。';

  const citationRule =
    input.citationMode === 'required'
      ? '回答正文要体现依据意识，可以自然提及“根据当前知识库内容”或“从现有文档可见”等表达。'
      : input.citationMode === 'hidden'
        ? '回答正文不要主动插入来源提示，引用来源由界面单独展示。'
        : '只有在容易引起歧义时，才在回答正文里简要提及依据。';

  const strictRule = input.strictMode
    ? '如果当前文档上下文不足，禁止根据常识补全答案，必须明确说明信息不足。'
    : '如果上下文不足，可以做审慎推断，但必须明确标注这是基于现有信息的推断。';

  return [
    styleRule,
    citationRule,
    strictRule,
    input.systemPromptOverride?.trim() ? `知识库补充规则：\n${input.systemPromptOverride.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export const KNOWLEDGE_BASE_ANSWER_DEFAULT_TEMPLATE: DefaultKnowledgeBasePromptTemplateDefinition = {
  code: 'knowledge_base_answer',
  name: '知识库问答 - 回答生成',
  description: '基于检索到的知识库上下文组织最终回答。',
  scene: 'rag',
  systemPrompt: [
    '你是一个中文知识库问答助手。',
    '你的回答由两层规则组成：系统通用规则 + 当前知识库补充规则；如果两者有冲突，以当前知识库补充规则优先。',
    '你只能依据当前提供的知识库上下文回答，不能编造事实，不能把常识当成文档结论。',
    '回答时先给直接结论，再补充关键依据、适用条件和边界。',
    '如果问题包含简称、口语叫法或模糊称呼，可以先在当前上下文内做术语归一化，再继续回答。',
    '如果文档上下文不足以支撑明确答案，要直接说明“当前知识库信息不足，无法确认”，不要硬猜。',
    '如果问题可能存在多种场景、例外情况或前置条件，要明确分点说明，不要把不同情况混为一谈。',
    '如果引用来源已经由界面单独展示，正文中不要重复堆砌引用格式，而要把重点放在结论和解释上。',
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

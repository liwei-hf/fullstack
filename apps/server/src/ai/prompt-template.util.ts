import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate, PromptTemplate } from '@langchain/core/prompts';

const VARIABLE_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * Prompt 模板变量插值
 *
 * 这里改用 LangChain PromptTemplate 承接模板格式化，
 * 既保留当前项目的 {{variable}} 写法，又让后续链式编排时可以直接复用同一套模板能力。
 */
export async function interpolatePromptTemplate(
  template: string,
  variables: Record<string, unknown>,
) {
  const inputVariables = Array.from(template.matchAll(VARIABLE_PATTERN)).map((match) => match[1]);
  const normalizedTemplate = template.replace(VARIABLE_PATTERN, (_match, key: string) => `{${key}}`);
  const prompt = new PromptTemplate({
    template: normalizedTemplate,
    inputVariables: Array.from(new Set(inputVariables)),
  });

  return prompt.format(
    Object.fromEntries(
      inputVariables.map((key) => [key, toPromptTemplateValue(variables[key])]),
    ),
  );
}

/**
 * 把当前已解析好的 system/user prompt 转成 LangChain 聊天消息模板，
 * 这样问答和 prompt 测试链路都能统一用 ChatPromptTemplate 来组织消息。
 */
export function buildChatPromptTemplate(input: {
  systemPrompt: string;
  userPrompt: string;
}) {
  return ChatPromptTemplate.fromMessages([
    ['system', input.systemPrompt],
    ['human', input.userPrompt],
  ]);
}

/**
 * 对于已经完成变量插值的 prompt，直接构造成消息对象更安全，
 * 可以避免 userPrompt 里的 JSON 花括号再次被 LangChain 当成模板变量。
 */
export function buildResolvedChatMessages(input: {
  systemPrompt: string;
  userPrompt: string;
}) {
  return [new SystemMessage(input.systemPrompt), new HumanMessage(input.userPrompt)];
}

function toPromptTemplateValue(value: unknown) {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value, null, 2);
}

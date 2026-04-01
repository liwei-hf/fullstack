/**
 * Prompt 模板变量插值
 *
 * 目前先支持简单的 {{variable}} 占位符替换，
 * 够支撑第一版 Prompt 版本管理和测试台使用。
 */
export function interpolatePromptTemplate(
  template: string,
  variables: Record<string, unknown>,
) {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
    const value = variables[key];
    if (value === undefined || value === null) {
      return '';
    }

    if (typeof value === 'string') {
      return value;
    }

    return JSON.stringify(value, null, 2);
  });
}

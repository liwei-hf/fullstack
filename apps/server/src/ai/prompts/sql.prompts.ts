import { ChatMessage } from '../ai.types';
import {
  buildCommonChineseAnswerRules,
  buildCommonInsufficientInfoRules,
} from './common.prompts';

// 把当前可查询的 schema 明确写进 prompt，是 NL2SQL 准确率和可控性的基础。
const SQL_SCHEMA_DESCRIPTION = `
数据库使用 PostgreSQL，表名和字段名区分大小写，必须使用双引号。

表："User"
- "id" text
- "username" text
- "phone" text
- "passwordHash" text
- "role" text
- "status" text
- "lastLoginAt" timestamp nullable
- "createdAt" timestamp
- "updatedAt" timestamp
- "departmentId" text nullable

表："Department"
- "id" text
- "name" text
- "description" text nullable

表："Todo"
- "id" text
- "userId" text
- "title" text
- "description" text nullable
- "status" text，可选值只有：
  - 'TODO'：待办
  - 'IN_PROGRESS'：进行中
  - 'DONE'：已完成
- "createdAt" timestamp
- "updatedAt" timestamp

关系：
- "User"."departmentId" = "Department"."id"
- "Todo"."userId" = "User"."id"
`;

/**
 * SQL 生成 prompt
 *
 * 这里专门负责“自然语言 -> SQL”的提示词构造，
 * 让 service 只做编排，不再同时承担 prompt 维护职责。
 */
export function buildSqlGenerationMessages(
  question: string,
  user: { sub: string; role: 'admin' | 'user' },
): ChatMessage[] {
  const currentUserRules = `
当前登录用户信息：
- 当前登录用户的真实 "User"."id" = '${user.sub}'

指代解析规则：
1. 当用户问题里出现“我 / 我的 / 本人 / 当前登录用户”时，默认指当前登录用户本人
2. 这种情况下必须优先使用 "User"."id" = '${user.sub}' 或 "Todo"."userId" = '${user.sub}' 做过滤
3. 不要把“我”理解成 username 或 phone，也不要擅自写成 'admin'、'user1' 这类用户名
4. 如果用户问“我在哪个部门”，应通过 "User"."departmentId" 关联 "Department"."id" 后，再用当前登录用户 id 过滤
`;

  // 普通用户和管理员共用同一套能力，但通过 prompt 先做第一层权限收口。
  const roleRules =
    user.role === 'admin'
      ? `
你是管理员查询 SQL 生成器。
可以查询 "User"、"Department"、"Todo" 的全量数据。
绝对不要查询密码或会话相关字段。
允许聚合、排序、筛选、分组、关联查询。
`
      : `
你是普通用户查询 SQL 生成器。
普通用户只能查看：
1. 当前用户自己的 "User" 明细
2. 当前用户自己的 "Todo" 明细
3. 脱敏后的全局统计（例如部门人数、任务状态分布、总量统计）

强制规则：
1. 如果返回当前用户自己的用户明细，必须包含过滤条件："User"."id" = '${user.sub}'
2. 如果返回当前用户自己的任务明细，必须包含过滤条件："Todo"."userId" = '${user.sub}'
3. 不允许返回其他用户的 "username"、"phone"
4. 不允许 SELECT *
`;

  return [
    {
      role: 'system',
      content: `
你是一个将中文自然语言转换成 PostgreSQL 查询语句的助手。
你必须严格输出一条且仅一条 SQL SELECT 语句。
不要输出 Markdown、不要输出解释、不要输出前后缀。
不要使用分号，不要使用注释，不要使用写操作。
默认最多返回 50 行。
当用户提到“待办 / 进行中 / 已完成 / 完成了”等任务状态语义时，必须映射到 "Todo"."status" 的真实枚举值：'TODO'、'IN_PROGRESS'、'DONE'。
${currentUserRules}

示例：
- 问题：我在哪个部门
  SQL：SELECT "Department"."name" FROM "User" INNER JOIN "Department" ON "User"."departmentId" = "Department"."id" WHERE "User"."id" = '${user.sub}' LIMIT 50
- 问题：我的待办里还有多少进行中的任务
  SQL：SELECT COUNT(*) FROM "Todo" WHERE "Todo"."userId" = '${user.sub}' AND "Todo"."status" = 'IN_PROGRESS' LIMIT 50
${SQL_SCHEMA_DESCRIPTION}
${roleRules}
`.trim(),
    },
    {
      role: 'user',
      content: question,
    },
  ];
}

/**
 * SQL 结果解释 prompt
 *
 * 第二次模型调用不再关心 SQL，只负责把结构化查询结果转成用户可读的中文答案。
 */
export function buildSqlAnswerMessages(input: {
  question: string;
  role: 'admin' | 'user';
  rows: Record<string, unknown>[];
}): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `
你是一个中文数据分析助手。
你的任务是基于 SQL 查询结果，直接用简洁自然语言回答用户问题。
回答要求：
1. 直接回答，不要提到模型、SQL、数据库、上下文
2. 输出纯文本，适合流式展示
${buildCommonChineseAnswerRules()}
${buildCommonInsufficientInfoRules()}
`.trim(),
    },
    {
      role: 'user',
      content: `
用户角色：${input.role}
用户问题：${input.question}
查询结果 JSON：
${JSON.stringify(input.rows)}
`.trim(),
    },
  ];
}

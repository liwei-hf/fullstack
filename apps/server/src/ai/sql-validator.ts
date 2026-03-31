import { Injectable } from '@nestjs/common';
import { AiSqlError } from './ai.errors';
import { SqlValidationContext, SqlValidationResult } from './ai.types';

const MAX_LIMIT = 50;
const DISALLOWED_KEYWORDS = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|call|merge)\b/i;
const DISALLOWED_COMMENTS = /--|\/\*|\*\//;
const ALLOWED_TABLES = new Set(['User', 'Department', 'Todo']);

@Injectable()
export class SqlValidator {
  validate(rawSql: string, context: SqlValidationContext): SqlValidationResult {
    const sql = this.normalize(rawSql);

    if (!sql) {
      throw new AiSqlError('AI_SQL_INVALID', '未生成有效 SQL');
    }

    if (!/^select\b/i.test(sql)) {
      throw new AiSqlError('AI_SQL_INVALID', '只允许生成 SELECT 查询');
    }

    if (sql.includes(';') || DISALLOWED_COMMENTS.test(sql) || DISALLOWED_KEYWORDS.test(sql)) {
      throw new AiSqlError('AI_SQL_UNSAFE', '检测到不安全的 SQL 语句');
    }

    // 只允许访问当前产品约束的三张业务表，避免模型越界碰到其他内部表。
    const tables = this.extractTableNames(sql);
    if (tables.length === 0 || tables.some((table) => !ALLOWED_TABLES.has(table))) {
      throw new AiSqlError('AI_SQL_UNSUPPORTED', 'SQL 访问了不支持的表');
    }

    if (context.role === 'user') {
      this.ensureUserSafe(sql, context.userId);
    }

    return this.enforceLimit(sql);
  }

  private normalize(rawSql: string) {
    return rawSql
      .trim()
      .replace(/^```sql/i, '')
      .replace(/^```/i, '')
      .replace(/```$/i, '')
      .replace(/;+\s*$/g, '')
      .trim();
  }

  private extractTableNames(sql: string) {
    const tables = new Set<string>();
    // 用轻量规则提取 from/join 后的表名，MVP 阶段够用，后续若 SQL 复杂度升高可升级 AST 方案。
    const pattern = /\b(?:from|join)\s+((?:"[^"]+"|\w+)(?:\.(?:"[^"]+"|\w+))?)/gi;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(sql)) !== null) {
      const rawTable = match[1].split('.').pop() ?? '';
      const normalizedTable = rawTable.replace(/"/g, '');
      tables.add(normalizedTable);
    }

    return [...tables];
  }

  private ensureUserSafe(sql: string, userId: string) {
    const selectClause = sql.match(/\bselect\b([\s\S]+?)\bfrom\b/i)?.[1] ?? '';
    const hasCurrentUserFilter = sql.includes(`'${userId}'`) || sql.includes(`"${userId}"`);
    const selectsAll = /\bselect\s+\*/i.test(sql);
    const sensitiveUserFields = /"?(username|phone)"?/i.test(selectClause);
    const todoDetailFields = /"?(title|description)"?/i.test(selectClause);

    if (selectsAll) {
      throw new AiSqlError('AI_SQL_UNSAFE', '普通用户不允许使用 SELECT *');
    }

    // 普通用户允许看自己的明细，但如果出现明细字段且没有带当前用户过滤，就直接拒绝。
    if ((sensitiveUserFields || todoDetailFields) && !hasCurrentUserFilter) {
      throw new AiSqlError('AI_SQL_UNSAFE', '普通用户只能查看自己的明细数据');
    }

    if (/"passwordHash"/i.test(selectClause) || /"refreshTokenHash"/i.test(selectClause)) {
      throw new AiSqlError('AI_SQL_UNSAFE', '不允许查询敏感字段');
    }
  }

  private enforceLimit(sql: string): SqlValidationResult {
    const limitMatch = sql.match(/\blimit\s+(\d+)\b/i);

    if (!limitMatch) {
      // 模型未主动带 limit 时，后端兜底补上，避免一次性把大结果集都拉回来。
      return {
        normalizedSql: `${sql} LIMIT ${MAX_LIMIT}`,
        truncated: true,
      };
    }

    const limitValue = Number(limitMatch[1]);
    if (limitValue <= MAX_LIMIT) {
      return {
        normalizedSql: sql,
        truncated: false,
      };
    }

    return {
      normalizedSql: sql.replace(/\blimit\s+\d+\b/i, `LIMIT ${MAX_LIMIT}`),
      truncated: true,
    };
  }
}

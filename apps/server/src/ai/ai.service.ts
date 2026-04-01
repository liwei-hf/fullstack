import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import type { AiSqlSummaryItem } from '@fullstack/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AiSqlError } from './ai.errors';
import { buildSqlAnswerMessages, buildSqlGenerationMessages } from './prompts';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';
import { SqlValidator } from './sql-validator';
import { AiSqlUserContext } from './ai.types';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly provider: OpenAiCompatibleProvider,
    private readonly sqlValidator: SqlValidator,
  ) {}

  async streamSqlAnswer(
    question: string,
    user: AiSqlUserContext,
    res: Response,
  ) {
    const requestId = randomUUID();
    const startedAt = Date.now();
    const sqlModel = this.getModelByPhase('OPENAI_SQL_MODEL');
    const answerModel = this.getModelByPhase('OPENAI_ANSWER_MODEL');
    const traceBase = {
      requestId,
      userId: user.sub,
      role: user.role,
    };

    this.logger.log(
      JSON.stringify({
        ...traceBase,
        stage: 'request_started',
        question,
        sqlModel,
        answerModel,
      }),
    );

    this.writeEvent(res, 'meta', {
      type: 'meta',
      requestId,
      role: user.role,
      timestamp: new Date().toISOString(),
    });

    try {
      // 两段式链路：
      // 1. 先让模型把自然语言转成 SQL
      // 2. 查库后再让模型把结果组织成自然语言答案
      const sqlGenerationStartedAt = Date.now();
      const rawSql = await this.provider.generateText({
        messages: buildSqlGenerationMessages(question, {
          sub: user.sub,
          role: user.role,
        }),
        model: sqlModel,
        temperature: 0.1,
      });
      const correctedSql = this.enforceCurrentUserIntent(question, rawSql, user.sub);
      const sqlGenerationDurationMs = Date.now() - sqlGenerationStartedAt;

      this.logger.log(
        JSON.stringify({
          ...traceBase,
          stage: 'sql_generated_by_model',
          durationMs: sqlGenerationDurationMs,
          sqlPreview: rawSql.slice(0, 200),
        }),
      );

      if (correctedSql !== rawSql) {
        this.logger.log(
          JSON.stringify({
            ...traceBase,
            stage: 'current_user_filter_corrected',
            rawSqlPreview: rawSql.slice(0, 200),
            correctedSqlPreview: correctedSql.slice(0, 200),
          }),
        );
      }

      const sqlValidationStartedAt = Date.now();
      const { normalizedSql, truncated } = this.sqlValidator.validate(correctedSql, {
        role: user.role,
        userId: user.sub,
      });
      const sqlValidationDurationMs = Date.now() - sqlValidationStartedAt;

      this.logger.log(
        JSON.stringify({
          ...traceBase,
          stage: 'sql_validated',
          durationMs: sqlValidationDurationMs,
          truncated,
        }),
      );

      // 开发环境保留 SQL 事件，便于排查提示词和权限规则是否符合预期。
      if (this.configService.get<string>('NODE_ENV') !== 'production') {
        this.writeEvent(res, 'sql_generated', {
          type: 'sql_generated',
          sql: normalizedSql,
        });
      }

      const queryStartedAt = Date.now();
      const rows = await this.executeQuery(normalizedSql);
      const queryDurationMs = Date.now() - queryStartedAt;

      this.logger.log(
        JSON.stringify({
          ...traceBase,
          stage: 'sql_executed',
          durationMs: queryDurationMs,
          rowCount: rows.length,
        }),
      );

      // Prisma/PostgreSQL 结果里可能带 bigint/date，先转成可 JSON 序列化的值，
      // 再交给第二次模型调用和 SSE 输出，避免在 stringify 阶段报错。
      const serializationStartedAt = Date.now();
      const serializableRows = this.toSerializableRows(rows);
      const summaryItems = this.buildSummaryItems(serializableRows);
      const serializationDurationMs = Date.now() - serializationStartedAt;

      this.logger.log(
        JSON.stringify({
          ...traceBase,
          stage: 'rows_serialized',
          durationMs: serializationDurationMs,
          rowCount: serializableRows.length,
        }),
      );

      const answerStartedAt = Date.now();
      let firstDeltaAt: number | null = null;
      let answerChunkCount = 0;
      let answerCharCount = 0;

      await this.provider.streamText(
        {
          messages: buildSqlAnswerMessages({
            question,
            role: user.role,
            rows: serializableRows,
          }),
          model: answerModel,
          temperature: 0.3,
        },
        (delta) => {
          if (firstDeltaAt === null) {
            firstDeltaAt = Date.now();
            this.logger.log(
              JSON.stringify({
                ...traceBase,
                stage: 'answer_first_chunk',
                durationMs: firstDeltaAt - answerStartedAt,
              }),
            );
          }

          answerChunkCount += 1;
          answerCharCount += delta.length;
          this.writeEvent(res, 'answer_delta', {
            type: 'answer_delta',
            delta,
          });
        },
      );
      const answerDurationMs = Date.now() - answerStartedAt;

      this.logger.log(
        JSON.stringify({
          ...traceBase,
          stage: 'answer_stream_completed',
          durationMs: answerDurationMs,
          firstChunkMs: firstDeltaAt ? firstDeltaAt - answerStartedAt : null,
          chunkCount: answerChunkCount,
          charCount: answerCharCount,
        }),
      );

      this.writeEvent(res, 'summary', {
        type: 'summary',
        items: summaryItems,
      });

      this.writeEvent(res, 'done', {
        type: 'done',
        durationMs: Date.now() - startedAt,
        rowCount: serializableRows.length,
        truncated,
      });

      this.logger.log(
        JSON.stringify({
          ...traceBase,
          stage: 'request_completed',
          question,
          sqlModel,
          answerModel,
          sql: normalizedSql,
          rowCount: serializableRows.length,
          sqlGenerationDurationMs,
          sqlValidationDurationMs,
          queryDurationMs,
          serializationDurationMs,
          answerDurationMs,
          answerFirstChunkMs: firstDeltaAt ? firstDeltaAt - answerStartedAt : null,
          answerChunkCount,
          answerCharCount,
          durationMs: Date.now() - startedAt,
        }),
      );
    } catch (error) {
      const aiError = this.toAiError(error);
      this.writeEvent(res, 'error', {
        type: 'error',
        code: aiError.code,
        message: aiError.message,
      });

      this.logger.error(
        JSON.stringify({
          ...traceBase,
          stage: 'request_failed',
          question,
          sqlModel,
          answerModel,
          code: aiError.code,
          message: aiError.message,
          durationMs: Date.now() - startedAt,
          rawError: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      res.end();
    }
  }

  private async executeQuery(sql: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // 这里用事务包裹并设置 statement_timeout，避免大模型生成的慢 SQL 长时间占住连接。
        await tx.$executeRawUnsafe('SET LOCAL statement_timeout = 5000');
        return tx.$queryRawUnsafe<Record<string, unknown>[]>(sql);
      });
    } catch {
      throw new AiSqlError('AI_SQL_EXECUTION_FAILED', 'SQL 执行失败，请换个问法再试');
    }
  }

  private buildSummaryItems(rows: Record<string, unknown>[]): AiSqlSummaryItem[] {
    const items: AiSqlSummaryItem[] = [
      {
        label: '结果行数',
        value: rows.length,
      },
    ];

    if (rows.length === 0) {
      return items;
    }

    // 摘要只提取少量数值字段，既方便手机端展示，也避免把整张表再重复展示一遍。
    const numericEntries = Object.entries(rows[0]).filter(
      ([, value]) => typeof value === 'number' || typeof value === 'bigint',
    );

    for (const [key, value] of numericEntries.slice(0, 3)) {
      items.push({
        label: key,
        value: this.normalizeValue(value) as string | number,
      });
    }

    return items;
  }

  private toSerializableRows(rows: Record<string, unknown>[]) {
    return rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, this.normalizeValue(value)]),
      ),
    );
  }

  private normalizeValue(value: unknown): unknown {
    // COUNT(*) 这类聚合在 PostgreSQL 中常是 bigint，这里统一转成前端和模型都能消费的格式。
    if (typeof value === 'bigint') {
      const numericValue = Number(value);
      return Number.isSafeInteger(numericValue) ? numericValue : value.toString();
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeValue(item));
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [
          key,
          this.normalizeValue(item),
        ]),
      );
    }

    return value;
  }

  private writeEvent(res: Response, event: string, payload: unknown) {
    // SSE 协议按 event/data 双行格式输出，前端按事件类型分别消费回答片段和摘要。
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  private enforceCurrentUserIntent(question: string, sql: string, userId: string) {
    // “我 / 我的”这类问题是确定性语义，服务端做一次兜底修正比只依赖模型更稳。
    if (!/(我|我的|本人|当前登录用户)/.test(question)) {
      return sql;
    }

    let normalizedSql = sql;

    if (/"Todo"/.test(normalizedSql)) {
      normalizedSql = this.forceSqlFilter(
        normalizedSql,
        /"Todo"\."userId"\s*=\s*('[^']*'|"[^"]*")/i,
        `"Todo"."userId" = '${userId}'`,
      );
    }

    if (/"User"/.test(normalizedSql)) {
      normalizedSql = this.forceSqlFilter(
        normalizedSql,
        /"User"\."id"\s*=\s*('[^']*'|"[^"]*")/i,
        `"User"."id" = '${userId}'`,
      );
    }

    return normalizedSql;
  }

  private forceSqlFilter(sql: string, existingFilterPattern: RegExp, expectedFilter: string) {
    if (existingFilterPattern.test(sql)) {
      return sql.replace(existingFilterPattern, expectedFilter);
    }

    const limitMatch = sql.match(/\blimit\s+\d+\b/i);

    if (/\bwhere\b/i.test(sql)) {
      if (!limitMatch) {
        return `${sql} AND ${expectedFilter}`;
      }

      return `${sql.slice(0, limitMatch.index)} AND ${expectedFilter} ${sql.slice(limitMatch.index)}`;
    }

    if (!limitMatch) {
      return `${sql} WHERE ${expectedFilter}`;
    }

    return `${sql.slice(0, limitMatch.index)} WHERE ${expectedFilter} ${sql.slice(limitMatch.index)}`;
  }

  private getModelByPhase(phaseEnvKey: 'OPENAI_SQL_MODEL' | 'OPENAI_ANSWER_MODEL') {
    // 两段模型支持分开配置；如果没有单独指定，就回退到统一的 OPENAI_MODEL。
    return (
      this.configService.get<string>(phaseEnvKey) ||
      this.configService.get<string>('OPENAI_MODEL') ||
      undefined
    );
  }

  private toAiError(error: unknown) {
    if (error instanceof AiSqlError) {
      return error;
    }

    return new AiSqlError('AI_SQL_STREAM_FAILED', '流式回答失败，请稍后重试');
  }
}

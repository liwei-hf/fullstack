import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import { ChatOpenAI } from '@langchain/openai';
import type { Response } from 'express';
import type { AiSqlSummaryItem, AiSqlVisibility } from '@fullstack/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AiSessionMemoryService } from './ai-session-memory.service';
import { AiSqlError } from './ai.errors';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';
import { PromptService } from './prompt.service';
import { buildResolvedChatMessages } from './prompt-template.util';
import {
  buildSqlAnswerVariables,
  buildSqlGenerationVariables,
} from './prompt-defaults.registry';
import { SqlValidator } from './sql-validator';
import { AiSqlUserContext, SqlVisibilityContext } from './ai.types';
import { SystemSettingsService } from '../system-settings/system-settings.service';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly provider: OpenAiCompatibleProvider,
    private readonly sessionMemoryService: AiSessionMemoryService,
    private readonly promptService: PromptService,
    private readonly sqlValidator: SqlValidator,
    private readonly systemSettingsService: SystemSettingsService,
  ) {}

  async streamSqlAnswer(
    question: string,
    user: AiSqlUserContext,
    res: Response,
    requestId: string,
    inputSessionId?: string,
  ) {
    const startedAt = Date.now();
    const sessionId = this.sessionMemoryService.resolveSessionId(inputSessionId);
    const conversationContext = await this.sessionMemoryService.getConversationContext({
      feature: 'sql',
      userId: user.sub,
      sessionId,
    });
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
        sessionId,
        sqlModel,
        answerModel,
      }),
    );

    this.writeEvent(res, 'meta', {
      type: 'meta',
      requestId,
      sessionId,
      role: user.role,
      timestamp: new Date().toISOString(),
    });

    try {
      this.writeEvent(res, 'loading', {
        type: 'loading',
        stage: 'generating_sql',
        message: '正在理解问题并生成 SQL...',
      });

      // 两段式链路：
      // 1. 先让模型把自然语言转成 SQL
      // 2. 查库后再让模型把结果组织成自然语言答案
      const sqlGenerationStartedAt = Date.now();
      const sqlGenerationPrompt = await this.promptService.resolvePrompt(
        'sql_generation',
        buildSqlGenerationVariables(
          question,
          {
            sub: user.sub,
            role: user.role,
          },
          conversationContext.summaryText,
          conversationContext.answerHistoryText,
        ),
      );
      const rawSql = await this.provider.generateText({
        messages: [
          { role: 'system', content: sqlGenerationPrompt.systemPrompt },
          { role: 'user', content: sqlGenerationPrompt.userPrompt },
        ],
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

      // SQL 是否回传给前端由配置策略统一控制：
      // - visible：所有用户可见
      // - hidden：所有用户不可见
      // - admin_only：仅管理员可见（默认）
      // 这样既保留了线上安全边界，也支持演示环境按需打开。
      if (await this.shouldExposeSqlToUser(user)) {
        this.writeEvent(res, 'sql_generated', {
          type: 'sql_generated',
          sql: normalizedSql,
        });
      }

      this.writeEvent(res, 'loading', {
        type: 'loading',
        stage: 'executing_sql',
        message: '正在执行查询并整理结果...',
      });

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
      let answerText = '';
      let thinkingText = '';
      let thinkingStarted = false;
      let thinkingFinished = false;
      const sqlAnswerPrompt = await this.promptService.resolvePrompt(
        'sql_answer',
        buildSqlAnswerVariables({
          question,
          role: user.role,
          rows: serializableRows,
          conversationSummaryText: conversationContext.summaryText,
          recentConversationText: conversationContext.answerHistoryText,
        }),
      );

      this.writeEvent(res, 'loading', {
        type: 'loading',
        stage: 'generating_answer',
        message: '正在生成自然语言回答...',
      });

      const answerStream = await this.createSqlAnswerChain(
        this.createSqlAnswerModel(answerModel),
      ).stream(sqlAnswerPrompt);
      for await (const chunk of answerStream) {
        const thinkingDelta = this.extractThinking(chunk);
        if (thinkingDelta) {
          thinkingStarted = true;
          thinkingText += thinkingDelta;
          this.writeEvent(res, 'thinking_delta', {
            type: 'thinking_delta',
            delta: thinkingDelta,
          });
        }

        const delta = this.extractText((chunk as { content?: unknown }).content);
        if (!delta) {
          continue;
        }

        if (thinkingStarted && !thinkingFinished) {
          thinkingFinished = true;
          this.writeEvent(res, 'thinking_done', {
            type: 'thinking_done',
          });
        }

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
        answerText += delta;
        this.writeEvent(res, 'answer_delta', {
          type: 'answer_delta',
          delta,
        });
      }

      if (thinkingStarted && !thinkingFinished) {
        this.writeEvent(res, 'thinking_done', {
          type: 'thinking_done',
        });
      }
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

      await this.persistAiSqlLog({
        userId: user.sub,
        requestId,
        question,
        answer: answerText,
        thinking: thinkingText || null,
        sql: normalizedSql,
        rowCount: serializableRows.length,
        durationMs: Date.now() - startedAt,
        success: true,
      });
      await this.sessionMemoryService.appendTurn(
        {
          feature: 'sql',
          userId: user.sub,
          sessionId,
        },
        question,
        answerText,
      );

      this.logger.log(
        JSON.stringify({
          ...traceBase,
          stage: 'request_completed',
          question,
          sessionId,
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
      await this.persistAiSqlLog({
        userId: user.sub,
        requestId,
        question,
        answer: null,
        thinking: null,
        sql: null,
        rowCount: 0,
        durationMs: Date.now() - startedAt,
        success: false,
        errorMessage: aiError.message,
      });
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
          sessionId,
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

  /**
   * 统一控制 SQL 是否应该回传给当前用户。
   *
   * 前端只消费 sql_generated 事件，不感知生产环境、角色和配置细节；
   * 这样后续如果把策略做成后台设置，也只需要替换这里的配置来源。
   */
  private async shouldExposeSqlToUser(user: SqlVisibilityContext) {
    const visibility = await this.systemSettingsService.resolveAiSqlVisibility();

    if (visibility === 'visible') {
      return true;
    }

    if (visibility === 'hidden') {
      return false;
    }

    return user.role === 'admin';
  }

  private toAiError(error: unknown) {
    if (error instanceof AiSqlError) {
      return error;
    }

    return new AiSqlError('AI_SQL_STREAM_FAILED', '流式回答失败，请稍后重试');
  }

  private createSqlAnswerChain(model: ChatOpenAI) {
    return RunnableSequence.from([
      RunnableLambda.from(this.formatResolvedPromptAsPromptValue.bind(this)),
      model,
    ]);
  }

  private createSqlAnswerModel(modelOverride?: string) {
    const model = modelOverride || this.configService.get<string>('OPENAI_MODEL');
    if (!model) {
      throw new AiSqlError('AI_SQL_STREAM_FAILED', '缺少 SQL 回答模型配置');
    }

    const zhipuChatModel = this.configService.get<string>('ZHIPU_CHAT_MODEL');

    const useZhipu = Boolean(zhipuChatModel && model === zhipuChatModel);
    const apiKey = useZhipu
      ? this.configService.get<string>('ZHIPU_API_KEY')
      : this.configService.get<string>('OPENAI_API_KEY');
    const baseURL = useZhipu
      ? this.configService.get<string>('ZHIPU_BASE_URL')
      : this.configService.get<string>('OPENAI_BASE_URL');

    if (!apiKey) {
      throw new AiSqlError('AI_SQL_STREAM_FAILED', '缺少 SQL 回答模型凭证');
    }

    return new ChatOpenAI({
      model,
      apiKey,
      configuration: this.buildConfiguration(baseURL),
      temperature: 0.3,
    });
  }

  private async formatResolvedPromptAsPromptValue(input: {
    systemPrompt: string;
    userPrompt: string;
  }) {
    return buildResolvedChatMessages(input);
  }

  private buildConfiguration(baseURL?: string) {
    return baseURL ? { baseURL } : undefined;
  }

  private extractText(content: unknown) {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((item) => {
          if (typeof item === 'string') {
            return item;
          }

          if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') {
            return item.text;
          }

          return '';
        })
        .join('');
    }

    return '';
  }

  private extractThinking(chunk: unknown) {
    if (!chunk || typeof chunk !== 'object') {
      return '';
    }

    const objectChunk = chunk as {
      additional_kwargs?: Record<string, unknown>;
      response_metadata?: Record<string, unknown>;
    };

    return (
      this.normalizeThinkingValue(objectChunk.additional_kwargs?.reasoning_content) ||
      this.normalizeThinkingValue(objectChunk.additional_kwargs?.reasoning) ||
      this.normalizeThinkingValue(objectChunk.additional_kwargs?.thinking) ||
      this.normalizeThinkingValue(objectChunk.response_metadata?.reasoning_content) ||
      this.normalizeThinkingValue(objectChunk.response_metadata?.reasoning) ||
      this.normalizeThinkingValue(objectChunk.response_metadata?.thinking)
    );
  }

  private normalizeThinkingValue(value: unknown): string {
    if (!value) {
      return '';
    }

    if (typeof value === 'string') {
      return value;
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === 'string') {
            return item;
          }

          if (item && typeof item === 'object') {
            if ('text' in item && typeof item.text === 'string') {
              return item.text;
            }

            if ('content' in item && typeof item.content === 'string') {
              return item.content;
            }
          }

          return '';
        })
        .join('');
    }

    if (typeof value === 'object') {
      if ('text' in value && typeof value.text === 'string') {
        return value.text;
      }

      if ('content' in value && typeof value.content === 'string') {
        return value.content;
      }
    }

    return '';
  }

  /**
   * 写日志失败不应该覆盖主流程错误。
   *
   * 日志是可观测性数据，价值很高，但不能反向把用户请求变成更隐蔽的二次异常。
   */
  private async persistAiSqlLog(data: {
    userId: string;
    requestId: string;
    question: string;
    answer: string | null;
    thinking: string | null;
    sql: string | null;
    rowCount: number;
    durationMs: number;
    success: boolean;
    errorMessage?: string;
  }) {
    try {
      await this.prisma.aiSqlLog.create({
        data,
      });
    } catch (logError) {
      this.logger.error(
        JSON.stringify({
          requestId: data.requestId,
          stage: 'ai_sql_log_persist_failed',
          message: logError instanceof Error ? logError.message : String(logError),
        }),
      );
    }
  }
}

import { Injectable } from '@nestjs/common';
import type { AiLogItem, AiLogType } from '@fullstack/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * AI 日志服务
 *
 * 负责把智能问数和知识库问答两类记录统一成前端可直接消费的列表结构，
 * 日志页只关心“类型 + 问答结果”，不用感知底层来自哪张表。
 */
@Injectable()
export class AiLogService {
  constructor(private readonly prisma: PrismaService) {}

  async listCurrentUserLogs(params: {
    userId: string;
    type?: AiLogType;
    limit?: number;
  }): Promise<AiLogItem[]> {
    const limit = params.limit ?? 50;

    const [sqlLogs, knowledgeBaseLogs] = await Promise.all([
      params.type && params.type !== 'sql_query'
        ? Promise.resolve([])
        : this.prisma.aiSqlLog.findMany({
            where: { userId: params.userId },
            orderBy: { createdAt: 'desc' },
            take: limit,
          }),
      params.type && params.type !== 'knowledge_base'
        ? Promise.resolve([])
        : this.prisma.qaLog.findMany({
            where: { userId: params.userId },
            include: {
              knowledgeBase: {
                select: { id: true, name: true },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
          }),
    ]);

    return [
      ...sqlLogs.map<AiLogItem>((item) => ({
        id: item.id,
        type: 'sql_query',
        requestId: item.requestId,
        question: item.question,
        answer: item.answer,
        success: item.success,
        errorMessage: item.errorMessage,
        durationMs: item.durationMs,
        rowCount: item.rowCount,
        sourceCount: null,
        createdAt: item.createdAt.toISOString(),
        knowledgeBase: null,
      })),
      ...knowledgeBaseLogs.map<AiLogItem>((item) => ({
        id: item.id,
        type: 'knowledge_base',
        requestId: item.requestId,
        question: item.question,
        answer: item.answer,
        success: item.success,
        errorMessage: item.errorMessage,
        durationMs: item.durationMs,
        rowCount: null,
        sourceCount: item.sourceCount,
        createdAt: item.createdAt.toISOString(),
        knowledgeBase: item.knowledgeBase
          ? {
              id: item.knowledgeBase.id,
              name: item.knowledgeBase.name,
            }
          : null,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }
}

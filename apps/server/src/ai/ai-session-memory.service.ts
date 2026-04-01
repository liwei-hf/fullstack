import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  AI_SESSION_MEMORY_MAX_TURNS,
  AI_SESSION_MEMORY_TTL_SECONDS,
} from '../redis/redis.constants';
import { RedisService } from '../redis/redis.service';

type ConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ConversationScope = {
  feature: 'sql' | 'knowledge_base';
  userId: string;
  sessionId: string;
  knowledgeBaseId?: string;
};

/**
 * AI 会话短期记忆服务
 *
 * 第一版只保留最近几轮对话，目标是让“那这个呢 / 继续说上一个”
 * 这类连续追问成立，而不是一开始就做复杂的长会话历史中心。
 */
@Injectable()
export class AiSessionMemoryService {
  private readonly memoryFallback = new Map<string, ConversationMessage[]>();

  constructor(private readonly redisService: RedisService) {}

  resolveSessionId(sessionId?: string) {
    return sessionId?.trim() || randomUUID();
  }

  async getHistoryText(scope: ConversationScope) {
    const messages = await this.getMessages(scope);
    if (messages.length === 0) {
      return '';
    }

    return messages
      .map((item) => `${item.role === 'user' ? '用户' : '助手'}：${item.content}`)
      .join('\n');
  }

  async appendTurn(scope: ConversationScope, question: string, answer: string) {
    const currentMessages = await this.getMessages(scope);
    const nextMessages = currentMessages
      .concat(
        { role: 'user' as const, content: question },
        { role: 'assistant' as const, content: answer },
      )
      .slice(-AI_SESSION_MEMORY_MAX_TURNS * 2);

    if (this.redisService.isEnabled()) {
      await this.redisService.setJson(this.buildKey(scope), nextMessages, AI_SESSION_MEMORY_TTL_SECONDS);
      return;
    }

    this.memoryFallback.set(this.buildKey(scope), nextMessages);
  }

  async clearSession(scope: ConversationScope) {
    const key = this.buildKey(scope);
    if (this.redisService.isEnabled()) {
      await this.redisService.deleteKeys(key);
      return;
    }

    this.memoryFallback.delete(key);
  }

  private async getMessages(scope: ConversationScope) {
    const key = this.buildKey(scope);

    if (this.redisService.isEnabled()) {
      return (await this.redisService.getJson<ConversationMessage[]>(key)) ?? [];
    }

    return this.memoryFallback.get(key) ?? [];
  }

  private buildKey(scope: ConversationScope) {
    const knowledgeBasePart = scope.knowledgeBaseId ? `:${scope.knowledgeBaseId}` : '';
    return `ai:session:${scope.feature}:${scope.userId}${knowledgeBasePart}:${scope.sessionId}`;
  }
}

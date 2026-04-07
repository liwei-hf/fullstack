import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  AI_SESSION_MEMORY_ANSWER_MAX_TURNS,
  AI_SESSION_MEMORY_MAX_TURNS,
  AI_SESSION_MEMORY_RETRIEVAL_MAX_TURNS,
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

type ConversationTurn = {
  question: string;
  answer: string;
};

type ConversationContext = {
  hasHistory: boolean;
  summaryText: string;
  retrievalHistoryText: string;
  answerHistoryText: string;
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
    const context = await this.getConversationContext(scope);
    return [context.summaryText, context.answerHistoryText].filter(Boolean).join('\n\n');
  }

  /**
   * 把原始消息数组整理成“摘要 + 检索上下文 + 回答上下文”三层结构。
   *
   * 这样检索改写阶段只看最关键的追问线索，最终回答阶段再看更完整的近几轮内容，
   * 避免所有历史都塞进一个变量里，导致主题被冲淡、检索方向被污染。
   */
  async getConversationContext(scope: ConversationScope): Promise<ConversationContext> {
    const messages = await this.getMessages(scope);
    const turns = this.toTurns(messages);

    if (turns.length === 0) {
      return {
        hasHistory: false,
        summaryText: '',
        retrievalHistoryText: '',
        answerHistoryText: '',
      };
    }

    const answerTurns = turns.slice(-AI_SESSION_MEMORY_ANSWER_MAX_TURNS);
    const retrievalTurns = turns.slice(-AI_SESSION_MEMORY_RETRIEVAL_MAX_TURNS);
    const olderTurns = turns.slice(0, Math.max(0, turns.length - AI_SESSION_MEMORY_ANSWER_MAX_TURNS));

    return {
      hasHistory: true,
      summaryText: this.buildSummaryText(olderTurns),
      retrievalHistoryText: this.formatTurns(retrievalTurns, {
        answerMaxChars: 100,
      }),
      answerHistoryText: this.formatTurns(answerTurns, {
        answerMaxChars: 220,
      }),
    };
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

  private toTurns(messages: ConversationMessage[]): ConversationTurn[] {
    const turns: ConversationTurn[] = [];
    let currentQuestion = '';
    let currentAnswer = '';

    for (const message of messages) {
      if (message.role === 'user') {
        if (currentQuestion || currentAnswer) {
          turns.push({
            question: currentQuestion,
            answer: currentAnswer,
          });
        }

        currentQuestion = message.content;
        currentAnswer = '';
        continue;
      }

      currentAnswer = currentAnswer
        ? `${currentAnswer}\n${message.content}`
        : message.content;
    }

    if (currentQuestion || currentAnswer) {
      turns.push({
        question: currentQuestion,
        answer: currentAnswer,
      });
    }

    return turns.filter((turn) => turn.question.trim() || turn.answer.trim());
  }

  private buildSummaryText(turns: ConversationTurn[]) {
    if (turns.length === 0) {
      return '';
    }

    return turns
      .map((turn, index) => {
        const question = this.truncateForPrompt(turn.question, 80);
        const answer = this.truncateForPrompt(this.extractAnswerKeyPoint(turn.answer), 100);

        return [
          `较早轮次 ${index + 1}：`,
          question ? `- 用户关注：${question}` : '',
          answer ? `- 已回答要点：${answer}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n');
  }

  private formatTurns(turns: ConversationTurn[], options: { answerMaxChars: number }) {
    if (turns.length === 0) {
      return '';
    }

    return turns
      .map((turn, index) => {
        const question = this.truncateForPrompt(turn.question, 160);
        const answer = this.truncateForPrompt(
          this.extractAnswerKeyPoint(turn.answer),
          options.answerMaxChars,
        );

        return [
          `最近对话 ${index + 1}：`,
          question ? `用户：${question}` : '',
          answer ? `助手：${answer}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n');
  }

  private extractAnswerKeyPoint(answer: string) {
    const normalized = this.normalizeWhitespace(answer);
    if (!normalized) {
      return '';
    }

    const firstSentence = normalized.match(/^(.{1,160}?[。！？!?]|.{1,160})/);
    return firstSentence?.[1]?.trim() || normalized;
  }

  private truncateForPrompt(text: string, maxChars: number) {
    const normalized = this.normalizeWhitespace(text);
    if (!normalized) {
      return '';
    }

    if (normalized.length <= maxChars) {
      return normalized;
    }

    return `${normalized.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
  }

  private normalizeWhitespace(text: string) {
    return text.replace(/\s+/g, ' ').trim();
  }
}

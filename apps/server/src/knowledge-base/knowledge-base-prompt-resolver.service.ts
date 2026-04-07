import { Injectable } from '@nestjs/common';
import type { KnowledgeBasePromptConfig } from '@fullstack/shared';
import { PromptService } from '../ai/prompt.service';
import {
  buildKnowledgeBaseAnswerVariables,
  buildKnowledgeBasePromptOverrideRules,
  buildKnowledgeBaseRetrievalRewriteVariables,
} from '../ai/prompts/knowledge-base.prompts';

/**
 * 知识库问答 Prompt 解析服务
 *
 * 负责把“全局默认 Prompt / Prompt 管理当前模板 / 知识库级补充规则”合并成
 * 当前这次问答真正要发给模型的 Prompt，避免聊天 service 自己拼规则字符串。
 */
@Injectable()
export class KnowledgeBasePromptResolverService {
  constructor(private readonly promptService: PromptService) {}

  async resolveKnowledgeBaseAnswerPrompt(input: {
    question: string;
    contextText: string;
    answerHistoryText?: string;
    conversationSummaryText?: string;
    promptConfig: KnowledgeBasePromptConfig;
  }) {
    const resolvedPrompt = await this.promptService.resolvePrompt(
      'knowledge_base_answer',
      buildKnowledgeBaseAnswerVariables({
        question: input.question,
        contextText: input.contextText,
        answerHistoryText: input.answerHistoryText,
        conversationSummaryText: input.conversationSummaryText,
      }),
    );

    const configRules = buildKnowledgeBasePromptOverrideRules(input.promptConfig);

    return {
      ...resolvedPrompt,
      systemPrompt: [resolvedPrompt.systemPrompt, '', configRules].join('\n'),
    };
  }

  async resolveKnowledgeBaseRetrievalRewritePrompt(input: {
    question: string;
    retrievalHistoryText?: string;
    conversationSummaryText?: string;
  }) {
    return this.promptService.resolvePrompt(
      'knowledge_base_retrieval_rewrite' as never,
      buildKnowledgeBaseRetrievalRewriteVariables({
        question: input.question,
        retrievalHistoryText: input.retrievalHistoryText,
        conversationSummaryText: input.conversationSummaryText,
      }),
    );
  }
}

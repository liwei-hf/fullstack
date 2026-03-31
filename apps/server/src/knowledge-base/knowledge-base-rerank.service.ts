import { Injectable, Logger } from '@nestjs/common';
import { RAG_RERANK_TOP_N } from './knowledge-base.constants';
import { KnowledgeBaseModelService } from './knowledge-base-model.service';
import type { RetrievalCandidate } from './knowledge-base.types';

class ZhipuAIRerankClient {
  constructor(
    private readonly options: {
      apiKey: string;
      model: string;
      topN: number;
      baseURL?: string;
    },
  ) {}

  async rank(question: string, documents: string[]) {
    const response = await fetch(
      `${this.options.baseURL ?? 'https://open.bigmodel.cn/api/paas/v4'}/rerank`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: this.options.model,
          query: question,
          documents,
          top_n: Math.min(this.options.topN, documents.length),
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return (await response.json()) as {
      results?: Array<{
        index: number;
        relevance_score?: number;
      }>;
    };
  }
}

@Injectable()
export class KnowledgeBaseRerankService {
  private readonly logger = new Logger(KnowledgeBaseRerankService.name);

  constructor(private readonly modelService: KnowledgeBaseModelService) {}

  /**
   * rerank 作为独立层抽象：
   * - 没有配置模型时，直接回退到向量召回顺序
   * - 配置了模型时，再做一次轻量重排，提升多文档场景的命中质量
   */
  async rerank(question: string, candidates: RetrievalCandidate[]) {
    if (candidates.length <= 1) {
      return candidates.slice(0, RAG_RERANK_TOP_N);
    }

    const rerankConfig = this.modelService.getRerankConfig();
    if (!rerankConfig) {
      return candidates.slice(0, RAG_RERANK_TOP_N);
    }

    try {
      const reranker = new ZhipuAIRerankClient({
        apiKey: rerankConfig.apiKey,
        model: rerankConfig.model,
        topN: RAG_RERANK_TOP_N,
        baseURL: rerankConfig.baseURL,
      });
      const payload = await reranker.rank(
        question,
        candidates.map((item) => item.content),
      );
      const rankedIds = (payload.results ?? [])
        .map((item) => candidates[item.index])
        .filter(Boolean)
        .map((item) => item.chunkId);
      const rankMap = new Map(rankedIds.map((id, index) => [id, index]));

      return [...candidates]
        .sort((left, right) => {
          const leftRank = rankMap.get(left.chunkId);
          const rightRank = rankMap.get(right.chunkId);

          if (leftRank === undefined && rightRank === undefined) {
            return right.score - left.score;
          }

          if (leftRank === undefined) {
            return 1;
          }

          if (rightRank === undefined) {
            return -1;
          }

          return leftRank - rightRank;
        })
        .slice(0, RAG_RERANK_TOP_N);
    } catch (error) {
      this.logger.warn(
        `rerank 失败，已回退到向量排序: ${error instanceof Error ? error.message : String(error)}`,
      );
      return candidates.slice(0, RAG_RERANK_TOP_N);
    }
  }
}

import { Injectable } from '@nestjs/common';
import type {
  KnowledgeBaseDetail,
  KnowledgeBaseDocumentItem,
  KnowledgeBaseItem,
} from '@fullstack/shared';
import { KNOWLEDGE_BASE_CACHE_TTL_SECONDS } from '../redis/redis.constants';
import { RedisService } from '../redis/redis.service';

/**
 * 知识库缓存服务
 *
 * 这层只缓存热点读接口，保持 key 规则和失效逻辑集中管理，
 * 避免缓存代码散落到多个 service 里难以维护。
 */
@Injectable()
export class KnowledgeBaseCacheService {
  constructor(private readonly redisService: RedisService) {}

  getKnowledgeBaseList() {
    return this.redisService.getJson<KnowledgeBaseItem[]>(this.getListKey());
  }

  setKnowledgeBaseList(items: KnowledgeBaseItem[]) {
    return this.redisService.setJson(this.getListKey(), items, KNOWLEDGE_BASE_CACHE_TTL_SECONDS);
  }

  getKnowledgeBaseDetail(id: string) {
    return this.redisService.getJson<KnowledgeBaseDetail>(this.getDetailKey(id));
  }

  setKnowledgeBaseDetail(id: string, detail: KnowledgeBaseDetail) {
    return this.redisService.setJson(this.getDetailKey(id), detail, KNOWLEDGE_BASE_CACHE_TTL_SECONDS);
  }

  getKnowledgeBaseDocuments(id: string) {
    return this.redisService.getJson<KnowledgeBaseDocumentItem[]>(this.getDocumentsKey(id));
  }

  setKnowledgeBaseDocuments(id: string, items: KnowledgeBaseDocumentItem[]) {
    return this.redisService.setJson(this.getDocumentsKey(id), items, KNOWLEDGE_BASE_CACHE_TTL_SECONDS);
  }

  async invalidateKnowledgeBaseList() {
    await this.redisService.deleteKeys(this.getListKey());
  }

  async invalidateKnowledgeBase(id: string) {
    await this.redisService.deleteKeys(
      this.getListKey(),
      this.getDetailKey(id),
      this.getDocumentsKey(id),
    );
  }

  private getListKey() {
    return 'knowledge-base:list';
  }

  private getDetailKey(id: string) {
    return `knowledge-base:detail:${id}`;
  }

  private getDocumentsKey(id: string) {
    return `knowledge-base:documents:${id}`;
  }
}

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis, { Redis } from 'ioredis';

/**
 * Redis 基础服务
 *
 * 统一提供：
 * - 热点缓存
 * - 多轮对话短期记忆
 * - BullMQ 连接参数
 *
 * 如果本地没有配置 Redis，这里会自动降级为“禁用 Redis 能力”，
 * 避免影响 MVP 其他功能继续运行。
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis | null;
  private readonly redisUrl: string | null;

  constructor(private readonly configService: ConfigService) {
    this.redisUrl = this.resolveRedisUrl();
    this.client = this.redisUrl
      ? new IORedis(this.redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: null,
        })
      : null;

    this.client?.on('error', (error) => {
      this.logger.warn(`Redis 连接异常：${error.message}`);
    });
  }

  isEnabled() {
    return Boolean(this.client);
  }

  async getJson<T>(key: string): Promise<T | null> {
    if (!this.client) {
      return null;
    }

    try {
      await this.ensureConnected();
      const value = await this.client.get(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch (error) {
      this.logger.warn(`Redis 读取失败(${key})：${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number) {
    if (!this.client) {
      return;
    }

    try {
      await this.ensureConnected();
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn(`Redis 写入失败(${key})：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async deleteKeys(...keys: string[]) {
    if (!this.client || keys.length === 0) {
      return;
    }

    try {
      await this.ensureConnected();
      await this.client.del(...keys);
    } catch (error) {
      this.logger.warn(`Redis 删除失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  createBullConnection() {
    if (!this.redisUrl) {
      return null;
    }

    return new IORedis(this.redisUrl, {
      maxRetriesPerRequest: null,
    });
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit().catch(() => this.client?.disconnect());
    }
  }

  private async ensureConnected() {
    if (!this.client) {
      return;
    }

    if (this.client.status === 'wait') {
      await this.client.connect();
    }
  }

  private resolveRedisUrl() {
    const explicitUrl = this.configService.get<string>('REDIS_URL');
    if (explicitUrl) {
      return explicitUrl;
    }

    const host = this.configService.get<string>('REDIS_HOST');
    const port = this.configService.get<string>('REDIS_PORT');
    if (!host || !port) {
      return null;
    }

    const password = this.configService.get<string>('REDIS_PASSWORD');
    const db = this.configService.get<string>('REDIS_DB') || '0';
    const authPart = password ? `:${encodeURIComponent(password)}@` : '';
    return `redis://${authPart}${host}:${port}/${db}`;
  }
}

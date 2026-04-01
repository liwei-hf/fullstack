import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * Redis 模块
 *
 * 作为全局基础设施模块暴露缓存、会话记忆和队列连接能力，
 * 避免每个业务模块各自维护一份 Redis 客户端。
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}

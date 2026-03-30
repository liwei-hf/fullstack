/**
 * Prisma 数据库服务
 *
 * 扩展 PrismaClient，实现 NestJS 生命周期钩子：
 * - onModuleInit：模块初始化时连接数据库
 * - onModuleDestroy：模块销毁时断开数据库连接
 *
 * 使用方式：
 * 在其他 Service 中注入 PrismaService，然后调用数据库操作方法
 *
 * 示例：
 * ```ts
 * constructor(private readonly prisma: PrismaService) {}
 *
 * async findAll() {
 *   return this.prisma.user.findMany();
 * }
 * ```
 */
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  /**
   * 模块初始化时连接数据库
   */
  async onModuleInit() {
    await this.$connect();
  }

  /**
   * 模块销毁时断开数据库连接
   * 防止内存泄漏和资源浪费
   */
  async onModuleDestroy() {
    await this.$disconnect();
  }
}

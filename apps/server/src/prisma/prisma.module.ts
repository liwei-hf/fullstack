/**
 * Prisma 数据库模块
 *
 * 使用 @Global() 装饰器标记为全局模块
 * 在全局模块中注册的提供者（PrismaService）可以在其他模块中直接使用
 * 无需在每个模块中重复导入
 *
 * 使用方式：
 * 在其他 Service 的构造函数中注入 PrismaService 即可
 *
 * 示例：
 * ```ts
 * constructor(private readonly prisma: PrismaService) {}
 * ```
 */
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],  // 导出供其他模块使用
})
export class PrismaModule {}

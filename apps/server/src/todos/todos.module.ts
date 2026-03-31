/**
 * Todo 任务模块
 *
 * 模块定义：
 * - 导入 PrismaModule（数据库访问）
 * - 导入 AuthModule（JWT 认证）
 * - 提供 TodosService（业务逻辑）
 * - 导出 TodosController（REST API）
 */
import { Module } from '@nestjs/common';
import { TodosController } from './todos.controller';
import { TodosService } from './todos.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TodosController],
  providers: [TodosService],
  exports: [TodosService],
})
export class TodosModule {}

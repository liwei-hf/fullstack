/**
 * 用户模块
 *
 * 提供用户管理功能：
 * - UsersController：用户管理 API 接口
 * - UsersService：用户业务逻辑（CRUD、状态管理、密码重置）
 *
 * 导入模块：
 * - SessionsModule：用户禁用时需要撤销会话
 */
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [SessionsModule],  // 导入会话模块（禁用用户时撤销会话）
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],  // 导出服务供其他模块使用（如 AuthModule）
})
export class UsersModule {}

/**
 * 会话模块
 *
 * 提供会话管理服务（SessionsService）
 * 用于其他模块（如 AuthModule、UsersModule）注入和使用
 */
import { Module } from '@nestjs/common';
import { SessionsService } from './sessions.service';

@Module({
  providers: [SessionsService],
  exports: [SessionsService],  // 导出服务供其他模块使用
})
export class SessionsModule {}

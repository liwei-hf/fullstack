/**
 * 应用根模块
 *
 * NestJS 应用的入口模块，负责导入和编排所有功能模块
 *
 * 导入的核心模块：
 * - ConfigModule：环境变量配置，支持类型安全的配置访问
 * - PrismaModule：数据库访问层（全局可用）
 * - SessionsModule：会话管理（登录态、refresh token）
 * - UsersModule：用户管理（CRUD、状态管理）
 * - AuthModule：认证模块（登录、登出、Token 刷新）
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { SessionsModule } from './sessions/sessions.module';

@Module({
  imports: [
    // ConfigModule.forRoot: 全局配置管理
    ConfigModule.forRoot({
      isGlobal: true,  // 全局可用，无需在其他模块重复导入
      envFilePath: '.env',  // 加载 .env 文件中的环境变量
    }),
    PrismaModule,       // 数据库访问
    SessionsModule,     // 会话管理
    UsersModule,        // 用户管理
    AuthModule,         // 认证模块
  ],
})
export class AppModule {}

/**
 * 认证模块
 *
 * 提供用户认证相关功能：
 * - AuthService：认证业务逻辑（登录、刷新 Token、登出）
 * - AuthController：认证 API 接口（/login、/refresh、/logout、/me）
 * - JwtStrategy：JWT Token 验证策略
 *
 * 导入模块：
 * - JwtModule：JWT 生成和验证
 * - PassportModule：Passport 认证框架
 * - ConfigModule：环境变量配置
 * - UsersModule：用户查询
 * - SessionsModule：会话管理
 */
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersModule } from '../users/users.module';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    // JwtModule.registerAsync: 异步配置 JWT 模块
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        // JWT 签名密钥
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        // Token 过期时间配置
        signOptions: {
          expiresIn: configService.get<string>('JWT_ACCESS_EXPIRES_IN') || '15m',
        },
      }),
    }),
    UsersModule,      // 用户查询
    SessionsModule,   // 会话管理
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],  // 导出服务供其他模块使用
})
export class AuthModule {}

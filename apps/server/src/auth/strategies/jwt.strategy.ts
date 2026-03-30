/**
 * JWT 策略
 *
 * 使用 Passport JWT 策略验证 Access Token
 * 核心职责：
 * - 从请求头提取 JWT Token（Authorization: Bearer <token>）
 * - 验证 Token 签名和过期时间
 * - 验证会话是否有效（防止登出后 Token 仍可用）
 * - 返回用户信息供 Controller 使用
 *
 * 工作流程：
 * 1. JwtAuthGuard 拦截请求，调用此策略
 * 2. 策略从 Header 中提取 Token
 * 3. 使用 JWT_SECRET 验证签名
 * 4. 验证会话是否仍然活跃（未登出、未过期）
 * 5. 验证通过后，将 payload 附加到 request.user
 *
 * 安全设计：
 * - Token 验证 + 会话验证双重保障
 * - 即使 Token 未过期，登出后会话被撤销也会拒绝访问
 */
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { SessionsService } from '../../sessions/sessions.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly sessionsService: SessionsService,
  ) {
    super({
      // 从 Authorization Header 中提取 Token（Bearer 格式）
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // 不忽略过期时间（验证过期时间）
      ignoreExpiration: false,
      // JWT 签名密钥（从环境变量读取）
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  /**
   * 验证方法
   *
   * Passport 验证 Token 成功后调用此方法
   * payload 为 JWT 中的签名内容（sub、sessionId、username 等）
   *
   * 验证逻辑：
   * 1. 调用 SessionsService 验证会话是否活跃
   * 2. 会话无效则抛出异常（拒绝访问）
   * 3. 会话有效则返回用户信息
   *
   * @returns 返回用户信息（sub、sessionId、role、status）
   */
  async validate(payload: {
    sub: string;       // 用户 ID
    sessionId: string; // 会话 ID
    username: string;  // 用户名
    role: string;      // 角色
    status: string;    // 状态
  }) {
    // 验证会话是否有效（未撤销、未过期）
    const session = await this.sessionsService.validateAccessSession(
      payload.sessionId,
      payload.sub,
    );

    if (!session) {
      throw new Error('Session invalid');
    }

    return {
      sub: payload.sub,
      sessionId: payload.sessionId,
      role: payload.role,
      status: payload.status,
    };
  }
}

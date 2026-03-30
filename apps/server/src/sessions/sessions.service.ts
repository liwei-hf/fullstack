/**
 * 会话管理服务
 *
 * 核心职责：
 * - 创建会话（登录时生成 Refresh Token 会话）
 * - 会话撤销（登出、禁用用户、重置密码时）
 * - Token 轮转（刷新时更新 Refresh Token）
 * - 会话验证（JWT 策略中验证会话有效性）
 *
 * 会话策略：
 * - 移动端（MOBILE）：单会话，新登录会踢掉旧会话
 * - 管理端（ADMIN）：多会话，允许同时多个活跃会话
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionStatus, ClientType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 创建新会话
   *
   * 登录成功后调用，创建会话记录并设置过期时间
   *
   * @param input.userId - 用户 ID
   * @param input.clientType - 客户端类型（admin/mobile）
   * @param input.deviceId - 设备 ID（可选）
   * @param input.refreshTokenHash - Refresh Token 的哈希（不存储明文）
   * @returns 创建的会话对象
   */
  async createSession(input: {
    userId: string;
    clientType: 'admin' | 'mobile';
    deviceId: string | null;
    refreshTokenHash: string;
  }) {
    const ttlDays = this.configService.get<number>('REFRESH_TOKEN_TTL_DAYS') ?? 7;
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    return this.prisma.session.create({
      data: {
        userId: input.userId,
        clientType: input.clientType === 'admin' ? ClientType.ADMIN : ClientType.MOBILE,
        deviceId: input.deviceId,
        refreshTokenHash: input.refreshTokenHash,
        expiresAt,
      },
    });
  }

  /**
   * 撤销用户所有活跃的移动端会话
   *
   * 用于移动端单会话策略：新登录时撤销之前的所有活跃会话
   *
   * @param userId - 用户 ID
   */
  async revokeActiveMobileSessions(userId: string) {
    await this.prisma.session.updateMany({
      where: {
        userId,
        clientType: ClientType.MOBILE,
        status: SessionStatus.ACTIVE,
      },
      data: {
        status: SessionStatus.REVOKED,
        revokedAt: new Date(),
      },
    });
  }

  /**
   * 撤销用户所有活跃会话
   *
   * 用于以下场景：
   * - 用户被禁用
   * - 密码被重置
   * - 管理员手动让所有设备下线
   *
   * @param userId - 用户 ID
   */
  async revokeAllUserSessions(userId: string) {
    await this.prisma.session.updateMany({
      where: {
        userId,
        status: SessionStatus.ACTIVE,
      },
      data: {
        status: SessionStatus.REVOKED,
        revokedAt: new Date(),
      },
    });
  }

  /**
   * 撤销指定会话
   *
   * 用于用户登出操作
   *
   * @param sessionId - 会话 ID
   */
  async revokeSession(sessionId: string) {
    await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        status: SessionStatus.ACTIVE,
      },
      data: {
        status: SessionStatus.REVOKED,
        revokedAt: new Date(),
      },
    });
  }

  /**
   * 轮转 Refresh Token
   *
   * 刷新 Token 时调用，更新会话的 Refresh Token 哈希和过期时间
   * Token 轮转策略：每次刷新后生成新的 Token，防止重放攻击
   *
   * @param sessionId - 会话 ID
   * @param input.refreshTokenHash - 新的 Refresh Token 哈希
   */
  async rotateRefreshToken(sessionId: string, input: { refreshTokenHash: string }) {
    const ttlDays = this.configService.get<number>('REFRESH_TOKEN_TTL_DAYS') ?? 7;
    await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        refreshTokenHash: input.refreshTokenHash,
        lastActiveAt: new Date(),
        expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
      },
    });
  }

  /**
   * 验证访问会话
   *
   * JWT 策略中使用，验证会话是否有效：
   * - 会话存在
   * - 状态为 ACTIVE
   * - 未过期
   * - 属于当前用户
   *
   * @param sessionId - 会话 ID（从 JWT 中解析）
   * @param userId - 用户 ID（从 JWT 中解析）
   * @returns 会话对象（包含 user 信息）或 null
   */
  async validateAccessSession(sessionId: string, userId: string) {
    return this.prisma.session.findFirst({
      where: {
        id: sessionId,
        userId,
        status: SessionStatus.ACTIVE,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: true,
      },
    });
  }

  /**
   * 根据 Refresh Token 哈希查找活跃会话
   *
   * 刷新 Token 时使用，查找有效的会话记录
   *
   * @param hash - Refresh Token 的 SHA256 哈希
   * @returns 会话对象（包含 user 信息）或 null
   */
  async findActiveSessionByRefreshTokenHash(hash: string) {
    return this.prisma.session.findFirst({
      where: {
        refreshTokenHash: hash,
        status: SessionStatus.ACTIVE,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: true,
      },
    });
  }
}

/**
 * 认证服务
 *
 * 核心职责：
 * - 用户登录验证（账号密码校验）
 * - JWT Token 生成和刷新
 * - 会话管理（创建会话、登出）
 * - 权限控制（管理员/普通用户访问控制）
 *
 * 安全设计：
 * - 密码使用 bcrypt 加密存储
 * - Refresh Token 使用 SHA256 哈希存储
 * - 移动端单会话（新登录踢掉旧会话）
 * - 管理员可多会话并行
 */
import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { LoginDto } from './dto/login.dto';
import { SessionsService } from '../sessions/sessions.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly sessionsService: SessionsService,
  ) {}

  /**
   * 用户登录
   *
   * 流程说明：
   * 1. 根据账号（用户名/手机号）查找用户
   * 2. 验证用户状态（是否被禁用）
   * 3. 验证密码（bcrypt 比较）
   * 4. 检查客户端类型权限（admin 只能管理员登录）
   * 5. 移动端用户：撤销之前的活跃会话（单会话策略）
   * 6. 生成 Refresh Token 并创建会话
   * 7. 更新用户最后登录时间
   * 8. 返回 Access Token 和 Refresh Token
   */
  async login(dto: LoginDto) {
    // 1. 根据账号查找用户（支持用户名或手机号登录）
    const user = await this.usersService.findByAccount(dto.account);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 2. 检查用户状态
    if (user.status === 'DISABLED') {
      throw new ForbiddenException('User disabled');
    }

    // 3. 验证密码（bcrypt 比较）
    const passwordMatched = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordMatched) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 4. 检查客户端类型访问权限
    this.ensureClientAccess(user, dto.clientType);

    // 5. 移动端单会话策略：新登录时撤销之前所有活跃的移动端会话
    if (dto.clientType === 'mobile' && user.role === 'USER') {
      await this.sessionsService.revokeActiveMobileSessions(user.id);
    }

    // 6. 生成 Refresh Token 并创建会话
    const refreshToken = this.generateRefreshToken();
    const session = await this.sessionsService.createSession({
      userId: user.id,
      clientType: dto.clientType,
      deviceId: dto.deviceId ?? null,
      refreshTokenHash: this.hashToken(refreshToken),
    });

    // 7. 更新最后登录时间
    await this.usersService.touchLastLogin(user.id);

    // 8. 返回认证响应
    return this.buildAuthResponse(user, session.id, dto.clientType, refreshToken);
  }

  /**
   * 刷新 Access Token
   *
   * 流程说明：
   * 1. 根据 Refresh Token 查找会话
   * 2. 验证会话是否有效（未过期、未撤销、用户未禁用）
   * 3. 生成新的 Refresh Token（轮转策略）
   * 4. 更新会话的 Refresh Token 哈希
   * 5. 返回新的 Access Token 和 Refresh Token
   *
   * 安全设计：
   * - Refresh Token 轮转：每次刷新后生成新的 Token，防止重放攻击
   */
  async refresh(refreshToken: string) {
    // 1. 根据 Refresh Token 哈希查找会话
    const session = await this.sessionsService.findActiveSessionByRefreshTokenHash(
      this.hashToken(refreshToken),
    );

    if (!session || session.user.status === 'DISABLED') {
      throw new UnauthorizedException('Refresh token expired');
    }

    // 2. 生成新的 Refresh Token（轮转策略）
    const nextRefreshToken = this.generateRefreshToken();

    // 3. 更新会话的 Refresh Token
    await this.sessionsService.rotateRefreshToken(session.id, {
      refreshTokenHash: this.hashToken(nextRefreshToken),
    });

    return this.buildAuthResponse(
      session.user,
      session.id,
      session.clientType.toLowerCase() as 'admin' | 'mobile',
      nextRefreshToken,
    );
  }

  /**
   * 用户登出
   *
   * 撤销当前会话，使 Token 失效
   */
  async logout(sessionId: string) {
    await this.sessionsService.revokeSession(sessionId);
  }

  /**
   * 获取当前用户信息
   *
   * 用于登录后获取用户详情
   */
  async getCurrentUser(user: { sub: string; sessionId: string }) {
    const entity = await this.usersService.findById(user.sub);

    if (!entity) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: entity.id,
      username: entity.username,
      phone: entity.phone,
      nickname: entity.nickname,
      avatar: entity.avatar,
      role: entity.role.toLowerCase(),
      status: entity.status.toLowerCase(),
      sessionId: user.sessionId,
    };
  }

  /**
   * 构建认证响应
   *
   * 统一返回格式，包含用户信息和 Token 信息
   */
  private async buildAuthResponse(
    user: User,
    sessionId: string,
    clientType: 'admin' | 'mobile',
    refreshToken: string,
  ) {
    const expiresIn = this.parseExpiresIn(
      this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') || '15m',
    );

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      sessionId,
      username: user.username,
      phone: user.phone,
      nickname: user.nickname,
      avatar: user.avatar,
      role: user.role.toLowerCase(),
      status: user.status.toLowerCase(),
      clientType,
    });

    return {
      user: {
        id: user.id,
        username: user.username,
        phone: user.phone,
        nickname: user.nickname,
        avatar: user.avatar,
        role: user.role.toLowerCase() as 'admin' | 'user',
        status: user.status.toLowerCase() as 'active' | 'disabled',
        clientType,
        sessionId,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn,
      },
    };
  }

  /**
   * 检查客户端类型访问权限
   *
   * - admin 客户端：只有管理员角色可以登录
   * - mobile 客户端：只有普通用户可以登录
   */
  private ensureClientAccess(user: User, clientType: 'admin' | 'mobile') {
    if (clientType === 'admin' && user.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required');
    }

    if (clientType === 'mobile' && user.role !== 'USER') {
      throw new ForbiddenException('Mobile login only supports user accounts');
    }
  }

  /**
   * 生成 Refresh Token
   *
   * 使用加密安全的随机数生成器
   * 48 字节 = 384 位 = 96 字符十六进制字符串
   */
  private generateRefreshToken() {
    return randomBytes(48).toString('hex');
  }

  /**
   * 哈希 Token
   *
   * 使用 SHA256 哈希存储 Refresh Token
   * 即使数据库泄露，攻击者也无法反推原始 Token
   */
  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * 解析过期时间
   *
   * 将配置文件的 "15m" / "1h" 格式转换为秒数
   * 用于前端 Token 过期处理
   */
  private parseExpiresIn(rawValue: string) {
    if (rawValue.endsWith('m')) {
      return Number(rawValue.replace('m', '')) * 60;
    }

    if (rawValue.endsWith('h')) {
      return Number(rawValue.replace('h', '')) * 60 * 60;
    }

    return Number(rawValue);
  }
}

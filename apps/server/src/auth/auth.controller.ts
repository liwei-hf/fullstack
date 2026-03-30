/**
 * 认证控制器
 *
 * 提供用户认证相关接口：
 * - POST /api/auth/login - 用户登录
 * - POST /api/auth/refresh - 刷新 Token
 * - POST /api/auth/logout - 用户登出（需要登录）
 * - GET /api/auth/me - 获取当前用户信息（需要登录）
 *
 * 登录认证流程：
 * 1. 用户提交账号密码调用 /login
 * 2. 服务端返回 accessToken + refreshToken
 * 3. 客户端携带 accessToken 访问受保护接口
 * 4. accessToken 过期后，使用 refreshToken 调用 /refresh 获取新的 Token 对
 */
import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * 用户登录接口
   *
   * 请求体：
   * - account: 账号（用户名或手机号）
   * - password: 密码
   * - clientType: 客户端类型（'admin' 或 'mobile'）
   * - deviceId: 设备 ID（可选，用于移动端标识设备）
   *
   * 返回：
   * - user: 用户信息（脱敏）
   * - tokens: { accessToken, refreshToken, expiresIn }
   */
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return { data: await this.authService.login(dto) };
  }

  /**
   * 刷新 Token 接口
   *
   * 使用 refreshToken 获取新的 Access Token 和 Refresh Token
   * Token 轮转策略：每次刷新后生成新的 Refresh Token，防止重放攻击
   *
   * 请求体：
   * - refreshToken: 当前的 Refresh Token
   *
   * 返回：
   * - user: 用户信息（脱敏）
   * - tokens: { accessToken, refreshToken, expiresIn }
   */
  @Post('refresh')
  async refresh(@Body() body: { refreshToken: string }) {
    return { data: await this.authService.refresh(body.refreshToken) };
  }

  /**
   * 用户登出接口
   *
   * 撤销当前会话，使 Token 失效
   * 需要 JWT 认证，通过 @CurrentUser 装饰器获取会话信息
   */
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@CurrentUser() user: { sessionId: string }) {
    await this.authService.logout(user.sessionId);
    return { data: { success: true } };
  }

  /**
   * 获取当前用户信息
   *
   * 用于登录后获取用户详情，或页面刷新后恢复用户状态
   * 需要 JWT 认证
   *
   * 返回：
   * - id: 用户 ID
   * - username: 用户名
   * - phone: 手机号
   * - nickname: 昵称
   * - avatar: 头像 URL
   * - role: 角色（admin/user）
   * - status: 状态（active/disabled）
   * - sessionId: 当前会话 ID
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: { sub: string; sessionId: string }) {
    return { data: await this.authService.getCurrentUser(user) };
  }
}

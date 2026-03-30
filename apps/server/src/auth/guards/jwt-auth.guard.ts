/**
 * JWT 认证守卫
 *
 * 使用 @nestjs/passport 的 AuthGuard，基于 'jwt' 策略
 * 用于保护需要登录才能访问的接口
 *
 * 使用方式：
 * 在 Controller 方法上使用 @UseGuards(JwtAuthGuard) 装饰器
 *
 * 示例：
 * ```ts
 * @UseGuards(JwtAuthGuard)
 * @Get('profile')
 * async getProfile(@CurrentUser() user: CurrentUser) {
 *   // 只有登录用户才能访问
 * }
 * ```
 *
 * 工作原理：
 * 1. 检查请求头中的 Authorization: Bearer <token>
 * 2. 验证 JWT Token 的签名和过期时间
 * 3. 验证通过后，将 payload 附加到 request.user
 * 4. 验证失败则返回 401 未授权
 */
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

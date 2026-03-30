/**
 * CurrentUser 装饰器
 *
 * 用于 Controller 方法参数中，快速获取当前登录用户信息
 *
 * 使用示例：
 * ```ts
 * @UseGuards(JwtAuthGuard)
 * @Get('profile')
 * async getProfile(@CurrentUser() user: CurrentUser) {
 *   return { data: user };
 * }
 *
 * // 或者从 auth-store 中获取完整用户信息
 * @Get('me')
 * async me(@CurrentUser() user: { sub: string; sessionId: string }) {
 *   return { data: await this.authService.getCurrentUser(user) };
 * }
 * ```
 *
 * 工作原理：
 * 1. JwtAuthGuard 验证 Token 后，将 payload 附加到 request.user
 * 2. @CurrentUser() 装饰器从 request 对象中提取 user 信息
 * 3. Controller 方法可以直接使用用户信息
 */
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

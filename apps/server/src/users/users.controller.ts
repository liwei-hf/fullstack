/**
 * 用户管理控制器
 *
 * 管理端用户管理接口，提供以下功能：
 * - 用户列表查询（支持分页、搜索）
 * - 创建用户
 * - 更新用户信息
 * - 禁用/启用用户
 * - 重置用户密码
 *
 * 路由前缀：/api/admin/users
 */
import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('admin/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * 用户列表查询
   *
   * 查询参数：
   * - page: 页码（默认 1）
   * - pageSize: 每页数量（默认 10）
   * - q: 搜索关键字（模糊匹配用户名、手机号、昵称）
   */
  @Get()
  async listUsers(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('q') q?: string,
  ) {
    return {
      data: await this.usersService.listUsers({
        page: page ? Number(page) : 1,
        pageSize: pageSize ? Number(pageSize) : 10,
        q,
      }),
    };
  }

  /**
   * 创建新用户
   *
   * 请求体：
   * - username: 用户名（必填，需唯一）
   * - phone: 手机号（必填，需唯一）
   * - nickname: 昵称（必填）
   * - avatar: 头像 URL（可选）
   */
  @Post()
  async createUser(@Body() body: { username: string; phone: string; nickname: string; avatar?: string | null }) {
    return { data: await this.usersService.createUser(body) };
  }

  /**
   * 更新用户信息
   *
   * 请求体（所有字段可选）：
   * - username: 新用户名
   * - phone: 新手机号
   * - nickname: 新昵称
   * - avatar: 新头像 URL
   */
  @Patch(':id')
  async updateUser(
    @Param('id') id: string,
    @Body() body: { username?: string; phone?: string; nickname?: string; avatar?: string | null },
  ) {
    return { data: await this.usersService.updateUser(id, body) };
  }

  /**
   * 更新用户状态
   *
   * 请求体：
   * - status: 'active' | 'disabled'
   *
   * 禁用用户时会同时撤销该用户的所有活跃会话
   */
  @Patch(':id/status')
  async updateUserStatus(@Param('id') id: string, @Body() body: { status: 'active' | 'disabled' }) {
    return { data: await this.usersService.updateUserStatus(id, body.status) };
  }

  /**
   * 重置用户密码
   *
   * 将用户密码重置为配置的默认密码
   * 同时撤销该用户的所有活跃会话（需要重新登录）
   *
   * 返回：
   * - success: 是否成功
   * - defaultPassword: 重置后的默认密码（用于管理员告知用户）
   */
  @Post(':id/reset-password')
  async resetPassword(@Param('id') id: string) {
    return { data: await this.usersService.resetPassword(id) };
  }
}

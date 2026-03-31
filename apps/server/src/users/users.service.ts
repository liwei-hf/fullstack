/**
 * 用户服务
 *
 * 核心职责：
 * - 用户 CRUD 操作（创建、查询、更新、删除）
 * - 用户状态管理（激活/禁用）
 * - 密码重置
 * - 登录时间更新
 * - 唯一性校验（用户名、手机号）
 */
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsService } from '../sessions/sessions.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly sessionsService: SessionsService,
  ) {}

  /**
   * 根据 ID 查找用户
   */
  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /**
   * 根据账号查找用户（支持用户名或手机号）
   * 用于登录时根据用户输入的账号（可能是用户名或手机号）查找用户
   */
  findByAccount(account: string) {
    return this.prisma.user.findFirst({
      where: {
        OR: [{ username: account }, { phone: account }],
      },
    });
  }

  /**
   * 更新用户最后登录时间
   * 用户登录成功后调用，记录最近登录时间用于统计和审计
   */
  async touchLastLogin(id: string) {
    await this.prisma.user.update({
      where: { id },
      data: {
        lastLoginAt: new Date(),
      },
    });
  }

  /**
   * 用户列表查询（支持分页和搜索）
   *
   * 查询条件：
   * - 固定筛选 role=USER（只查普通用户，不包含管理员）
 * - 可选关键字搜索（用户名、手机号模糊匹配）
   * - 按创建时间倒序排序
   *
   * 返回格式：
   * - items: 用户列表（已脱敏处理）
   * - meta: 分页元信息（当前页、每页数量、总数）
   */
  async listUsers(query: { page?: number; pageSize?: number; q?: string }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const skip = (page - 1) * pageSize;
    const keyword = query.q?.trim();

    const where: Prisma.UserWhereInput = {
      role: UserRole.USER,
      ...(keyword
        ? {
            OR: [
              { username: { contains: keyword, mode: 'insensitive' } },
              { phone: { contains: keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          department: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toUserListItem(item)),
      meta: {
        page,
        pageSize,
        total,
      },
    };
  }

  /**
   * 创建新用户
   *
   * 业务逻辑：
   * 1. 校验用户名和手机号唯一性
   * 2. 使用配置的默认密码（环境变量或默认值）
   * 3. bcrypt 加密密码
   * 4. 创建用户，角色固定为 USER，状态为 ACTIVE
   *
   * @returns 返回创建后的用户信息（脱敏）
   */
  async createUser(dto: { username: string; phone: string; departmentId?: string }) {
    await this.ensureUniqueFields(dto.username, dto.phone);

    const defaultPassword = this.configService.get<string>('DEFAULT_USER_PASSWORD') || 'ChangeMe123!';
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        phone: dto.phone,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        passwordHash,
        departmentId: dto.departmentId,
      },
      include: {
        department: true,
      },
    });

    return this.toUserListItem(user);
  }

  /**
   * 更新用户信息
   *
   * 业务逻辑：
   * 1. 检查用户是否存在
   * 2. 如果修改了用户名/手机号，重新校验唯一性（排除当前用户）
   * 3. 更新用户信息
   *
   * @returns 返回更新后的用户信息（脱敏）
   */
  async updateUser(id: string, dto: { username?: string; phone?: string; departmentId?: string }) {
    const existingUser = await this.findUserOrThrow(id);

    if (dto.username && dto.username !== existingUser.username) {
      await this.ensureUniqueFields(dto.username, undefined, id);
    }

    if (dto.phone && dto.phone !== existingUser.phone) {
      await this.ensureUniqueFields(undefined, dto.phone, id);
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        username: dto.username,
        phone: dto.phone,
        departmentId: dto.departmentId,
      },
      include: {
        department: true,
      },
    });

    return this.toUserListItem(user);
  }

  /**
   * 更新用户状态
   *
   * 业务逻辑：
   * 1. 检查用户是否存在
   * 2. 更新用户状态（ACTIVE/DISABLED）
   * 3. 如果禁用用户，同时撤销该用户的所有活跃会话（强制下线）
   *
   * @param status - 'active' | 'disabled'
   * @returns 返回更新后的用户信息（脱敏）
   */
  async updateUserStatus(id: string, status: 'active' | 'disabled') {
    await this.findUserOrThrow(id);

    const nextStatus = status === 'active' ? UserStatus.ACTIVE : UserStatus.DISABLED;

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        status: nextStatus,
      },
      include: {
        department: true,
      },
    });

    if (nextStatus === UserStatus.DISABLED) {
      await this.sessionsService.revokeAllUserSessions(id);
    }

    return this.toUserListItem(user);
  }

  /**
   * 重置用户密码
   *
   * 业务逻辑：
   * 1. 检查用户是否存在
   * 2. 使用配置的默认密码重置
   * 3. 撤销该用户的所有活跃会话（需要重新登录）
   *
   * @returns 返回成功标志和默认密码（用于管理员告知用户）
   */
  async resetPassword(id: string) {
    await this.findUserOrThrow(id);

    const defaultPassword = this.configService.get<string>('DEFAULT_USER_PASSWORD') || 'ChangeMe123!';
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash,
      },
    });

    await this.sessionsService.revokeAllUserSessions(id);

    return {
      success: true,
      defaultPassword,
    };
  }

  /**
   * 删除用户
   *
   * 业务逻辑：
   * 1. 检查用户是否存在
   * 2. 检查用户状态是否为 DISABLED（只有停用的才能删除）
   * 3. 删除用户关联的所有会话
   * 4. 删除用户记录
   *
   * @returns 返回成功标志
   * @throws ConflictException 当用户状态不是 DISABLED 时
   */
  async deleteUser(id: string) {
    const user = await this.findUserOrThrow(id);

    // 只有停用的用户才能删除
    if (user.status !== UserStatus.DISABLED) {
      throw new ConflictException('只能删除已停用的用户');
    }

    // 先删除关联的会话（外键约束）
    await this.prisma.session.deleteMany({
      where: { userId: id },
    });

    // 删除用户
    await this.prisma.user.delete({
      where: { id },
    });

    return { success: true };
  }

  /**
   * 查找用户（内部方法）
   *
   * 如果用户不存在或不是普通用户，抛出 404 异常
   * 用于确保操作的对象是有效的普通用户（排除管理员）
   */
  private async findUserOrThrow(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user || user.role !== UserRole.USER) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * 校验字段唯一性（内部方法）
   *
   * 检查用户名或手机号是否已被其他用户使用
   * excludeId 参数用于更新时排除当前用户自身
   */
  private async ensureUniqueFields(username?: string, phone?: string, excludeId?: string) {
    if (!username && !phone) {
      return;
    }

    const existing = await this.prisma.user.findFirst({
      where: {
        AND: [
          excludeId ? { id: { not: excludeId } } : {},
          {
            OR: [...(username ? [{ username }] : []), ...(phone ? [{ phone }] : [])],
          },
        ],
      },
    });

    if (existing) {
      throw new ConflictException('Username or phone already exists');
    }
  }

  /**
   * 转换用户数据为列表项格式（内部方法）
   *
   * 脱敏处理：
   * - 不返回 passwordHash
   * - 角色和状态转为小写字符串
   * - 时间字段转为 ISO 字符串格式
   */
  private toUserListItem(user: {
    id: string;
    username: string;
    phone: string;
    role: UserRole;
    status: UserStatus;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    department?: { id: string; name: string; description: string | null } | null;
  }) {
    return {
      id: user.id,
      username: user.username,
      phone: user.phone,
      role: user.role.toLowerCase(),
      status: user.status.toLowerCase(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      department: user.department ?? null,
    };
  }
}

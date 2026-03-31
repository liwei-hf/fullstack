/**
 * Todo 任务服务
 *
 * 核心职责：
 * - Todo 任务的 CRUD 操作（创建、查询、更新、删除）
 * - 任务状态管理（TODO / IN_PROGRESS / DONE）
 * - 按用户隔离数据（每个用户只能访问自己的任务）
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';

@Injectable()
export class TodosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 创建新任务
   *
   * 业务逻辑：
   * 1. 使用当前登录用户的 ID 作为任务所属者
   * 2. 状态默认为 TODO（待办）
   * 3. 描述字段可选
   *
   * @param userId - 当前登录用户 ID
   * @param dto - 创建任务请求数据
   * @returns 返回创建后的任务信息
   */
  async createTodo(userId: string, dto: CreateTodoDto) {
    const todo = await this.prisma.todo.create({
      data: {
        userId,
        title: dto.title,
        description: dto.description,
        status: 'TODO', // 默认状态为待办
      },
    });

    return this.toTodoResponse(todo);
  }

  /**
   * 获取当前用户的任务列表
   *
   * 业务逻辑：
   * 1. 只查询当前登录用户的任务（数据隔离）
   * 2. 按状态筛选（可选）
   * 3. 按创建时间倒序排序（新任务在前）
   * 4. 支持分页
   *
   * @param userId - 当前登录用户 ID
   * @param query - 查询参数（状态筛选、分页）
   * @returns 返回任务列表和分页元信息
   */
  async listTodos(
    userId: string,
    query: { status?: string; page?: number; pageSize?: number },
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const skip = (page - 1) * pageSize;

    const where: any = {
      userId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.todo.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.todo.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toTodoResponse(item)),
      meta: {
        page,
        pageSize,
        total,
      },
    };
  }

  /**
   * 获取单个任务详情
   *
   * 业务逻辑：
   * 1. 检查任务是否存在
   * 2. 验证任务属于当前用户（权限控制）
   *
   * @param id - 任务 ID
   * @param userId - 当前登录用户 ID
   * @returns 返回任务详情
   * @throws NotFoundException 当任务不存在或不属于当前用户时
   */
  async getTodo(id: string, userId: string) {
    const todo = await this.prisma.todo.findUnique({
      where: { id },
    });

    if (!todo || todo.userId !== userId) {
      throw new NotFoundException('Todo not found');
    }

    return this.toTodoResponse(todo);
  }

  /**
   * 更新任务
   *
   * 业务逻辑：
   * 1. 检查任务是否存在且属于当前用户
   * 2. 更新指定字段（title/description/status）
   * 3. 返回更新后的任务信息
   *
   * @param id - 任务 ID
   * @param userId - 当前登录用户 ID
   * @param dto - 更新请求数据
   * @returns 返回更新后的任务信息
   * @throws NotFoundException 当任务不存在或不属于当前用户时
   */
  async updateTodo(id: string, userId: string, dto: UpdateTodoDto) {
    const todo = await this.findTodoOrThrow(id, userId);

    const updated = await this.prisma.todo.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        status: dto.status,
      },
    });

    return this.toTodoResponse(updated);
  }

  /**
   * 删除任务
   *
   * 业务逻辑：
   * 1. 检查任务是否存在且属于当前用户
   * 2. 物理删除任务记录
   *
   * @param id - 任务 ID
   * @param userId - 当前登录用户 ID
   * @returns 返回成功标志
   * @throws NotFoundException 当任务不存在或不属于当前用户时
   */
  async deleteTodo(id: string, userId: string) {
    await this.findTodoOrThrow(id, userId);

    await this.prisma.todo.delete({
      where: { id },
    });

    return { success: true };
  }

  /**
   * 查找任务（内部方法）
   *
   * 如果任务不存在或不属于当前用户，抛出 404 异常
   * 用于权限校验和数据隔离
   *
   * @throws NotFoundException
   */
  private async findTodoOrThrow(id: string, userId: string) {
    const todo = await this.prisma.todo.findUnique({
      where: { id },
    });

    if (!todo || todo.userId !== userId) {
      throw new NotFoundException('Todo not found');
    }

    return todo;
  }

  /**
   * 转换 Todo 数据为响应格式（内部方法）
   *
   * 数据格式转换：
   * - 时间字段转为 ISO 字符串格式
   */
  private toTodoResponse(todo: {
    id: string;
    userId: string;
    title: string;
    description: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: todo.id,
      userId: todo.userId,
      title: todo.title,
      description: todo.description,
      status: todo.status,
      createdAt: todo.createdAt.toISOString(),
      updatedAt: todo.updatedAt.toISOString(),
    };
  }
}

/**
 * Todo 任务控制器
 *
 * 任务管理接口，提供以下功能：
 * - 任务列表查询（支持分页、状态筛选）
 * - 创建新任务
 * - 更新任务信息
 * - 更新任务状态
 * - 删除任务
 *
 * 路由前缀：/api/todos
 * 所有接口都需要 JWT 认证
 */
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TodosService } from './todos.service';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { CurrentUser } from '../common/decorators/current-user';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('todos')
@UseGuards(JwtAuthGuard)
export class TodosController {
  constructor(private readonly todosService: TodosService) {}

  /**
   * 获取当前用户的任务列表
   *
   * 查询参数：
   * - status: 状态筛选（TODO | IN_PROGRESS | DONE）
   * - page: 页码（默认 1）
   * - pageSize: 每页数量（默认 10）
   */
  @Get()
  async listTodos(
    @CurrentUser() user: { sub: string; role: string; status: string },
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return {
      data: await this.todosService.listTodos(user.sub, {
        status,
        page: page ? Number(page) : 1,
        pageSize: pageSize ? Number(pageSize) : 10,
      }),
    };
  }

  /**
   * 获取单个任务详情
   *
   * @param id - 任务 ID
   */
  @Get(':id')
  async getTodo(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return { data: await this.todosService.getTodo(id, user.sub) };
  }

  /**
   * 创建新任务
   *
   * 请求体：
   * - title: 任务标题（必填）
   * - description: 任务描述（可选）
   *
   * 创建后状态默认为 TODO（待办）
   */
  @Post()
  async createTodo(
    @CurrentUser() user: { sub: string },
    @Body() dto: CreateTodoDto,
  ) {
    return { data: await this.todosService.createTodo(user.sub, dto) };
  }

  /**
   * 更新任务信息
   *
   * 请求体（所有字段可选）：
   * - title: 新标题
   * - description: 新描述
   * - status: 新状态
   */
  @Patch(':id')
  async updateTodo(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Body() dto: UpdateTodoDto,
  ) {
    return { data: await this.todosService.updateTodo(id, user.sub, dto) };
  }

  /**
   * 快速更新任务状态
   *
   * 请求体：
   * - status: 新状态（TODO | IN_PROGRESS | DONE）
   *
   * 用于快速切换任务状态，无需提交整个任务数据
   */
  @Patch(':id/status')
  async updateTodoStatus(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Body() body: { status: 'TODO' | 'IN_PROGRESS' | 'DONE' },
  ) {
    return {
      data: await this.todosService.updateTodo(id, user.sub, {
        status: body.status,
      }),
    };
  }

  /**
   * 删除任务
   *
   * 物理删除任务记录，删除后不可恢复
   */
  @Delete(':id')
  async deleteTodo(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return { data: await this.todosService.deleteTodo(id, user.sub) };
  }
}

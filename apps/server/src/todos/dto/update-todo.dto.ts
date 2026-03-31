/**
 * 更新 Todo 请求 DTO
 *
 * 用于验证更新任务时的请求参数：
 * - 所有字段可选（Partial）
 * - title: 任务标题
 * - description: 任务描述
 * - status: 任务状态
 */
import { IsEnum, IsOptional, MinLength, MaxLength } from 'class-validator';
import { TodoStatus } from '@prisma/client';

export class UpdateTodoDto {
  /**
   * 任务标题
   * 可选，1-100 字符
   */
  @IsOptional()
  @MinLength(1, { message: 'Title must not be empty' })
  @MaxLength(100, { message: 'Title must not exceed 100 characters' })
  title?: string;

  /**
   * 任务描述
   * 可选，最多 500 字符
   */
  @IsOptional()
  @MaxLength(500, { message: 'Description must not exceed 500 characters' })
  description?: string;

  /**
   * 任务状态
   * 可选，枚举值：TODO | IN_PROGRESS | DONE
   */
  @IsOptional()
  @IsEnum(TodoStatus, { message: 'Invalid status value' })
  status?: TodoStatus;
}

/**
 * 创建 Todo 请求 DTO
 *
 * 用于验证创建任务时的请求参数：
 * - title: 必填，任务标题
 * - description: 可选，任务描述
 */
import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

export class CreateTodoDto {
  /**
   * 任务标题
   * 必填，1-100 字符
   */
  @IsString()
  @MinLength(1, { message: 'Title is required' })
  @MaxLength(100, { message: 'Title must not exceed 100 characters' })
  title: string;

  /**
   * 任务描述
   * 可选，最多 500 字符
   */
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Description must not exceed 500 characters' })
  description?: string;
}

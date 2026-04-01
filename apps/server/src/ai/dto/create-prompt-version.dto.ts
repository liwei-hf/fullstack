import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * 创建 Prompt 版本 DTO
 *
 * 第一版允许管理员直接编辑 systemPrompt 和 userPromptTemplate，
 * 并可选维护一份变量结构说明，方便测试台和后续回滚。
 */
export class CreatePromptVersionDto {
  @IsString()
  @MinLength(1)
  systemPrompt!: string;

  @IsString()
  @MinLength(1)
  userPromptTemplate!: string;

  @IsOptional()
  @IsObject()
  variablesSchema?: Record<string, unknown>;
}

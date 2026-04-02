import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * 更新 Prompt 模板 DTO
 *
 * 当前版本不再维护多版本草稿，而是直接编辑模板当前生效内容，
 * 让 Prompt 管理更贴近“配置中心”的使用方式。
 */
export class UpdatePromptTemplateDto {
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

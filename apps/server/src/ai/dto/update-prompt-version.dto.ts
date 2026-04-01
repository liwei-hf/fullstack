import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * 更新 Prompt 草稿 DTO
 *
 * 当前只允许更新草稿版本，避免已发布版本被静默篡改。
 */
export class UpdatePromptVersionDto {
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

import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 自然语言查数请求 DTO
 */
export class AiSqlStreamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  question!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sessionId?: string;
}

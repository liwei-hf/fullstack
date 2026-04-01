import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { PROMPT_TEMPLATE_CODES } from '@fullstack/shared';

/**
 * Prompt 测试 DTO
 *
 * 测试台通过这个 DTO 传模板编码、可选版本和变量，
 * 服务端负责解析模板、调用模型并记录测试日志。
 */
export class PromptTestDto {
  @IsString()
  @IsIn(PROMPT_TEMPLATE_CODES)
  templateCode!: (typeof PROMPT_TEMPLATE_CODES)[number];

  @IsOptional()
  @IsString()
  promptVersionId?: string;

  @IsObject()
  variables!: Record<string, unknown>;
}

import {
  IsIn,
  IsObject,
  IsString,
} from 'class-validator';
import { PROMPT_TEMPLATE_CODES } from '@fullstack/shared';

/**
 * Prompt 测试 DTO
 *
 * 测试台通过这个 DTO 传模板编码和变量，
 * 服务端负责读取当前模板内容、调用模型并记录测试日志。
 */
export class PromptTestDto {
  @IsString()
  @IsIn(PROMPT_TEMPLATE_CODES)
  templateCode!: (typeof PROMPT_TEMPLATE_CODES)[number];

  @IsObject()
  variables!: Record<string, unknown>;
}

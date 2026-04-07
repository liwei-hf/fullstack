import { IsIn, IsString } from 'class-validator';
import { AI_SQL_VISIBILITIES, type AiSqlVisibility } from '@fullstack/shared';

/**
 * AI 设置更新 DTO
 *
 * 当前只开放智能问数 SQL 展示策略，
 * 用 DTO 先把合法值边界收口在接口层，避免非法字符串直接写进数据库。
 */
export class UpdateAiSettingsDto {
  @IsString()
  @IsIn(AI_SQL_VISIBILITIES)
  sqlVisibility!: AiSqlVisibility;
}

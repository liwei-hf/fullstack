/**
 * 更新部门 DTO
 */
import { IsOptional, IsString } from 'class-validator';

export class UpdateDepartmentDto {
  /**
   * 部门名称（可选）
   */
  @IsOptional()
  @IsString()
  name?: string;

  /**
   * 部门描述（可选）
   */
  @IsOptional()
  @IsString()
  description?: string;
}

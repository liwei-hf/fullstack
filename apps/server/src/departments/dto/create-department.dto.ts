/**
 * 创建部门 DTO
 */
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateDepartmentDto {
  /**
   * 部门名称
   */
  @IsString()
  @IsNotEmpty()
  name!: string;

  /**
   * 部门描述（可选）
   */
  @IsOptional()
  @IsString()
  description?: string;
}

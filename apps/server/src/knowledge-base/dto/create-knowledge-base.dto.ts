import { IsOptional, IsString, MaxLength } from 'class-validator';

// 创建知识库的入参约束，控制名称和描述的长度，避免异常超长文本进入数据库。
export class CreateKnowledgeBaseDto {
  @IsString()
  @MaxLength(50)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

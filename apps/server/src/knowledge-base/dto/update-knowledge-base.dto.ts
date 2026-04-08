import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  KNOWLEDGE_BASE_ANSWER_STYLES,
  KNOWLEDGE_BASE_CITATION_MODES,
  type KnowledgeBaseAnswerStyle,
  type KnowledgeBaseCitationMode,
} from '@fullstack/shared';

/**
 * 更新知识库 DTO
 *
 * 当前知识库只保留一段补充提示词文本，
 * 运行时统一叠加到知识库问答模板上。
 */
export class UpdateKnowledgeBaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  systemPromptOverride?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  suggestedQuestions?: string[];

  @IsOptional()
  @IsIn(KNOWLEDGE_BASE_ANSWER_STYLES)
  answerStyle?: KnowledgeBaseAnswerStyle;

  @IsOptional()
  @IsIn(KNOWLEDGE_BASE_CITATION_MODES)
  citationMode?: KnowledgeBaseCitationMode;

  @IsOptional()
  @IsBoolean()
  strictMode?: boolean;
}

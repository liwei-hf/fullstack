import { KNOWLEDGE_BASE_CHUNK_STRATEGIES, type KnowledgeBaseChunkStrategy } from '@fullstack/shared';
import { IsIn, IsOptional } from 'class-validator';

// 上传文档时允许管理员显式选择切片策略，不传则走默认 fixed。
export class UploadDocumentDto {
  @IsOptional()
  @IsIn(KNOWLEDGE_BASE_CHUNK_STRATEGIES)
  chunkStrategy?: KnowledgeBaseChunkStrategy;
}

import { KNOWLEDGE_BASE_CHUNK_STRATEGIES, type KnowledgeBaseChunkStrategy } from '@fullstack/shared';
import { IsIn, IsOptional } from 'class-validator';

// ZIP 批量导入同样允许管理员指定切片策略，不传则沿用默认 fixed。
export class ImportZipDto {
  @IsOptional()
  @IsIn(KNOWLEDGE_BASE_CHUNK_STRATEGIES)
  chunkStrategy?: KnowledgeBaseChunkStrategy;
}

import type { KnowledgeBaseChunkStrategy } from '@fullstack/shared';

// 默认切片策略保持 fixed，保证没有显式选择时也能稳定工作。
export const DEFAULT_CHUNK_STRATEGY: KnowledgeBaseChunkStrategy = 'fixed';

// 前端和共享层使用小写策略名，落库时转换成 Prisma 枚举值。
export function toPersistenceChunkStrategy(
  strategy?: KnowledgeBaseChunkStrategy,
): 'FIXED' | 'PARAGRAPH' | 'HEADING' {
  switch (strategy) {
    case 'paragraph':
      return 'PARAGRAPH';
    case 'heading':
      return 'HEADING';
    case 'fixed':
    default:
      return 'FIXED';
  }
}

// 读取数据库记录时再把 Prisma 枚举值转换回前端友好的共享契约值。
export function fromPersistenceChunkStrategy(
  strategy: 'FIXED' | 'PARAGRAPH' | 'HEADING',
): KnowledgeBaseChunkStrategy {
  switch (strategy) {
    case 'PARAGRAPH':
      return 'paragraph';
    case 'HEADING':
      return 'heading';
    case 'FIXED':
    default:
      return 'fixed';
  }
}

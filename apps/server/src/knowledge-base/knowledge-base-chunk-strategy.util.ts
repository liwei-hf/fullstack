import type { KnowledgeBaseChunkStrategy } from '@fullstack/shared';

// 默认切片策略保持 fixed，保证没有显式选择时也能稳定工作。
export const DEFAULT_CHUNK_STRATEGY: KnowledgeBaseChunkStrategy = 'fixed';

// 前端和共享层只暴露 fixed / recursive 两种策略。
// 持久化层继续兼容旧的 PARAGRAPH / HEADING，避免历史数据失效。
export function toPersistenceChunkStrategy(
  strategy?: KnowledgeBaseChunkStrategy,
): 'FIXED' | 'PARAGRAPH' | 'HEADING' {
  switch (strategy) {
    case 'recursive':
      return 'PARAGRAPH';
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
    case 'HEADING':
      return 'recursive';
    case 'FIXED':
    default:
      return 'fixed';
  }
}

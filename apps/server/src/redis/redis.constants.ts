/**
 * Redis 相关常量
 *
 * 这里统一维护缓存、队列和会话记忆的基础配置，
 * 方便后续根据业务规模调整 TTL、并发和保留长度。
 */
export const KNOWLEDGE_BASE_CACHE_TTL_SECONDS = 60;
export const AI_SESSION_MEMORY_TTL_SECONDS = 60 * 60 * 2;
export const AI_SESSION_MEMORY_MAX_TURNS = 3;
export const KNOWLEDGE_BASE_QUEUE_NAME = 'knowledge-base-ingestion';
export const KNOWLEDGE_BASE_QUEUE_JOB_NAME = 'process-document';
export const KNOWLEDGE_BASE_IMPORT_ZIP_QUEUE_JOB_NAME = 'import-zip';

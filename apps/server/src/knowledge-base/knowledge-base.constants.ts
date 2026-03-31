/**
 * RAG 检索与上下文预算常量
 *
 * 说明：
 * - 第一版先用固定参数，保证回答质量和 token 成本可控
 * - 后续如果要做 A/B 或按知识库动态调优，再把这些常量下沉为配置项
 */
export const RAG_CHUNK_SIZE = 800;
export const RAG_CHUNK_OVERLAP = 150;
export const RAG_VECTOR_TOP_K = 20;
export const RAG_RERANK_TOP_N = 8;
export const RAG_FINAL_CONTEXT_MAX_CHUNKS = 6;
export const RAG_MAX_CHUNKS_PER_DOCUMENT = 2;
export const RAG_CONTEXT_MAX_CHARS = 6000;
export const RAG_SOURCE_SNIPPET_MAX_CHARS = 220;
export const RAG_UPLOAD_MAX_FILE_SIZE = 20 * 1024 * 1024;

export const SUPPORTED_DOCUMENT_EXTENSIONS = ['.pdf', '.md', '.markdown', '.txt', '.docx'];

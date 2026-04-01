/*
 * @Author: liwei
 * @Date: 2026-03-31 17:03:56
 * @LastEditors: liwei
 * @LastEditTime: 2026-04-01 12:10:15
 * @Description: 
 * 
 */
/**
 * RAG 检索与上下文预算常量
 *
 * 说明：
 * - 第一版先用固定参数，保证回答质量和 token 成本可控
 * - 后续如果要做 A/B 或按知识库动态调优，再把这些常量下沉为配置项
 */
// 单个 chunk 的目标字符数，决定文档切片的基础粒度。
export const RAG_CHUNK_SIZE = 1000;
// 相邻 chunk 的重叠字符数，降低语义被硬切断后丢上下文的概率。
export const RAG_CHUNK_OVERLAP = 200;
// 向量检索阶段先召回的候选数量，给 rerank 留出足够的候选空间。
export const RAG_VECTOR_TOP_K = 20;
// rerank 之后保留的候选上限，避免太多低相关片段进入上下文。
export const RAG_RERANK_TOP_N = 8;
// 最终真正喂给回答模型的 chunk 数量上限，控制上下文长度和成本。
export const RAG_FINAL_CONTEXT_MAX_CHUNKS = 6;
// 同一文档最多允许进入上下文的 chunk 数，防止某一份文档独占检索结果。
export const RAG_MAX_CHUNKS_PER_DOCUMENT = 3;
// 最终上下文的总字符预算，避免 prompt 过长导致回答变慢或超限。
export const RAG_CONTEXT_MAX_CHARS = 8000;
// 引用来源展示时的摘要长度上限，保证前端展示紧凑可读。
export const RAG_SOURCE_SNIPPET_MAX_CHARS = 220;
// 单个上传文件的大小限制，避免解析、向量化和存储链路压力过大。
export const RAG_UPLOAD_MAX_FILE_SIZE = 20 * 1024 * 1024;

export const SUPPORTED_DOCUMENT_EXTENSIONS = ['.pdf', '.md', '.markdown', '.txt', '.docx'];

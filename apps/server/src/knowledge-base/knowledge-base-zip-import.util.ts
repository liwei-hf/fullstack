import { extname, posix } from 'path';
import {
  KNOWLEDGE_BASE_IMPORT_IGNORED_DIRECTORIES,
  SUPPORTED_DOCUMENT_EXTENSIONS,
} from './knowledge-base.constants';

const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.txt': 'text/plain',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/**
 * 规范化 ZIP 条目路径，并做最基础的安全校验。
 *
 * - 统一斜杠风格，方便后续按相对路径保存到 document.fileName
 * - 拦截绝对路径、父级跳转等典型 Zip Slip 场景
 */
export function normalizeZipEntryPath(entryName: string) {
  const unixPath = entryName.replace(/\\/g, '/');
  const normalized = posix.normalize(unixPath);

  if (
    !normalized ||
    normalized === '.' ||
    normalized.startsWith('../') ||
    normalized.includes('/../') ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:/.test(normalized)
  ) {
    return null;
  }

  return normalized;
}

export function shouldImportZipEntry(normalizedPath: string) {
  const extension = extname(normalizedPath).toLowerCase();
  if (!SUPPORTED_DOCUMENT_EXTENSIONS.includes(extension)) {
    return false;
  }

  const pathSegments = normalizedPath.split('/').filter(Boolean);
  return !pathSegments.some((segment) =>
    (KNOWLEDGE_BASE_IMPORT_IGNORED_DIRECTORIES as readonly string[]).includes(segment),
  );
}

export function resolveMimeTypeByPath(filePath: string) {
  const extension = extname(filePath).toLowerCase();
  return MIME_TYPE_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

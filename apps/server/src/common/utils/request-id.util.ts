import { randomUUID } from 'crypto';
import type { IncomingHttpHeaders } from 'http';

/**
 * 解析请求链路上的 requestId
 *
 * 优先复用前端透传的 X-Request-Id，
 * 这样浏览器请求、SSE meta 和后端日志就能对上同一个链路标识。
 */
export function resolveRequestId(headers: IncomingHttpHeaders) {
  const headerValue = headers['x-request-id'];
  if (Array.isArray(headerValue)) {
    return headerValue[0] || randomUUID();
  }

  if (typeof headerValue === 'string' && headerValue.trim()) {
    return headerValue.trim();
  }

  return randomUUID();
}

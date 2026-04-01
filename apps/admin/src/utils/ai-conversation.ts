import type { AiConversationKind, AiConversationMessage, AiConversationRole, AiConversationSession } from '@fullstack/shared';

const STORAGE_PREFIX = 'admin:ai:conversations';
const MAX_SESSION_COUNT = 12;

function storageKey(kind: AiConversationKind) {
  return `${STORAGE_PREFIX}:${kind}`;
}

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * 从第一轮问题派生会话标题，避免用户手动命名本地会话。
 */
export function deriveConversationTitle(question: string, maxLength = 18) {
  const normalized = question.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return '新会话';
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

export function createConversationSession(
  kind: AiConversationKind,
  overrides: Partial<AiConversationSession> = {},
): AiConversationSession {
  const now = new Date().toISOString();

  return {
    id: createId('session'),
    kind,
    title: '新会话',
    createdAt: now,
    updatedAt: now,
    messages: [],
    ...overrides,
  };
}

export function createConversationMessage(
  role: AiConversationRole,
  content = '',
  overrides: Partial<AiConversationMessage> = {},
): AiConversationMessage {
  return {
    id: createId('message'),
    role,
    content,
    createdAt: new Date().toISOString(),
    status: role === 'assistant' ? 'streaming' : 'done',
    thinkingExpanded: true,
    ...overrides,
  };
}

export function loadConversationSessions(kind: AiConversationKind) {
  if (typeof window === 'undefined') {
    return [] as AiConversationSession[];
  }

  try {
    const raw = window.localStorage.getItem(storageKey(kind));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as AiConversationSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveConversationSessions(kind: AiConversationKind, sessions: AiConversationSession[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(storageKey(kind), JSON.stringify(sessions.slice(0, MAX_SESSION_COUNT)));
}

/**
 * 当前会话一旦有新消息或被用户重新激活，就把它移动到列表顶部。
 *
 * 这样做的原因：
 * - 更符合聊天产品“最近活跃会话置顶”的心智
 * - 管理端和手机端复用同一套排序规则，避免两端行为不一致
 */
export function moveConversationSessionToTop(sessions: AiConversationSession[], sessionId: string) {
  const target = sessions.find((session) => session.id === sessionId);
  if (!target) {
    return sessions;
  }

  return [target, ...sessions.filter((session) => session.id !== sessionId)];
}

/**
 * 统一封装会话更新逻辑，并在默认情况下把更新过的会话置顶。
 */
export function updateConversationSessionInList(
  sessions: AiConversationSession[],
  sessionId: string,
  updater: (session: AiConversationSession) => AiConversationSession,
  options: { moveToTop?: boolean } = {},
) {
  const nextSessions = sessions.map((session) => (session.id === sessionId ? updater(session) : session));

  return options.moveToTop === false
    ? nextSessions
    : moveConversationSessionToTop(nextSessions, sessionId);
}

/**
 * 删除本地会话时只移除列表中的目标项，后续由页面层决定是否创建兜底新会话。
 */
export function removeConversationSession(sessions: AiConversationSession[], sessionId: string) {
  return sessions.filter((session) => session.id !== sessionId);
}

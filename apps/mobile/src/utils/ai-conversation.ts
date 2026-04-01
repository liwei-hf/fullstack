import type { AiConversationKind, AiConversationMessage, AiConversationRole, AiConversationSession } from '@fullstack/shared'

const STORAGE_PREFIX = 'mobile:ai:conversations'
const MAX_SESSION_COUNT = 12

function storageKey(kind: AiConversationKind) {
  return `${STORAGE_PREFIX}:${kind}`
}

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`
}

// 会话标题由首轮问题自动生成，移动端不额外引入复杂的重命名交互。
export function deriveConversationTitle(question: string, maxLength = 18) {
  const normalized = question.trim().replace(/\s+/g, ' ')
  if (!normalized) {
    return '新会话'
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized
}

export function createConversationSession(
  kind: AiConversationKind,
  overrides: Partial<AiConversationSession> = {},
): AiConversationSession {
  const now = new Date().toISOString()

  return {
    id: createId('session'),
    kind,
    title: '新会话',
    createdAt: now,
    updatedAt: now,
    messages: [],
    ...overrides,
  }
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
  }
}

export function loadConversationSessions(kind: AiConversationKind) {
  if (typeof window === 'undefined') {
    return [] as AiConversationSession[]
  }

  try {
    const raw = window.localStorage.getItem(storageKey(kind))
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as AiConversationSession[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveConversationSessions(kind: AiConversationKind, sessions: AiConversationSession[]) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(storageKey(kind), JSON.stringify(sessions.slice(0, MAX_SESSION_COUNT)))
}

// 当前会话只要有新消息或被重新选中，就把它移动到顶部，移动端和管理端保持同一套心智。
export function moveConversationSessionToTop(sessions: AiConversationSession[], sessionId: string) {
  const target = sessions.find((session) => session.id === sessionId)
  if (!target) {
    return sessions
  }

  return [target, ...sessions.filter((session) => session.id !== sessionId)]
}

// 页面层只关心“更新哪条会话”，排序规则统一收口在这里，避免四个页面各写一套置顶逻辑。
export function updateConversationSessionInList(
  sessions: AiConversationSession[],
  sessionId: string,
  updater: (session: AiConversationSession) => AiConversationSession,
  options: { moveToTop?: boolean } = {},
) {
  const nextSessions = sessions.map((session) => (session.id === sessionId ? updater(session) : session))

  return options.moveToTop === false
    ? nextSessions
    : moveConversationSessionToTop(nextSessions, sessionId)
}

// 删除后是否补一个新的空会话，由页面层结合当前选中态和业务场景决定。
export function removeConversationSession(sessions: AiConversationSession[], sessionId: string) {
  return sessions.filter((session) => session.id !== sessionId)
}

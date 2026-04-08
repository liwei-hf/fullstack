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
  try {
    const raw = uni.getStorageSync(storageKey(kind))
    if (!raw) {
      return [] as AiConversationSession[]
    }

    if (typeof raw === 'string') {
      const parsed = JSON.parse(raw) as AiConversationSession[]
      return Array.isArray(parsed) ? parsed : []
    }

    return Array.isArray(raw) ? (raw as AiConversationSession[]) : []
  } catch {
    return []
  }
}

export function saveConversationSessions(kind: AiConversationKind, sessions: AiConversationSession[]) {
  uni.setStorageSync(storageKey(kind), sessions.slice(0, MAX_SESSION_COUNT))
}

export function moveConversationSessionToTop(sessions: AiConversationSession[], sessionId: string) {
  const target = sessions.find((session) => session.id === sessionId)
  if (!target) {
    return sessions
  }

  return [target, ...sessions.filter((session) => session.id !== sessionId)]
}

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

export function removeConversationSession(sessions: AiConversationSession[], sessionId: string) {
  return sessions.filter((session) => session.id !== sessionId)
}

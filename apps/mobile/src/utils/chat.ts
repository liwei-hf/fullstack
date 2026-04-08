import type { AiConversationSession } from '@fullstack/shared'

export interface SessionGroup<T> {
  label: string
  items: T[]
}

function matchesKeyword(texts: Array<string | null | undefined>, keyword: string) {
  if (!keyword) {
    return true
  }

  return texts
    .filter(Boolean)
    .some((value) => value!.toLowerCase().includes(keyword))
}

export function resolveSessionGroupLabel(isoTime: string) {
  const target = new Date(isoTime)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate())

  if (targetDay.getTime() === today.getTime()) {
    return '今日'
  }

  if (targetDay.getTime() === yesterday.getTime()) {
    return '昨天'
  }

  return '更早'
}

export function groupConversationSessions(
  sessions: AiConversationSession[],
  keyword: string,
  getSearchTexts: (session: AiConversationSession) => Array<string | null | undefined>,
): SessionGroup<AiConversationSession>[] {
  const normalizedKeyword = keyword.trim().toLowerCase()
  const groups = new Map<string, AiConversationSession[]>()

  sessions.forEach((session) => {
    if (!matchesKeyword(getSearchTexts(session), normalizedKeyword)) {
      return
    }

    const label = resolveSessionGroupLabel(session.updatedAt || session.createdAt)
    const currentGroup = groups.get(label) || []
    currentGroup.push(session)
    groups.set(label, currentGroup)
  })

  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }))
}

export function isAbortError(error: unknown) {
  return error instanceof Error && (error.name === 'AbortError' || /abort/i.test(error.message))
}

export function shouldShowScrollToBottom(
  detail: {
    scrollHeight: number
    scrollTop: number
    deltaY?: number
  },
  viewportHeight = 520,
  threshold = 180,
) {
  const distanceToBottom = detail.scrollHeight - (detail.scrollTop + viewportHeight)
  if ((detail.deltaY || 0) > 0) {
    return true
  }

  return distanceToBottom > threshold
}

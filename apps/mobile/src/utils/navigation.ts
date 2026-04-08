export const MOBILE_PAGES = {
  login: '/pages/login/index',
  home: '/pages/index/index',
  sql: '/pages/sql/index',
  knowledgeBase: '/pages/knowledge-base/index',
} as const

type QueryValue = string | number | boolean | undefined | null

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  if (!query) {
    return path
  }

  const search = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')

  return search ? `${path}?${search}` : path
}

export function navigateTo(path: string, query?: Record<string, QueryValue>) {
  uni.navigateTo({
    url: buildUrl(path, query),
  })
}

export function redirectTo(path: string, query?: Record<string, QueryValue>) {
  uni.redirectTo({
    url: buildUrl(path, query),
  })
}

export function reLaunchTo(path: string, query?: Record<string, QueryValue>) {
  uni.reLaunch({
    url: buildUrl(path, query),
  })
}

/**
 * 请求封装
 */
import type { AuthResponse } from '@fullstack/shared'
import { AUTH_STORAGE_KEY } from '@/store/auth-store'
import { pinia } from '@/store'
import type { UserInfo } from '@/store/auth-store'
import { useAuthStore } from '@/store/auth-store'

const BASE_URL = '/api'
let refreshPromise: Promise<string> | null = null

/**
 * 生成链路 requestId
 *
 * 前端把 requestId 透传给后端后，日志和 SSE meta 可以共享同一个标识。
 */
function createRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `req_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`
}

function getAccessToken() {
  const authStore = useAuthStore(pinia)
  if (authStore.token) {
    return authStore.token
  }

  const authStorage = localStorage.getItem(AUTH_STORAGE_KEY)
  if (!authStorage) {
    return ''
  }

  try {
    const parsed = JSON.parse(authStorage)
    return parsed.token || parsed.state?.token || ''
  } catch {
    return ''
  }
}

function getRefreshToken() {
  const authStore = useAuthStore(pinia)
  if (authStore.refreshToken) {
    return authStore.refreshToken
  }

  const authStorage = localStorage.getItem(AUTH_STORAGE_KEY)
  if (!authStorage) {
    return ''
  }

  try {
    const parsed = JSON.parse(authStorage)
    return parsed.refreshToken || parsed.state?.refreshToken || ''
  } catch {
    return ''
  }
}

function handleUnauthorized() {
  const authStore = useAuthStore(pinia)
  authStore.logout()
  window.location.hash = '#/login'
}

async function refreshAccessToken() {
  if (refreshPromise) {
    return refreshPromise
  }

  refreshPromise = (async () => {
    const refreshToken = getRefreshToken()
    if (!refreshToken) {
      throw new Error('登录已过期，请重新登录')
    }

    const response = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: '登录已过期，请重新登录' }))
      throw new Error(error.message || '登录已过期，请重新登录')
    }

    const result = await response.json()
    const data = result.data as {
      user: UserInfo
      tokens: {
        accessToken: string
        refreshToken: string
      }
    }

    useAuthStore(pinia).setAuth(data.user, data.tokens.accessToken, data.tokens.refreshToken)
    return data.tokens.accessToken
  })()

  try {
    return await refreshPromise
  } finally {
    refreshPromise = null
  }
}

async function authorizedFetch(
  url: string,
  options: RequestInit,
  allowRetry = true,
) {
  const accessToken = getAccessToken()
  const requestId =
    ((options.headers as Record<string, string> | undefined)?.['X-Request-Id']) || createRequestId()
  const response = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'X-Request-Id': requestId,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  })

  if (response.status !== 401 || !allowRetry || url === '/auth/refresh') {
    return response
  }

  try {
    const refreshedAccessToken = await refreshAccessToken()
    return fetch(`${BASE_URL}${url}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        'X-Request-Id': requestId,
        Authorization: `Bearer ${refreshedAccessToken}`,
      },
    })
  } catch (error) {
    handleUnauthorized()
    throw error
  }
}

export const request = async <T>(options: {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  data?: unknown
  header?: Record<string, string>
}): Promise<T> => {
  const { url, method = 'GET', data, header = {} } = options

  const response = await authorizedFetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...header,
    },
    body: method !== 'GET' ? JSON.stringify(data) : undefined,
  })

  if (response.status === 401) {
    handleUnauthorized()
    throw new Error('登录已过期，请重新登录')
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: '请求失败' }))
    throw new Error(error.message || '网络请求失败')
  }

  const result = await response.json()
  return result.data as T
}

export const streamSse = async <T extends { type: string }>(
  url: string,
  data: unknown,
  onEvent: (event: T) => void,
  signal?: AbortSignal,
) => {
  const response = await authorizedFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
    signal,
  })

  if (response.status === 401) {
    handleUnauthorized()
    throw new Error('登录已过期，请重新登录')
  }

  if (!response.ok || !response.body) {
    const error = await response.json().catch(() => ({ message: '流式请求失败' }))
    throw new Error(error.message || '流式请求失败')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''

    for (const frame of frames) {
      const lines = frame.split('\n')
      const dataLine = lines.find((line) => line.startsWith('data:'))
      if (!dataLine) {
        continue
      }

      const payload = JSON.parse(dataLine.slice(5).trim()) as T
      onEvent(payload)
    }
  }
}

export const api = {
  post: <T>(url: string, data?: any) => request<T>({ url, method: 'POST', data }),
  get: <T>(url: string) => request<T>({ url, method: 'GET' }),
  put: <T>(url: string, data?: any) => request<T>({ url, method: 'PUT', data }),
  delete: <T>(url: string) => request<T>({ url, method: 'DELETE' }),
  patch: <T>(url: string, data?: any) => request<T>({ url, method: 'PATCH', data }),
  /**
   * 移动端登录
   *
   * H5/移动端统一由请求层补上 mobile 客户端类型，
   * 页面只负责提交账号密码，避免把端类型判断散落到业务组件里。
   */
  loginMobile: (account: string, password: string, deviceId?: string) =>
    request<AuthResponse>({
      url: '/auth/login',
      method: 'POST',
      data: {
        account,
        password,
        clientType: 'mobile',
        ...(deviceId ? { deviceId } : {}),
      },
    }),
}

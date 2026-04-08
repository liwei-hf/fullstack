import type { AuthResponse } from '@fullstack/shared'
import { pinia } from '@/store'
import { AUTH_STORAGE_KEY, type UserInfo, useAuthStore } from '@/store/auth-store'
import { MOBILE_PAGES, reLaunchTo } from '@/utils/navigation'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'
let refreshPromise: Promise<string> | null = null

function createRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `req_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`
}

function getPersistedAuth() {
  const raw = uni.getStorageSync(AUTH_STORAGE_KEY) as string | {
    token?: string
    refreshToken?: string
    state?: {
      token?: string
      refreshToken?: string
    }
  }

  if (!raw) {
    return { token: '', refreshToken: '' }
  }

  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return {
      token: parsed.token || parsed.state?.token || '',
      refreshToken: parsed.refreshToken || parsed.state?.refreshToken || '',
    }
  } catch {
    return { token: '', refreshToken: '' }
  }
}

function getAccessToken() {
  const authStore = useAuthStore(pinia)
  if (authStore.token) {
    return authStore.token
  }

  return getPersistedAuth().token
}

function getRefreshToken() {
  const authStore = useAuthStore(pinia)
  if (authStore.refreshToken) {
    return authStore.refreshToken
  }

  return getPersistedAuth().refreshToken
}

function resolveUrl(url: string) {
  if (/^https?:\/\//.test(url)) {
    return url
  }

  return `${BASE_URL}${url}`
}

function handleUnauthorized() {
  const authStore = useAuthStore(pinia)
  authStore.logout()
  reLaunchTo(MOBILE_PAGES.login)
}

async function uniRequest(options: {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  data?: unknown
  header?: Record<string, string>
}) {
  return new Promise<UniApp.RequestSuccessCallbackResult>((resolve, reject) => {
    uni.request({
      url: resolveUrl(options.url),
      method: (options.method || 'GET') as unknown as UniApp.RequestOptions['method'],
      data: options.data as any,
      header: options.header,
      success: resolve,
      fail: reject,
    })
  })
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

    const response = await uniRequest({
      url: '/auth/refresh',
      method: 'POST',
      data: { refreshToken },
      header: {
        'Content-Type': 'application/json',
      },
    })

    if (response.statusCode !== 201 && response.statusCode !== 200) {
      const error = response.data as { message?: string }
      throw new Error(error.message || '登录已过期，请重新登录')
    }

    const result = response.data as {
      data: {
        user: UserInfo
        tokens: {
          accessToken: string
          refreshToken: string
        }
      }
    }

    useAuthStore(pinia).setAuth(
      result.data.user,
      result.data.tokens.accessToken,
      result.data.tokens.refreshToken,
    )

    return result.data.tokens.accessToken
  })()

  try {
    return await refreshPromise
  } finally {
    refreshPromise = null
  }
}

async function authorizedRequest<T>(options: {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  data?: unknown
  header?: Record<string, string>
}, allowRetry = true): Promise<T> {
  const requestId = options.header?.['X-Request-Id'] || createRequestId()
  const accessToken = getAccessToken()
  const response = await uniRequest({
    ...options,
    header: {
      'Content-Type': 'application/json',
      ...options.header,
      'X-Request-Id': requestId,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  })

  if (response.statusCode === 401 && allowRetry && options.url !== '/auth/refresh') {
    try {
      const refreshedAccessToken = await refreshAccessToken()
      return authorizedRequest<T>({
        ...options,
        header: {
          ...options.header,
          'X-Request-Id': requestId,
          Authorization: `Bearer ${refreshedAccessToken}`,
        },
      }, false)
    } catch (error) {
      handleUnauthorized()
      throw error
    }
  }

  if (response.statusCode === 401) {
    handleUnauthorized()
    throw new Error('登录已过期，请重新登录')
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    const error = response.data as { message?: string }
    throw new Error(error.message || '网络请求失败')
  }

  const payload = response.data as { data: T }
  return payload.data
}

export const request = <T>(options: {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  data?: unknown
  header?: Record<string, string>
}) => authorizedRequest<T>(options)

export const streamSse = async <T extends { type: string }>(
  url: string,
  data: unknown,
  onEvent: (event: T) => void,
  signal?: AbortSignal,
) => {
  if (typeof fetch !== 'function') {
    throw new Error('当前平台暂不支持流式会话')
  }

  const requestId = createRequestId()
  const accessToken = getAccessToken()
  const response = await fetch(resolveUrl(url), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Id': requestId,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
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
  post: <T>(url: string, data?: unknown) => request<T>({ url, method: 'POST', data }),
  get: <T>(url: string) => request<T>({ url, method: 'GET' }),
  put: <T>(url: string, data?: unknown) => request<T>({ url, method: 'PUT', data }),
  delete: <T>(url: string) => request<T>({ url, method: 'DELETE' }),
  patch: <T>(url: string, data?: unknown) => request<T>({ url, method: 'PATCH', data }),
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

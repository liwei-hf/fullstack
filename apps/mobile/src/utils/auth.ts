import { pinia } from '@/store'
import { AUTH_STORAGE_KEY, useAuthStore } from '@/store/auth-store'
import { MOBILE_PAGES, reLaunchTo } from '@/utils/navigation'

interface PersistedAuthSnapshot {
  token?: string
  refreshToken?: string
  state?: {
    token?: string
    refreshToken?: string
  }
}

export function readPersistedAuth() {
  const raw = uni.getStorageSync(AUTH_STORAGE_KEY) as PersistedAuthSnapshot | string | undefined
  if (!raw) {
    return null
  }

  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) as PersistedAuthSnapshot : raw
    return {
      token: parsed.token || parsed.state?.token || '',
      refreshToken: parsed.refreshToken || parsed.state?.refreshToken || '',
    }
  } catch {
    return null
  }
}

export function ensureAuthenticated() {
  const authStore = useAuthStore(pinia)
  if (authStore.token) {
    return true
  }

  const snapshot = readPersistedAuth()
  if (snapshot?.token) {
    return true
  }

  reLaunchTo(MOBILE_PAGES.login)
  return false
}

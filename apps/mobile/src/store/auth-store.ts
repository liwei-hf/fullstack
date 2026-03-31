/**
 * 认证 Store
 *
 * 管理用户认证状态：
 * - user: 用户信息
 * - token: Access Token
 * - refreshToken: Refresh Token
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const AUTH_STORAGE_KEY = 'auth'

export interface UserInfo {
  id: string
  username: string
  phone: string
  role: 'admin' | 'user'
  status: 'active' | 'disabled'
  clientType: 'admin' | 'mobile'
  sessionId: string
}

const persistAuthSnapshot = (payload: {
  user: UserInfo | null
  token: string
  refreshToken: string
}) => {
  if (typeof localStorage === 'undefined') {
    return
  }

  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload))
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserInfo | null>(null)
  const token = ref<string>('')
  const refreshToken = ref<string>('')

  /**
   * 设置认证信息
   */
  const setAuth = (userInfo: UserInfo, accessToken: string, refreshTokenVal: string) => {
    user.value = userInfo
    token.value = accessToken
    refreshToken.value = refreshTokenVal

    persistAuthSnapshot({
      user: userInfo,
      token: accessToken,
      refreshToken: refreshTokenVal,
    })
  }

  /**
   * 登出（清除认证信息）
   */
  const logout = () => {
    user.value = null
    token.value = ''
    refreshToken.value = ''

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(AUTH_STORAGE_KEY)
    }
  }

  /**
   * 判断是否已登录
   */
  const isAuthenticated = () => !!token.value

  return {
    user,
    token,
    refreshToken,
    setAuth,
    logout,
    isAuthenticated
  }
}, {
  persist: {
    key: AUTH_STORAGE_KEY,
  }
})

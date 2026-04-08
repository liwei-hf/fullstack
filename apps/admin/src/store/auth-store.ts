/**
 * 认证状态管理（Zustand Store）
 *
 * 用于管理全局认证状态：
 * - 用户信息（user）
 * - Access Token（token）
 * - Refresh Token（refreshToken）
 *
 * 持久化：
 * - 使用 zustand/middleware 的 persist 中间件
 * - 数据自动存储到 localStorage
 * - 页面刷新后状态不丢失
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CurrentUser } from '@fullstack/shared';

export const AUTH_STORAGE_KEY = 'auth-storage';

/**
 * 认证状态接口
 */
interface AuthState {
  user: CurrentUser | null;           // 当前登录用户信息
  token: string | null;               // Access Token（JWT）
  refreshToken: string | null;        // Refresh Token
  setAuth: (user: CurrentUser, token: string, refreshToken: string) => void;  // 设置认证信息
  logout: () => void;                 // 登出（清除认证信息）
}

/**
 * 认证 Store
 *
 * 使用方法：
 * - 获取状态：useAuthStore((state) => state.user)
 * - 设置认证：useAuthStore.getState().setAuth(user, token, refreshToken)
 * - 登出：useAuthStore.getState().logout()
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      refreshToken: null,
      // 设置认证信息（登录后调用）
      setAuth: (user, token, refreshToken) => set({ user, token, refreshToken }),
      // 登出（清除所有认证信息）
      logout: () => {
        set({ user: null, token: null, refreshToken: null });

        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(AUTH_STORAGE_KEY);
        }
      },
    }),
    {
      name: AUTH_STORAGE_KEY,  // localStorage 中的 key 名
    },
  ),
);

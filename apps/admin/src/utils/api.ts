/**
 * API 客户端封装
 *
 * 核心功能：
 * - 统一请求头处理（Content-Type、Authorization）
 * - Token 自动携带（从 localStorage 读取）
 * - 401 时自动刷新 Token 并重试一次
 * - 统一响应数据解包（返回 data 字段）
 *
 * 使用示例：
 * ```ts
 * const users = await api.get('/admin/users');
 * await api.post('/admin/users', { username, phone });
 * await api.patch(`/admin/users/${id}`, { status: 'active' });
 * ```
 */
import type { CurrentUser, AuthResponse } from '@fullstack/shared';
import { AUTH_STORAGE_KEY, useAuthStore } from '@/store/auth-store';

const API_BASE_URL = '/api';
let refreshPromise: Promise<string | null> | null = null;

/**
 * 生成链路 requestId
 *
 * 每次请求都带上 X-Request-Id，方便和后端日志、SSE meta 中的 requestId 对齐。
 */
function createRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `req_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * API 客户端类
 *
 * 封装 fetch 请求，提供统一的认证和错误处理
 */
export class ApiClient {
  private baseUrl: string;
  private getToken: () => string | null;
  private getRefreshToken: () => string | null;
  private onAuthRefreshed: (payload: RefreshResponse) => void;
  private onUnauthorized: () => void;

  constructor(
    baseUrl: string,
    getToken: () => string | null,
    getRefreshToken: () => string | null,
    onAuthRefreshed: (payload: RefreshResponse) => void,
    onUnauthorized: () => void,
  ) {
    this.baseUrl = baseUrl;
    this.getToken = getToken;
    this.getRefreshToken = getRefreshToken;
    this.onAuthRefreshed = onAuthRefreshed;
    this.onUnauthorized = onUnauthorized;
  }

  /**
   * 通用请求方法
   *
   * 处理逻辑：
   * 1. 从回调获取 Token
   * 2. 添加请求头（Content-Type + Authorization）
   * 3. 发起 fetch 请求
   * 4. 401 时调用未授权回调（清除状态 + 跳转登录）
   * 5. 解析响应数据，返回 data 字段
   *
   * @param endpoint - 请求路径（如 /admin/users）
   * @param options - fetch 选项（method、body 等）
   * @returns 响应数据（已解包）
   */
  private async request<T>(endpoint: string, options?: RequestInit, allowRetry = true): Promise<T> {
    const response = await this.authorizedFetch(endpoint, options, allowRetry);

    if (response.status === 401) {
      this.onUnauthorized();
      throw new Error('登录已过期，请重新登录');
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Request failed');
    }

    return data.data;
  }

  /**
   * POST 请求
   */
  async post<T>(endpoint: string, body: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * GET 请求
   */
  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint);
  }

  /**
   * PATCH 请求（部分更新）
   */
  async patch<T>(endpoint: string, body: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  /**
   * DELETE 请求
   */
  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  async upload<T>(endpoint: string, formData: FormData): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: formData,
      headers: {},
    });
  }

  /**
   * 管理端登录
   *
   * 管理后台始终走 admin 客户端类型，但这个约束应该收敛在请求层，
   * 不让页面组件自己到处传字面量，避免后续出现多处散落和改漏。
   */
  async loginAdmin(account: string, password: string): Promise<AuthResponse> {
    return this.post<AuthResponse>('/auth/login', {
      account,
      password,
      clientType: 'admin',
    });
  }

  async streamSse<T extends { type: string }>(
    endpoint: string,
    body: unknown,
    onEvent: (event: T) => void,
    signal?: AbortSignal,
  ) {
    const response = await this.authorizedFetch(
      endpoint,
      {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {
          'Content-Type': 'application/json',
        },
        signal,
      },
      true,
    );

    if (response.status === 401) {
      this.onUnauthorized();
      throw new Error('登录已过期，请重新登录');
    }

    if (!response.ok || !response.body) {
      const error = await response.json().catch(() => ({ message: '流式请求失败' }));
      throw new Error(error.message || '流式请求失败');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        const lines = frame.split('\n');
        const dataLine = lines.find((line) => line.startsWith('data:'));
        if (!dataLine) {
          continue;
        }

        const payload = JSON.parse(dataLine.slice(5).trim()) as T;
        onEvent(payload);
      }
    }
  }

  private async authorizedFetch(endpoint: string, options?: RequestInit, allowRetry = true) {
    const token = this.getToken();
    const requestId =
      (options?.headers as Record<string, string> | undefined)?.['X-Request-Id'] || createRequestId();
    const headers: HeadersInit = {
      ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options?.headers || {}),
      'X-Request-Id': requestId,
      ...(token && { Authorization: `Bearer ${token}` }),
    };

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status !== 401 || !allowRetry || endpoint === '/auth/refresh') {
      return response;
    }

    const refreshedToken = await this.refreshAccessToken();
    if (!refreshedToken) {
      return response;
    }

    const retryHeaders: HeadersInit = {
      ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options?.headers || {}),
      'X-Request-Id': requestId,
      Authorization: `Bearer ${refreshedToken}`,
    };

    return fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: retryHeaders,
    });
  }

  private async refreshAccessToken() {
    if (refreshPromise) {
      return refreshPromise;
    }

    refreshPromise = (async () => {
      const refreshToken = this.getRefreshToken();
      if (!refreshToken) {
        return null;
      }

      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        return null;
      }

      const result = await response.json();
      const data = result.data as RefreshResponse;
      this.onAuthRefreshed(data);
      return data.tokens.accessToken;
    })();

    try {
      return await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  }
}

interface RefreshResponse {
  user: CurrentUser;
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
}

/**
 * 获取 Token
 *
 * 从 localStorage 中的 auth-storage 读取 Token
 * Zustand persist 中间件将状态存储为 JSON 字符串
 */
function getToken(): string | null {
  const token = useAuthStore.getState().token;
  if (token) {
    return token;
  }

  const auth = localStorage.getItem(AUTH_STORAGE_KEY);
  if (auth) {
    try {
      const parsed = JSON.parse(auth);
      return parsed.state?.token || null;
    } catch {
      return null;
    }
  }
  return null;
}

function getRefreshToken(): string | null {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (refreshToken) {
    return refreshToken;
  }

  const auth = localStorage.getItem(AUTH_STORAGE_KEY);
  if (auth) {
    try {
      const parsed = JSON.parse(auth);
      return parsed.state?.refreshToken || null;
    } catch {
      return null;
    }
  }
  return null;
}

function onAuthRefreshed(payload: RefreshResponse) {
  useAuthStore.getState().setAuth(
    payload.user,
    payload.tokens.accessToken,
    payload.tokens.refreshToken,
  );
}

/**
 * 未授权处理
 *
 * 清除本地认证状态并重定向到登录页
 */
function onUnauthorized() {
  useAuthStore.getState().logout();
  window.location.href = '/login';
}

// 导出 API 客户端单例
export const api = new ApiClient(
  API_BASE_URL,
  getToken,
  getRefreshToken,
  onAuthRefreshed,
  onUnauthorized,
);

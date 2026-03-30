/**
 * API 客户端封装
 *
 * 核心功能：
 * - 统一请求头处理（Content-Type、Authorization）
 * - Token 自动携带（从 localStorage 读取）
 * - 401 未授权自动跳转登录
 * - 统一响应数据解包（返回 data 字段）
 *
 * 使用示例：
 * ```ts
 * const users = await api.get('/admin/users');
 * await api.post('/admin/users', { username, phone, nickname });
 * await api.patch(`/admin/users/${id}`, { status: 'active' });
 * ```
 */
const API_BASE_URL = '/api';

/**
 * API 客户端类
 *
 * 封装 fetch 请求，提供统一的认证和错误处理
 */
export class ApiClient {
  private baseUrl: string;
  private getToken: () => string | null;
  private onUnauthorized: () => void;

  constructor(
    baseUrl: string,
    getToken: () => string | null,
    onUnauthorized: () => void,
  ) {
    this.baseUrl = baseUrl;
    this.getToken = getToken;
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
  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const token = this.getToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    };

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    // 401 未授权：清除本地状态并跳转登录
    if (response.status === 401) {
      this.onUnauthorized();
      throw new Error('Unauthorized');
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
}

/**
 * 获取 Token
 *
 * 从 localStorage 中的 auth-storage 读取 Token
 * Zustand persist 中间件将状态存储为 JSON 字符串
 */
function getToken(): string | null {
  const auth = localStorage.getItem('auth-storage');
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

/**
 * 未授权处理
 *
 * 清除本地认证状态并重定向到登录页
 */
function onUnauthorized() {
  localStorage.removeItem('auth-storage');
  window.location.href = '/login';
}

// 导出 API 客户端单例
export const api = new ApiClient(API_BASE_URL, getToken, onUnauthorized);

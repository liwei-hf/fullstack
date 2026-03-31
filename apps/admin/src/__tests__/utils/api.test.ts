/**
 * API 客户端测试
 *
 * 测试范围：
 * - API 客户端基础功能
 * - Token 自动携带
 * - 401 未授权处理
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 模拟 fetch API
global.fetch = vi.fn();

describe('ApiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    localStorage.clear();
  });

  it('应该正确设置请求头', async () => {
    // 模拟 fetch 响应
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { test: 'value' } }),
    });

    // 动态导入避免循环依赖
    const { api } = await import('../../utils/api');

    // 存储 Token
    localStorage.setItem('auth-storage', JSON.stringify({
      state: { token: 'test-token' }
    }));

    await api.get('/test');

    expect(fetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token',
      }),
    }));
  });

  it('应该在无 Token 时不添加 Authorization 头', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { test: 'value' } }),
    });

    const { api } = await import('../../utils/api');

    await api.get('/test');

    expect(fetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
      }),
    }));
  });

  it('应该在 401 后自动刷新 token 并重试原请求', async () => {
    localStorage.setItem('auth-storage', JSON.stringify({
      state: {
        user: {
          id: 'user-1',
          username: 'admin',
          phone: '13800000000',
          role: 'admin',
          status: 'active',
          clientType: 'admin',
          sessionId: 'session-1',
        },
        token: 'expired-token',
        refreshToken: 'valid-refresh-token',
      }
    }));

    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Unauthorized' }),
    }).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          user: {
            id: 'user-1',
            username: 'admin',
            phone: '13800000000',
            role: 'admin',
            status: 'active',
            clientType: 'admin',
            sessionId: 'session-1',
          },
          tokens: {
            accessToken: 'new-access-token',
            refreshToken: 'new-refresh-token',
            expiresIn: 900,
          },
        },
      }),
    }).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { success: true } }),
    });

    const { api } = await import('../../utils/api');
    const result = await api.get('/test');

    expect(result).toEqual({ success: true });
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/auth/refresh', expect.objectContaining({
      method: 'POST',
    }));
    expect(fetch).toHaveBeenNthCalledWith(3, '/api/test', expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer new-access-token',
      }),
    }));
  });

  it('应该在刷新 token 失败后清除本地状态', async () => {
    localStorage.setItem('auth-storage', JSON.stringify({
      state: {
        user: {
          id: 'user-1',
          username: 'admin',
          phone: '13800000000',
          role: 'admin',
          status: 'active',
          clientType: 'admin',
          sessionId: 'session-1',
        },
        token: 'expired-token',
        refreshToken: 'expired-refresh-token',
      },
    }));

    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Unauthorized' }),
    }).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Refresh token expired' }),
    });

    const { api } = await import('../../utils/api');

    await expect(api.get('/test')).rejects.toThrow('登录已过期，请重新登录');
    expect(localStorage.getItem('auth-storage')).toBeNull();
  });

  it('应该解包响应数据', async () => {
    const mockData = { id: 1, title: 'Test' };
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockData }),
    });

    const { api } = await import('../../utils/api');
    const result = await api.get('/test');

    expect(result).toEqual(mockData);
  });
});

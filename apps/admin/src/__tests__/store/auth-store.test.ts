/**
 * 认证 Store 测试
 *
 * 测试范围：
 * - 设置认证信息
 * - 登出功能
 * - 状态持久化
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('useAuthStore', () => {
  beforeEach(() => {
    localStorage.clear();
    // 重置 store 到初始状态
    if (typeof globalThis !== 'undefined') {
      // 重新创建 store 实例
      vi.resetModules();
    }
  });

  it('应该正确设置认证信息', async () => {
    const { useAuthStore } = await import('../../store/auth-store');

    const mockUser = {
      id: 'user-1',
      username: 'admin',
      phone: '13800000000',
      role: 'admin' as const,
      status: 'active' as const,
      clientType: 'admin' as const,
      sessionId: 'session-1',
    };

    const mockToken = 'test-access-token';
    const mockRefreshToken = 'test-refresh-token';

    // 设置认证信息
    useAuthStore.getState().setAuth(mockUser, mockToken, mockRefreshToken);

    const state = useAuthStore.getState();

    expect(state.user).toEqual(mockUser);
    expect(state.token).toBe(mockToken);
    expect(state.refreshToken).toBe(mockRefreshToken);
  });

  it('应该正确登出（清除认证信息）', async () => {
    const { useAuthStore } = await import('../../store/auth-store');

    // 先设置认证信息
    useAuthStore.getState().setAuth(
      { id: 'user-1', username: 'admin', phone: '13800000000', role: 'admin', status: 'active', clientType: 'admin', sessionId: 'session-1' },
      'test-token',
      'test-refresh-token',
    );

    // 登出
    useAuthStore.getState().logout();

    const state = useAuthStore.getState();

    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
    expect(state.refreshToken).toBeNull();
  });

  it('应该持久化到 localStorage', async () => {
    const { useAuthStore } = await import('../../store/auth-store');

    const mockUser = {
      id: 'user-1',
      username: 'admin',
      phone: '13800000000',
      role: 'admin' as const,
      status: 'active' as const,
      clientType: 'admin' as const,
      sessionId: 'session-1',
    };

    useAuthStore.getState().setAuth(mockUser, 'test-token', 'test-refresh-token');

    // 验证 localStorage 中有数据
    const stored = localStorage.getItem('auth-storage');
    expect(stored).toBeDefined();

    const parsed = JSON.parse(stored!);
    expect(parsed.state.token).toBe('test-token');
    expect(parsed.state.user.username).toBe('admin');
  });

  it('应该从 localStorage 恢复状态', async () => {
    // 先模拟 localStorage 中有数据
    const storedData = {
      state: {
        user: {
          id: 'user-1',
          username: 'admin',
          phone: '13800000000',
          role: 'admin' as const,
          status: 'active' as const,
          clientType: 'admin' as const,
          sessionId: 'session-1',
        },
        token: 'stored-token',
        refreshToken: 'stored-refresh-token',
      },
    };

    localStorage.setItem('auth-storage', JSON.stringify(storedData));

    // 重新导入 store（模拟页面刷新）
    const { useAuthStore } = await import('../../store/auth-store');

    const state = useAuthStore.getState();

    expect(state.token).toBe('stored-token');
    expect(state.user?.username).toBe('admin');
  });
});

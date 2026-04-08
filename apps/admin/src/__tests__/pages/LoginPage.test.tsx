/**
 * 登录页面测试
 *
 * 测试范围：
 * - 页面渲染
 * - 表单输入
 * - 登录成功流程
 * - 登录失败处理
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';

// 模拟 fetch
global.fetch = vi.fn();
const mockToast = vi.fn();

// 模拟 useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../hooks/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

vi.mock('../../components/ui/toaster', () => ({
  Toaster: () => null,
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  const renderLoginPage = async () => {
    const { default: LoginPage } = await import('../../pages/LoginPage');
    return render(
      <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <LoginPage />
      </BrowserRouter>
    );
  };

  const getPasswordInput = () => screen.getByLabelText('密码', { selector: 'input' });

  it('应该渲染登录表单', async () => {
    await renderLoginPage();

    expect(screen.getByLabelText(/账号/i)).toBeInTheDocument();
    expect(getPasswordInput()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /登录/i })).toBeInTheDocument();
  });

  it('不应该展示默认账号密码提示，且密码默认留空', async () => {
    await renderLoginPage();

    expect(screen.queryByText('Admin123456!')).not.toBeInTheDocument();
    expect(getPasswordInput()).toHaveValue('');
  });

  it('应该允许输入账号和密码', async () => {
    await renderLoginPage();

    const accountInput = screen.getByLabelText(/账号/i);
    const passwordInput = getPasswordInput();

    // 清空默认值后再输入
    await userEvent.clear(accountInput);
    await userEvent.clear(passwordInput);
    await userEvent.type(accountInput, 'testuser');
    await userEvent.type(passwordInput, 'testpass');

    expect(accountInput).toHaveValue('testuser');
    expect(passwordInput).toHaveValue('testpass');
  });

  it('应该在登录成功后跳转首页', async () => {
    // 模拟登录成功响应
    (fetch as any).mockResolvedValueOnce({
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
            accessToken: 'test-token',
            refreshToken: 'test-refresh-token',
            expiresIn: 900,
          },
        },
      }),
    });

    await renderLoginPage();

    await userEvent.type(getPasswordInput(), 'testpass');

    // 点击登录按钮
    const loginButton = screen.getByRole('button', { name: /登录/i });
    await userEvent.click(loginButton);

    // 验证跳转
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('应该在登录失败时显示错误提示', async () => {
    // 模拟登录失败响应
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Invalid credentials' }),
    });

    await renderLoginPage();

    await userEvent.type(getPasswordInput(), 'wrong-password');

    const loginButton = screen.getByRole('button', { name: /登录/i });
    await userEvent.click(loginButton);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '登录失败',
        })
      );
    });
  });

  it('应该在登录时显示加载状态', async () => {
    // 模拟延迟响应
    (fetch as any).mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve({
        ok: true,
        json: async () => ({ data: { user: {}, tokens: {} } }),
      }), 100))
    );

    await renderLoginPage();

    await userEvent.type(getPasswordInput(), 'testpass');

    const loginButton = screen.getByRole('button', { name: /登录/i });
    await userEvent.click(loginButton);

    // 验证按钮被禁用
    expect(loginButton).toBeDisabled();
    // 验证显示加载文本
    expect(screen.getByText(/登录中\.\.\./i)).toBeInTheDocument();
  });
});

/**
 * 登录页组件
 *
 * 功能说明：
 * - 用户登录表单（账号 + 密码）
 * - 支持用户名或手机号登录
 * - 登录成功后存储 Token 和用户信息到 Zustand store
 * - 登录失败显示错误提示
 *
 * UI 设计：
 * - 左侧品牌区：渐变背景 + 装饰圆形 + 产品特性列表
 * - 右侧登录表单：卡片式布局，包含默认账号提示
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { api } from '@/utils/api';
import { useAuthStore } from '@/store/auth-store';
import { Loader2 } from 'lucide-react';

/**
 * 登录响应类型
 *
 * 后端返回格式：
 * - user: 用户信息（脱敏）
 * - tokens: Token 信息（accessToken, refreshToken, expiresIn）
 */
interface LoginResponse {
  user: {
    id: string;
    username: string;
    phone: string;
    nickname: string;
    avatar: string | null;
    role: 'admin' | 'user';
    status: 'active' | 'disabled';
    clientType: 'admin' | 'mobile';
    sessionId: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
}

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [loading, setLoading] = useState(false);
  const [account, setAccount] = useState('admin');
  const [password, setPassword] = useState('Admin123456!');

  /**
   * 登录表单提交处理
   *
   * 流程：
   * 1. 阻止表单默认提交
   * 2. 调用登录 API（/api/auth/login）
   * 3. 成功：存储 Token 和用户信息，跳转到首页
   * 4. 失败：显示错误提示
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await api.post<LoginResponse>('/auth/login', {
        account,
        password,
        clientType: 'admin',  // 管理端登录
      });

      // 保存认证信息到 store（自动持久化到 localStorage）
      setAuth(response.user, response.tokens.accessToken, response.tokens.refreshToken);
      navigate('/');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '登录失败，请检查账号密码';
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* 左侧品牌区 */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 relative overflow-hidden">
        {/* 装饰圆形 - 增加视觉层次 */}
        <div className="absolute top-20 left-20 w-72 h-72 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-blue-400/20 rounded-full blur-3xl" />

        <div className="relative z-10 flex flex-col justify-center px-16 text-white">
          <div className="mb-8">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center mb-6">
              <span className="text-3xl font-bold">M</span>
            </div>
            <h1 className="text-5xl font-bold mb-4">管理后台</h1>
            <p className="text-xl text-blue-100">
              现代化的企业级管理系统
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3 text-blue-100">
              <div className="w-2 h-2 bg-blue-400 rounded-full" />
              <span>用户管理</span>
            </div>
            <div className="flex items-center gap-3 text-blue-100">
              <div className="w-2 h-2 bg-blue-400 rounded-full" />
              <span>权限控制</span>
            </div>
            <div className="flex items-center gap-3 text-blue-100">
              <div className="w-2 h-2 bg-blue-400 rounded-full" />
              <span>数据统计</span>
            </div>
          </div>
        </div>
      </div>

      {/* 右侧登录区 */}
      <div className="flex-1 flex items-center justify-center p-8 bg-gray-50">
        <Card className="w-full max-w-md shadow-2xl border-0">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                <span className="text-white font-bold text-sm">M</span>
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">欢迎回来</CardTitle>
            <CardDescription>
              请输入您的账号信息以继续
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* 默认账号提示 - 方便测试 */}
            <Alert className="mb-6 bg-blue-50 border-blue-200">
              <AlertDescription>
                <div className="text-sm space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-blue-700 font-medium">账号：</span>
                    <code className="bg-white px-2 py-0.5 rounded border border-blue-200 text-blue-600">admin</code>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-blue-700 font-medium">密码：</span>
                    <code className="bg-white px-2 py-0.5 rounded border border-blue-200 text-blue-600">Admin123456!</code>
                  </div>
                </div>
              </AlertDescription>
            </Alert>

            {/* 登录表单 */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="account">账号</Label>
                <Input
                  id="account"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  placeholder="用户名或手机号"
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">密码</Label>
                  <a href="#" className="text-sm text-blue-600 hover:underline">
                    忘记密码？
                  </a>
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  className="h-11"
                />
              </div>

              <Button
                type="submit"
                className="w-full h-11 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    登录中...
                  </>
                ) : (
                  '登录'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

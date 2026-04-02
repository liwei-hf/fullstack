import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/utils/api';
import { useAuthStore } from '@/store/auth-store';
import { Bot, Database, Loader2, MessageSquareText, ShieldCheck } from 'lucide-react';

interface LoginResponse {
  user: {
    id: string;
    username: string;
    phone: string;
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

/**
 * 登录页
 *
 * 左侧承接品牌和能力说明，右侧负责稳定的登录表单，
 * 保持“有设计感，但仍然像真实系统入口”的风格。
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [loading, setLoading] = useState(false);
  const [account, setAccount] = useState('admin');
  const [password, setPassword] = useState('Admin123456!');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await api.post<LoginResponse>('/auth/login', {
        account,
        password,
        clientType: 'admin',
      });

      setAuth(response.user, response.tokens.accessToken, response.tokens.refreshToken);
      navigate('/');
    } catch (error: unknown) {
      toast({
        title: '登录失败',
        description: error instanceof Error ? error.message : '请检查账号密码后重试',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="min-h-screen bg-[#F4F7FC] px-6 py-8">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl overflow-hidden rounded-[32px] border border-white/70 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.08)]">
        <section className="relative hidden w-[48%] overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.32),_transparent_35%),linear-gradient(180deg,#EAF2FF_0%,#F7FAFF_100%)] p-10 lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-x-10 top-10 h-56 rounded-[32px] border border-white/70 bg-white/40 blur-3xl" />
          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-sky-400 text-white shadow-[0_12px_24px_rgba(59,130,246,0.35)]">
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">AI 助手后台</p>
              <p className="text-xs text-slate-500">知识库、智能问数与提示词工作台</p>
            </div>
          </div>

          <div className="relative z-10 space-y-8">
            <div className="space-y-4">
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-blue-500">Welcome Back</p>
              <h1 className="max-w-lg text-5xl font-semibold leading-[1.15] text-slate-900">
                让知识与数据更自然地服务你的业务系统
              </h1>
              <p className="max-w-xl text-base leading-8 text-slate-600">
                统一管理知识库、智能问数、提示词与问答日志，把 AI 能力收进一套清晰可控的后台工作流。
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FeatureCard
                icon={MessageSquareText}
                title="知识库问答"
                description="上传文档、维护提示词、围绕同一知识库连续追问。"
              />
              <FeatureCard
                icon={Database}
                title="智能问数"
                description="自然语言转 SQL，保留执行链路和日志明细。"
              />
              <FeatureCard
                icon={ShieldCheck}
                title="统一权限"
                description="管理端集中控制登录、角色与操作边界。"
              />
              <FeatureCard
                icon={Bot}
                title="Prompt 管理"
                description="模板化维护系统提示词，直接测试当前效果。"
              />
            </div>
          </div>

          <div className="relative z-10 flex flex-wrap items-center gap-6 text-xs text-slate-500">
            <span>安全可靠</span>
            <span>类型统一</span>
            <span>AI 工作流一体化</span>
          </div>
        </section>

        <section className="flex flex-1 items-center justify-center bg-[linear-gradient(180deg,#FAFBFF_0%,#F5F7FC_100%)] px-6 py-12 lg:px-12">
          <Card className="w-full max-w-[460px] rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
            <CardContent className="space-y-8 p-8">
              <div className="space-y-3 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <Bot className="h-7 w-7" />
                </div>
                <div>
                  <h2 className="text-3xl font-semibold tracking-tight text-slate-900">登录系统</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    欢迎回来，请输入账号与密码进入后台工作台
                  </p>
                </div>
              </div>

              <Alert className="rounded-2xl border-blue-100 bg-blue-50/80 text-blue-700">
                <AlertDescription className="space-y-1 text-sm">
                  <p>测试账号：admin</p>
                  <p>默认密码：Admin123456!</p>
                </AlertDescription>
              </Alert>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="account">账号</Label>
                  <Input
                    id="account"
                    value={account}
                    onChange={(event) => setAccount(event.target.value)}
                    placeholder="请输入用户名或手机号"
                    className="h-12 rounded-2xl border-slate-200 bg-slate-50/70 px-4"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">密码</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="请输入密码"
                    className="h-12 rounded-2xl border-slate-200 bg-slate-50/70 px-4"
                  />
                </div>

                <Button
                  type="submit"
                  className="h-12 w-full rounded-2xl bg-[#3B82F6] text-base font-medium shadow-[0_14px_24px_rgba(59,130,246,0.26)] hover:bg-blue-600"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      登录中...
                    </>
                  ) : (
                    '登录'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </section>
        </div>
      </div>
      <Toaster />
    </>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/70 bg-white/55 p-4 shadow-[0_14px_32px_rgba(148,163,184,0.12)] backdrop-blur">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

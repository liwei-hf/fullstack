import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BrainCircuit,
  ClipboardList,
  Database,
  History,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  Settings,
  Sparkles,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuthStore } from '@/store/auth-store';
import { cn } from '@/lib/utils';

type NavigationItem = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  matchMode?: 'exact' | 'prefix';
};

type NavigationGroup = {
  name: string;
  items: NavigationItem[];
};

const navigationGroups: NavigationGroup[] = [
  {
    name: '业务管理',
    items: [
      { name: '仪表盘', href: '/', icon: LayoutDashboard, matchMode: 'exact' },
      { name: '用户管理', href: '/users', icon: Users, matchMode: 'exact' },
      { name: '任务管理', href: '/todos', icon: ClipboardList, matchMode: 'exact' },
      { name: '设置', href: '/settings', icon: Settings, matchMode: 'exact' },
    ],
  },
  {
    name: 'AI 能力',
    items: [
      { name: '知识库管理', href: '/knowledge-base', icon: Database, matchMode: 'exact' },
      { name: '知识库问答', href: '/knowledge-base/chat', icon: MessageSquareText, matchMode: 'exact' },
      { name: '智能问数', href: '/ai/sql', icon: BrainCircuit, matchMode: 'exact' },
      { name: '问答日志', href: '/ai/logs', icon: History, matchMode: 'exact' },
      { name: '提示词管理', href: '/ai/prompts', icon: Sparkles, matchMode: 'prefix' },
    ],
  },
];

function isNavigationItemActive(item: NavigationItem, pathname: string) {
  if (item.matchMode === 'prefix') {
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  return pathname === item.href;
}

/**
 * 管理端固定侧栏布局
 *
 * 这里不再保留折叠态，统一采用 240px 固定导航，
 * 让后台整体更稳定，也更贴近 AI SaaS 的轻工作台风格。
 */
export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-[#F6F8FC] text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-slate-200/80 bg-white/90 px-4 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.05)] backdrop-blur">
        <div className="flex items-center gap-3 px-2 pb-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 via-blue-500 to-sky-400 text-white shadow-[0_10px_20px_rgba(59,130,246,0.28)]">
            <BrainCircuit className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">AI 助手后台</p>
            <p className="text-xs text-slate-500">现代 AI SaaS 工作台</p>
          </div>
        </div>

        <ScrollArea className="flex-1 pr-1">
          <nav className="space-y-6">
            {navigationGroups.map((group) => (
              <div key={group.name} className="space-y-2">
                <div className="px-2 text-[11px] font-medium tracking-[0.18em] text-slate-400">
                  {group.name}
                </div>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const active = isNavigationItemActive(item, location.pathname);
                    return (
                      <Link
                        key={item.name}
                        to={item.href}
                        className={cn(
                          'relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all',
                          active
                            ? 'bg-blue-50 text-blue-600 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.08)]'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                        )}
                      >
                        {active ? <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-blue-500" /> : null}
                        <item.icon className={cn('h-4.5 w-4.5 shrink-0', active ? 'text-blue-500' : 'text-slate-400')} />
                        <span>{item.name}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </ScrollArea>

        <div className="mt-5 rounded-3xl border border-slate-200/80 bg-slate-50/80 p-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border border-white shadow-sm">
              <AvatarFallback className="bg-blue-100 text-sm font-semibold text-blue-600">
                {user?.username?.[0]?.toUpperCase() || 'A'}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{user?.username}</p>
              <p className="text-xs text-slate-500">{user?.role === 'admin' ? '管理员' : '普通用户'}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="mt-3 w-full justify-start rounded-2xl px-3 text-slate-600 hover:bg-white hover:text-slate-900"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" />
            退出登录
          </Button>
        </div>
      </aside>

      <main className="ml-60 min-h-screen flex-1">
        <div className="mx-auto max-w-[1680px] px-6 py-6">{children}</div>
      </main>
    </div>
  );
}

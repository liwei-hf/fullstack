/**
 * 应用主布局组件
 *
 * 包含：
 * - 侧边栏导航（可折叠）
 * - 顶部栏（页面标题 + 菜单按钮）
 * - 主内容区（滚动区域）
 *
 * 功能特性：
 * - 侧边栏宽度可切换（展开 64px / 折叠 16px）
 * - 导航项高亮当前页面
 * - 用户信息下拉菜单（退出登录）
 * - 响应式布局，内容区自动滚动
 */
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Users,
  LogOut,
  LayoutDashboard,
  Settings,
  Menu,
  ClipboardList,
  Database,
  BrainCircuit,
  History,
  MessageSquareText,
  Sparkles,
  ChevronDown,
  FolderKanban,
} from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '@/store/auth-store';
import { cn } from '@/lib/utils';

/**
 * 单个菜单项配置
 *
 * matchMode 用来控制路由高亮规则：
 * - exact：只在路径完全一致时高亮，适合“知识库管理 / 知识库问答”这类前缀相似页面
 * - prefix：允许详情页沿用同一菜单高亮，适合 Prompt 管理这类列表 -> 详情结构
 */
type NavigationItem = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  matchMode?: 'exact' | 'prefix';
};

/**
 * 二级菜单分组
 *
 * 后台入口已经从“知识库管理 / 知识库问答 / 智能问数”拆成独立能力，
 * 这里继续在导航层做一级分组，避免菜单平铺过长，也更符合后台信息架构。
 */
type NavigationGroup = {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavigationItem[];
};

const navigationGroups: NavigationGroup[] = [
  {
    name: '业务管理',
    icon: FolderKanban,
    items: [
      { name: '仪表盘', href: '/', icon: LayoutDashboard, matchMode: 'exact' },
      { name: '用户管理', href: '/users', icon: Users, matchMode: 'exact' },
      { name: '任务管理', href: '/todos', icon: ClipboardList, matchMode: 'exact' },
      { name: '设置', href: '/settings', icon: Settings, matchMode: 'exact' },
    ],
  },
  {
    name: 'AI 能力',
    icon: BrainCircuit,
    items: [
      { name: '知识库管理', href: '/knowledge-base', icon: Database, matchMode: 'exact' },
      { name: '知识库问答', href: '/knowledge-base/chat', icon: MessageSquareText, matchMode: 'exact' },
      { name: '智能问数', href: '/ai/sql', icon: BrainCircuit, matchMode: 'exact' },
      { name: '问答日志', href: '/ai/logs', icon: History, matchMode: 'exact' },
      { name: 'Prompt 管理', href: '/ai/prompts', icon: Sparkles, matchMode: 'prefix' },
    ],
  },
];

/**
 * 判断菜单项是否匹配当前路由。
 *
 * 这里单独抽出来，是为了避免 `/knowledge-base` 把 `/knowledge-base/chat`
 * 也一起高亮的问题。
 */
function isNavigationItemActive(item: NavigationItem, pathname: string) {
  if (item.matchMode === 'prefix') {
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  return pathname === item.href;
}

function getCurrentPageTitle(pathname: string) {
  for (const group of navigationGroups) {
    const matchedItem = group.items.find((item) => isNavigationItemActive(item, pathname));
    if (matchedItem) {
      return matchedItem.name;
    }
  }

  return '页面';
}

/**
 * 布局组件
 *
 * @param  - 页面内容（由路由注入）
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, refreshToken } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({
    业务管理: true,
    'AI 能力': true,
  });

  /**
   * 退出登录处理
   * 清除本地状态并跳转到登录页
   */
  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 侧边栏 */}
      <aside
        className={cn(
          'flex flex-col bg-white border-r border-gray-200 transition-all duration-300',
          sidebarOpen ? 'w-64' : 'w-16',
        )}
      >
        {/* Logo */}
        <div className="flex items-center h-16 px-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">M</span>
            </div>
            {sidebarOpen && (
              <span className="font-semibold text-gray-900">管理后台</span>
            )}
          </div>
        </div>

        {/* 导航 */}
        <ScrollArea className="flex-1 px-3 py-4">
          <nav className="space-y-3">
            {navigationGroups.map((group) => {
              const isGroupActive = group.items.some((item) =>
                isNavigationItemActive(item, location.pathname),
              );
              const isExpanded = groupOpen[group.name];

              return (
                <div key={group.name} className="space-y-1">
                  <button
                    type="button"
                    onClick={() =>
                      setGroupOpen((prev) => ({
                        ...prev,
                        [group.name]: !prev[group.name],
                      }))
                    }
                    className={cn(
                      'flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isGroupActive ? 'text-gray-900' : 'text-gray-500 hover:bg-gray-100',
                    )}
                  >
                    <group.icon className="h-4 w-4 shrink-0" />
                    {sidebarOpen && (
                      <>
                        <span className="ml-3 flex-1 text-left">{group.name}</span>
                        <ChevronDown
                          className={cn(
                            'h-4 w-4 transition-transform',
                            isExpanded && 'rotate-180',
                          )}
                        />
                      </>
                    )}
                  </button>

                  {isExpanded && (
                    <div className={cn('space-y-1', sidebarOpen ? 'pl-6' : 'pl-0')}>
                      {group.items.map((item) => (
                        <Link
                          key={item.name}
                          to={item.href}
                          className={cn(
                            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                            isNavigationItemActive(item, location.pathname)
                              ? 'bg-blue-50 text-blue-600'
                              : 'text-gray-600 hover:bg-gray-100',
                          )}
                        >
                          <item.icon className="h-4.5 w-4.5 shrink-0" />
                          {sidebarOpen && <span>{item.name}</span>}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </ScrollArea>

        <Separator />

        {/* 用户信息 */}
        <div className="p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className={cn(
                  'w-full justify-start gap-3',
                  !sidebarOpen && 'justify-center',
                )}
              >
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="bg-blue-100 text-blue-600 text-sm">
                    {user?.username?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                {sidebarOpen && (
                  <div className="flex-1 text-left overflow-hidden">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {user?.username}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {user?.role === 'admin' ? '管理员' : '用户'}
                    </p>
                  </div>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>我的账户</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-2" />
                退出登录
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 顶部栏 */}
        <header className="flex items-center h-16 px-6 bg-white border-b border-gray-200">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="mr-4"
          >
            <Menu className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-semibold text-gray-900">
            {getCurrentPageTitle(location.pathname)}
          </h1>
        </header>

        {/* 内容 */}
        <ScrollArea className="flex-1">
          <main className="p-6">{children}</main>
        </ScrollArea>
      </div>
    </div>
  );
}

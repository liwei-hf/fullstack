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
  MessageSquareText,
} from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '@/store/auth-store';
import { cn } from '@/lib/utils';

/**
 * 导航菜单配置
 *
 * name: 菜单名称（中文显示）
 * href: 路由路径
 * icon: 菜单图标（Lucide React 图标组件）
 */
const navigation = [
  { name: '仪表盘', href: '/', icon: LayoutDashboard },
  { name: '用户管理', href: '/users', icon: Users },
  { name: '任务管理', href: '/todos', icon: ClipboardList },
  { name: '知识库管理', href: '/knowledge-base', icon: Database },
  { name: '知识库问答', href: '/knowledge-base/chat', icon: MessageSquareText },
  { name: '智能问数', href: '/ai/sql', icon: BrainCircuit },
  { name: '设置', href: '/settings', icon: Settings },
];

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
          <nav className="space-y-1">
            {navigation.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  location.pathname === item.href
                    ? 'bg-blue-50 text-blue-600'  // 当前页面高亮
                    : 'text-gray-600 hover:bg-gray-100',  // 普通状态
                )}
              >
                <item.icon className="w-5 h-5" />
                {sidebarOpen && <span>{item.name}</span>}
              </Link>
            ))}
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
            {navigation.find((n) => n.href === location.pathname)?.name || '页面'}
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

/**
 * 应用根组件 - 路由配置
 *
 * 使用 React Router v6 定义应用路由：
 * - /login：登录页（公开访问）
 * - /：仪表盘（受保护，需要登录）
 * - /users：用户管理（受保护，需要登录）
 * - /settings：设置（受保护，需要登录）
 *
 * 鉴权逻辑：
 * - 未登录用户访问受保护路由时，重定向到登录页
 * - 已登录用户通过 ProtectedRoute 包裹，显示 Layout 布局
 */
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useAuthStore } from '@/store/auth-store';

/**
 * 管理端页面按路由懒加载
 *
 * 现在后台页面已经越来越多，直接同步 import 会把所有 AI / 知识库页面都塞进首屏包体。
 * 这里改成 lazy + Suspense，可以明显降低首次加载压力。
 */
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const UserListPage = lazy(() => import('@/pages/UserListPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const TodoListPage = lazy(() => import('@/pages/TodoListPage'));
const KnowledgeBasePage = lazy(() => import('@/pages/KnowledgeBasePage'));
const KnowledgeBaseChatPage = lazy(() => import('@/pages/KnowledgeBaseChatPage'));
const SqlQueryPage = lazy(() => import('@/pages/SqlQueryPage'));
const AiLogPage = lazy(() => import('@/pages/AiLogPage'));
const PromptManagementPage = lazy(() => import('@/pages/PromptManagementPage'));
const PromptTemplateListPage = lazy(() => import('@/pages/PromptTemplateListPage'));

/**
 * 受保护路由组件
 *
 * 检查用户是否登录（通过 Zustand store 中的 token）：
 * - 未登录：重定向到 /login
 * - 已登录：渲染 Layout 布局和子组件
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((state) => state.token);
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <Layout>{children}</Layout>;
}

function RouteFallback() {
  return (
    <div className="flex min-h-[240px] items-center justify-center rounded-2xl border bg-white text-sm text-slate-500">
      页面加载中...
    </div>
  );
}

/**
 * 应用根组件
 *
 * 路由表：
 * - GET /login - 登录页
 * - GET / - 仪表盘（受保护）
 * - GET /users - 用户管理（受保护）
 * - GET /todos - 任务管理（受保护）
 * - GET /settings - 设置（受保护）
 */
function App() {
  return (
    <BrowserRouter future={{ v7_relativeSplatPath: true }}>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute>
                <UserListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/todos"
            element={
              <ProtectedRoute>
                <TodoListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/knowledge-base"
            element={
              <ProtectedRoute>
                <KnowledgeBasePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/knowledge-base/chat"
            element={
              <ProtectedRoute>
                <KnowledgeBaseChatPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ai/sql"
            element={
              <ProtectedRoute>
                <SqlQueryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ai/logs"
            element={
              <ProtectedRoute>
                <AiLogPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ai/prompts"
            element={
              <ProtectedRoute>
                <PromptTemplateListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ai/prompts/:code"
            element={
              <ProtectedRoute>
                <PromptManagementPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;

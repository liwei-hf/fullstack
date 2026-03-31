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
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import UserListPage from '@/pages/UserListPage';
import SettingsPage from '@/pages/SettingsPage';
import TodoListPage from '@/pages/TodoListPage';
import KnowledgeBasePage from '@/pages/KnowledgeBasePage';
import { useAuthStore } from '@/store/auth-store';

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
      </Routes>
    </BrowserRouter>
  );
}

export default App;

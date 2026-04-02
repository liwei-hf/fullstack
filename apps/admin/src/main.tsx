/**
 * 应用入口文件
 *
 * React 18 启动入口，使用 createRoot API
 *
 * 核心功能：
 * - 渲染根组件 App
 * - 自动引入全局样式（index.css）
 */
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// 创建根节点并渲染应用
createRoot(document.getElementById('root')!).render(
  <App />
);

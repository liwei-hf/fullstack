/**
 * 应用入口文件
 *
 * React 18 启动入口，使用 createRoot API
 *
 * 核心功能：
 * - 渲染根组件 App
 * - 启用 StrictMode 严格模式（开发模式下会渲染两次，帮助发现副作用问题）
 * - 自动引入全局样式（index.css）
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// 创建根节点并渲染应用
// 启用 StrictMode 严格模式（开发模式下会渲染两次，帮助发现副作用问题）
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

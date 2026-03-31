/*
 * @Author: liwei
 * @Date: 2026-03-31 10:45:47
 * @LastEditors: liwei
 * @LastEditTime: 2026-03-31 10:45:58
 * @Description: 
 * 
 */
/**
 * Vite 配置文件
 *
 * 核心配置说明：
 * - plugins: 使用 @vitejs/plugin-react 支持 React JSX
 * - resolve.alias: 配置 @ 别名指向 src 目录，简化导入路径
 * - server: 开发服务器配置
 *   - port: 3333 - 开发端口
 *   - proxy: /api 代理到后端服务（http://localhost:3334）
 *
 * 代理配置作用：
 * 前端请求 /api/xxx 时，自动转发到后端服务
 * 避免跨域问题，开发环境可以直接调用后端 API
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],  // 支持 React
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),  // @ 别名指向 src 目录
    },
  },
  server: {
    port: 3335,  // 开发服务器端口
    proxy: {
      '/api': {
        target: 'http://localhost:3334',  // 后端服务地址
        changeOrigin: true,  // 修改请求头中的 Origin
      },
    },
  },
});

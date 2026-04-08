# Fullstack AI Platform

> 一个基于 `pnpm workspace + Turbo` 的全栈 Monorepo，包含管理端、移动端、NestJS 服务端，以及面向 AI / 知识库 / 智能问数场景的完整工程骨架。

适合用于：
- 全栈项目演示与讲解
- 企业后台与移动端协同开发练习
- AI 问答、知识库、RAG、智能问数能力集成
- Monorepo、共享契约、CI/CD 实践

## 技术栈

### apps/admin
- React 18
- TypeScript
- Vite
- TailwindCSS
- shadcn/ui + Radix UI
- Zustand

### apps/mobile
- Vue 3
- TypeScript
- Vite
- Vue Router
- Pinia

### apps/server
- NestJS
- Prisma
- PostgreSQL
- JWT
- Redis（缓存 / 队列 / 短期记忆，可选）
- MinIO（知识库文件存储，可选）
- Vercel AI SDK / OpenAI Compatible API
- LangChain（知识库检索与 RAG 扩展边界）

### packages/shared
- 跨端共享类型
- 枚举、常量、分页模型
- API 契约

## 当前模块

### 服务端
- `auth`：登录、刷新 Token、登出、当前用户
- `users`：用户 CRUD、状态管理、重置密码
- `departments`：部门管理
- `todos`：个人任务列表
- `system-settings`：系统设置
- `ai`：智能问数、Prompt 管理、AI 日志
- `knowledge-base`：知识库、文档导入、问答、RAG 相关流程

### 管理端
- 登录页
- 仪表盘
- 用户管理
- 待办管理
- 系统设置
- 智能问数
- AI 日志
- Prompt 模板与 Prompt 详情管理
- 知识库列表与知识库问答页面

### 移动端
- 登录
- 会话首页
- 智能问数
- 知识库问答

## 项目结构

```text
apps/
  admin/      React 管理端
  mobile/     Vue H5 移动端
  server/     NestJS 后端
packages/
  shared/     跨端共享契约
deploy/       演示环境部署脚本
.github/
  workflows/  CI/CD 工作流
```

## 环境要求

- Node.js >= 18
- pnpm >= 9
- PostgreSQL >= 14

可选依赖：
- Redis：知识库异步队列、缓存、短期记忆
- MinIO：知识库文档对象存储

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置服务端环境变量

开发环境可以从示例文件开始：

```bash
cp apps/server/.env.example apps/server/.env
```

至少需要确认这些变量可用：

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/fullstack
JWT_ACCESS_SECRET=replace-with-access-secret
SEED_ADMIN_PASSWORD=Admin123456!
OPENAI_API_KEY=replace-with-openai-key
OPENAI_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

说明：
- 如果本地暂时不跑 Redis，可不配置 `REDIS_*`
- 如果本地暂时不跑 MinIO，可不配置 `MINIO_*`
- 知识库上传链路依赖 MinIO；智能问数与基础后台链路不依赖它

### 3. 初始化数据库

```bash
pnpm db:generate
pnpm db:push
pnpm db:seed
```

默认种子账号：
- 用户名：`admin`
- 密码：`Admin123456!`

### 4. 启动开发环境

```bash
pnpm dev:server
pnpm dev:admin
pnpm dev:mobile
```

也可以直接启动整个 Monorepo：

```bash
pnpm dev
```

## 常用命令

### 开发

```bash
pnpm dev
pnpm dev:server
pnpm dev:admin
pnpm dev:mobile
```

### 质量检查

```bash
pnpm typecheck
pnpm build
pnpm test
pnpm test:e2e
```

说明：
- `pnpm typecheck` 会覆盖 `admin / mobile / server / shared`
- `pnpm test` 当前运行管理端单测和服务端单测
- `pnpm test:e2e` 当前运行服务端 e2e

### 数据库

```bash
pnpm db:generate
pnpm db:push
pnpm db:migrate
pnpm db:seed
pnpm db:studio
```

### 部署

```bash
pnpm deploy:sync
pnpm deploy:nginx
pnpm deploy:release:build
pnpm deploy:release
```

## API 概览

### 认证
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### 用户与组织
- `GET /api/admin/users`
- `POST /api/admin/users`
- `PATCH /api/admin/users/:id`
- `PATCH /api/admin/users/:id/status`
- `POST /api/admin/users/:id/reset-password`
- `GET /api/departments`

### 待办
- `GET /api/todos`
- `POST /api/todos`
- `GET /api/todos/:id`
- `PATCH /api/todos/:id`
- `PATCH /api/todos/:id/status`
- `DELETE /api/todos/:id`

### AI / 智能问数
- `POST /api/ai/sql/stream`
- `GET /api/ai/logs`
- `GET /api/ai/prompts`
- `PUT /api/ai/prompts/:code`

### 知识库
- `GET /api/knowledge-base`
- `POST /api/knowledge-base`
- `POST /api/knowledge-base/:id/documents/upload`
- `POST /api/knowledge-base/:id/import-zip`
- `GET /api/knowledge-base/:id/documents`
- `POST /api/knowledge-base/:id/chat/stream`

## 测试说明

当前仓库已覆盖这些自动化测试：
- 管理端：登录页、认证 store、API 请求层
- 服务端单测：SQL 校验器
- 服务端 e2e：认证、用户、待办、知识库主链路

CI 默认执行：
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`
- `pnpm build`

## 工程说明

### 为什么用 Monorepo
- 管理端、移动端、服务端共用一套版本和依赖管理
- 共享契约可以统一类型边界，减少联调误差
- 适合演示真实全栈工程的组织方式

### 为什么 shared 只放契约
- 避免浏览器和 Node 运行时混用实现
- 共享数据结构比共享业务实现更稳定
- 有利于前后端解耦与后续扩展

### 为什么 AI 单独成域
- 便于统一管理供应商切换、Prompt、日志、权限、限流
- 避免把模型调用散落到页面或普通业务 service
- 为后续 LangChain / RAG 扩展预留清晰边界

## CI/CD

- CI：执行类型检查、测试、构建
- CD：`main` 分支触发演示环境部署
- 部署脚本位于 [deploy](/Users/liwei/self/fullstack/deploy)

## 许可证

MIT

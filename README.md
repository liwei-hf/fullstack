# Fullstack Interview Project

> 一个面向面试学习的全栈项目，涵盖企业级开发的核心技术栈和最佳实践

## 技术栈

| 模块 | 技术选型 |
|------|----------|
| Monorepo | pnpm workspace + Turbo |
| 管理端 | React + TypeScript + TailwindCSS + shadcn/ui |
| 移动端 | uni-app + Vue 3 + TypeScript |
| 后端 | NestJS + Prisma + PostgreSQL |
| 认证 | JWT + Refresh Token 轮转 |
| 共享 | 跨端类型定义（packages/shared） |

## 快速开始

### 环境要求

- Node.js >= 18
- pnpm >= 9
- PostgreSQL >= 14

### 安装依赖

```bash
pnpm install
```

### 配置环境变量

后端环境变量位于 `apps/server/.env`：

```bash
# 数据库
DATABASE_URL=postgresql://user:password@localhost:5432/dbname

# JWT 配置
JWT_ACCESS_SECRET=your-secret-key
JWT_ACCESS_EXPIRES_IN=15m
REFRESH_TOKEN_TTL_DAYS=7

# 默认密码（新用户初始密码）
DEFAULT_USER_PASSWORD=ChangeMe123!
```

### 启动开发环境

```bash
# 启动所有应用（后端 + 管理端 + 移动端）
pnpm dev

# 单独启动后端
pnpm dev:server

# 单独启动管理端
pnpm dev:admin

# 单独启动移动端
pnpm dev:mobile
```

### 数据库初始化

```bash
# 生成 Prisma 客户端
pnpm db:generate

# 执行数据库迁移
pnpm --filter @fullstack/server prisma migrate dev

# 初始化种子数据（创建管理员账号）
pnpm db:seed
```

## 目录结构

```
fullstack/
├── apps/
│   ├── admin/          # React 管理端（端口 5173）
│   │   ├── src/
│   │   │   ├── api/           # API 客户端封装
│   │   │   ├── components/    # 基础组件（Button/Input/Dialog）
│   │   │   ├── features/      # 功能模块（auth/users）
│   │   │   ├── lib/           # 工具函数
│   │   │   ├── styles/        # 全局样式
│   │   │   ├── App.tsx        # 路由配置
│   │   │   └── main.tsx       # 入口文件
│   │   └── vite.config.ts
│   │
│   ├── mobile/         # uni-app 移动端（端口 5174）
│   │   ├── src/
│   │   │   ├── api/           # API 客户端
│   │   │   ├── composables/   # 组合式函数（useAuth）
│   │   │   ├── stores/        # Pinia 状态管理
│   │   │   ├── types/         # 类型定义
│   │   │   └── main.ts        # 入口文件
│   │   └── vite.config.ts
│   │
│   └── server/         # NestJS 后端（端口 3000）
│       ├── src/
│       │   ├── auth/          # 认证模块（JWT、Guard、Strategy）
│       │   ├── users/         # 用户模块（CRUD、状态管理）
│       │   ├── sessions/      # 会话模块（Token 管理）
│       │   ├── common/        # 公共模块（Decorator、Guard）
│       │   ├── prisma/        # 数据库服务
│       │   ├── config/        # 配置管理
│       │   ├── main.ts        # 入口文件
│       │   └── app.module.ts  # 根模块
│       └── prisma/
│           ├── schema.prisma  # 数据模型
│           └── seed.ts        # 种子数据
│
├── packages/
│   └── shared/       # 共享类型定义
│       └── src/
│           └── index.ts
│
├── AGENTS.md         # AI 协作规范
├── package.json      # 根配置
├── turbo.json        # Turbo 配置
└── pnpm-workspace.yaml
```

## API 接口文档

### 认证接口

| 接口 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/auth/login` | POST | 用户登录 | 公开 |
| `/api/auth/refresh` | POST | 刷新 Token | 公开 |
| `/api/auth/logout` | POST | 用户登出 | 需认证 |
| `/api/auth/me` | GET | 获取当前用户 | 需认证 |

### 用户管理接口（仅管理员）

| 接口 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/admin/users` | GET | 用户列表（分页、搜索） | ADMIN |
| `/api/admin/users` | POST | 创建用户 | ADMIN |
| `/api/admin/users/:id` | PATCH | 更新用户信息 | ADMIN |
| `/api/admin/users/:id/status` | PATCH | 更新用户状态 | ADMIN |
| `/api/admin/users/:id/reset-password` | POST | 重置密码 | ADMIN |

## 面试可讲点

### 1. 架构设计

- **为什么采用 Monorepo？** 代码共享、版本统一、原子化提交
- **为什么共享层只放契约？** 前后端运行环境不同，避免过度耦合
- **为什么后端分层？** 单一职责、可测试、易维护

### 2. 认证授权

- **JWT + Refresh Token 轮转策略** - 防止重放攻击
- **会话管理** - 支持多端登录、移动端单会话、会话撤销
- **RBAC 权限控制** - 基于角色的访问控制

### 3. 工程化

- **TypeScript 类型安全** - 前后端共享类型定义
- **统一错误处理** - 标准化错误格式和 HTTP 状态码
- **环境变量管理** - 敏感配置与代码分离

### 4. 前端技术

- **React + Context** - 认证状态管理
- **组合式 API（移动端）** - useAuth 封装
- **TailwindCSS** - 原子化 CSS 开发

## 默认账号

| 角色 | 账号 | 密码 |
|------|------|------|
| 管理员 | admin | Admin123456! |

## 常见问题

**Q: 如何添加新用户？**
A: 登录后在管理端用户列表页点击"新增用户"，填写信息后创建，默认密码在环境变量配置。

**Q: 如何重置用户密码？**
A: 在用户列表页点击对应用户的"重置密码"按钮。

**Q: 移动端和管理端能同时登录吗？**
A: 管理员账号只能在管理端登录，普通用户只能在移动端登录。

## 许可证

MIT

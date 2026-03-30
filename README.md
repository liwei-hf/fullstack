# Fullstack Interview Project

> 基于 NestJS + React + shadcn/ui 的全栈项目，采用 pnpm workspace monorepo 架构。
>
> 适合用于：
> - 面试项目展示
> - 全栈技能演示
> - 企业级管理系统参考
> - 学习和实践现代 Web 开发技术

## 技术栈

### 后端 (@fullstack/server)
| 技术 | 用途 | 版本 |
|------|------|------|
| NestJS | Node.js 框架（依赖注入、模块化架构） | ^10.0.0 |
| Prisma | 数据库 ORM（类型安全、自动迁移） | ^5.0.0 |
| PostgreSQL | 关系型数据库 | >=14 |
| JWT + Passport | 认证授权 | ^10.0.0 |
| bcryptjs | 密码加密 | ^2.4.3 |
| class-validator | 参数校验 | ^0.14.0 |

### 前端 (@fullstack/admin)
| 技术 | 用途 | 版本 |
|------|------|------|
| React | UI 框架 | ^18.2.0 |
| Vite | 构建工具（快速热更新） | ^5.0.0 |
| shadcn/ui | UI 组件库（基于 Radix UI） | ^4.1.1 |
| Radix UI | 无头组件 primitives | 最新 |
| TailwindCSS | 原子化 CSS | 3.4.0 |
| React Router | 路由 | ^6.0.0 |
| Zustand | 状态管理 | ^4.3.0 |

### 共享 (@fullstack/shared)
- TypeScript 类型定义
- 前后端共享的接口和常量
- API 契约（请求/响应格式）

### 工程化
| 技术 | 用途 |
|------|------|
| pnpm workspace | 包管理（节省磁盘空间、快速安装） |
| Turbo | 构建任务编排（缓存、并行执行） |
| TypeScript | 类型系统 |

## 快速开始

### 1. 环境要求

- Node.js >= 18
- pnpm >= 9
- PostgreSQL >= 14

### 2. 安装依赖

```bash
pnpm install
```

### 3. 配置数据库

```bash
# 确保 PostgreSQL 已启动并创建了数据库
# 修改 apps/server/.env 中的 DATABASE_URL

# 生成 Prisma Client
pnpm db:generate

# 推送表结构到数据库
pnpm db:push

# 初始化种子数据（创建管理员账号）
pnpm db:seed
```

### 4. 启动开发服务器

```bash
# 启动后端（端口 3000）
pnpm dev:server

# 启动管理后台前端（端口 3001）
pnpm dev:admin
```

### 5. 登录

- 管理员账号：`admin`
- 密码：`Admin123456!`

## 项目结构

```
fullstack-interview-project/
├── apps/
│   ├── server/           # NestJS 后端
│   │   ├── src/
│   │   │   ├── auth/     # 认证模块（登录、Token 刷新、会话管理）
│   │   │   ├── users/    # 用户管理模块（CRUD、状态管理）
│   │   │   ├── sessions/ # 会话管理模块（Refresh Token、会话撤销）
│   │   │   ├── prisma/   # Prisma 服务（数据库访问）
│   │   │   ├── common/   # 公共模块（装饰器、过滤器等）
│   │   │   └── main.ts   # 应用入口
│   │   └── prisma/       # Prisma schema 和种子数据
│   └── admin/            # React 管理后台
│       └── src/
│           ├── pages/    # 页面组件
│           ├── components/ # 通用组件和 UI 组件
│           ├── store/    # 状态管理（Zustand）
│           ├── hooks/    # 自定义 Hooks
│           ├── utils/    # 工具函数
│           └── App.tsx   # 应用根组件
├── packages/
│   └── shared/           # 共享类型定义
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.base.json
```

## 核心功能

### 认证系统
- JWT Token 认证
- Access Token + Refresh Token 双 Token 机制
- Token 轮转（Refresh Token 每次刷新后生成新 Token）
- 单设备登录（移动端）/ 多设备登录（管理端）
- 会话管理（登出、禁用用户时会话撤销）

### 用户管理
- 用户 CRUD 操作
- 用户状态管理（启用/禁用）
- 密码重置
- 分页查询和搜索
- 唯一性校验（用户名、手机号）

### 安全设计
- bcrypt 密码加密（10 轮盐）
- Refresh Token 哈希存储（即使数据库泄露也无法反推）
- JWT 签名验证 + 会话验证双重保障
- 客户端类型访问控制（管理员/普通用户）

## 开发说明

### 后端开发

```bash
cd apps/server
pnpm dev  # 监听模式启动
```

核心模块：
- `auth/` - 认证相关（controller、service、guards、strategies、dto）
- `users/` - 用户管理（controller、service）
- `sessions/` - 会话管理
- `prisma/` - 数据库访问

### 前端开发

```bash
cd apps/admin
pnpm dev  # Vite 开发服务器
```

核心目录：
- `pages/` - 页面组件（Login、UserList）
- `components/` - 通用组件和 UI 组件
- `store/` - 状态管理
- `utils/` - 工具函数

### 数据库操作

```bash
pnpm db:generate  # 生成 Prisma Client
pnpm db:push      # 推送 schema 到数据库
pnpm db:studio    # 打开 Prisma Studio（可视化数据库管理）
pnpm db:seed      # 执行种子数据
```

## API 接口

### 认证接口

| 方法 | 路径 | 说明 | 需要认证 |
|------|------|------|----------|
| POST | /api/auth/login | 用户登录 | 否 |
| POST | /api/auth/refresh | 刷新 Token | 否 |
| POST | /api/auth/logout | 用户登出 | 是 |
| GET | /api/auth/me | 获取当前用户 | 是 |

### 用户管理接口

| 方法 | 路径 | 说明 | 需要认证 |
|------|------|------|----------|
| GET | /api/admin/users | 用户列表 | 是 |
| POST | /api/admin/users | 创建用户 | 是 |
| PATCH | /api/admin/users/:id | 更新用户 | 是 |
| PATCH | /api/admin/users/:id/status | 更新状态 | 是 |
| POST | /api/admin/users/:id/reset-password | 重置密码 | 是 |

## 常见问题

### 端口被占用
后端启动失败，报错 `EADDRINUSE`:
```bash
lsof -i :3000
kill -9 <PID>
```

### 数据库连接失败
检查 PostgreSQL 是否启动，DATABASE_URL 配置是否正确。

### 热重载问题
后端使用 `nest start --watch` 进行热重载，这是 NestJS 官方推荐的方式，稳定可靠。

### 前端跨域问题
前端已通过 Vite 代理配置 `/api` 转发到后端，开发环境不会出现跨域问题。

## 技术亮点

1. **Monorepo 架构** - 代码共享、版本统一、原子化提交
2. **类型安全** - 前后端共享类型定义，减少联调成本
3. **Token 轮转** - Refresh Token 每次刷新后更换，防止重放攻击
4. **会话管理** - 支持单会话/多会话策略，灵活的会话撤销机制
5. **现代 UI** - 基于 shadcn/ui + TailwindCSS，美观且可控

## 许可证

MIT

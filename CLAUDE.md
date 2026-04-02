# CLAUDE.md - 项目协作速查手册

> 精简版协作规范，5 分钟快速上手。详细版见 [AGENTS.md](./AGENTS.md)。

---

## 项目定位

- **用途**: 项目展示 + 全栈技能演示
- **目标**: 可运行、可维护、可讲解、可扩展
- **原则**: MVP 优先，不过度设计

---

## 技术栈速查

| 层级 | 技术选型 |
|------|----------|
| Monorepo | pnpm workspace + Turbo |
| 管理端 | React + TS + TailwindCSS + shadcn/ui + Radix UI |
| 移动端 | uni-app + TypeScript (H5 优先) |
| 后端 | NestJS + Prisma + PostgreSQL |
| 认证 | JWT (双 Token 轮转) |
| AI | Vercel AI SDK (预留 LangChain/RAG 边界) |
| 共享包 | 只放类型、枚举、常量、接口契约 |

---

## 目录结构

```
apps/
  admin/      # 管理端 (React + Vite 端口 3333)
  mobile/     # 移动端 (uni-app)
  server/     # 后端 (NestJS 端口 3000 API 前缀 /api)
packages/
  shared/     # 共享契约 (类型/枚举/常量)
```

**禁止**: 三端复制类型定义、前端直连后端内部实现、AI 调用散落各处

---

## 启动命令

```bash
pnpm dev              # 启动所有开发服务器
pnpm dev:server       # 仅后端
pnpm dev:admin        # 仅前端
pnpm db:generate      # 生成 Prisma Client
pnpm db:push          # 推送 Schema 到数据库
pnpm db:migrate       # 执行迁移
pnpm db:seed          # 种子数据
```

**默认账号**: `admin` / `Admin123456!`

---

## 测试命令

### 后端测试
```bash
cd apps/server
pnpm test          # 单元测试
pnpm test:e2e      # E2E 测试
pnpm test:cov      # 覆盖率报告
```

### 前端测试
```bash
cd apps/admin
pnpm test          # 运行测试
pnpm test:ui       # 可视化 UI 测试
pnpm test:run      # 单次运行测试
pnpm test:coverage # 覆盖率报告

# 测试文件位于 src/__tests__/
```

---

## 代码分层规范

### 后端 (NestJS)

| 模块 | 职责 |
|------|------|
| controller | 请求接收/参数校验/返回结果 |
| service | 纯业务逻辑 |
| dto | 输入输出结构定义 + 校验 |
| prisma | 数据库访问 |
| guard/interceptor/filter | 横切逻辑 (权限/响应/异常) |

### 前端 (React)

- 页面组件 + 业务组件分离
- 请求层/页面层/组件层分层
- 样式优先 TailwindCSS，不引入多套方案
- 列表页：搜索 + 表格 + 分页 + 加载态 + 空态 + 错误态
- 表单页：校验 + 回填 + 提交中 + 反馈

---

## 接口与错误处理

### 错误响应格式

```typescript
{
  statusCode: number;
  code: string;            // MODULE_CODE
  message: string;
  details?: unknown;
  path: string;
  timestamp: string;
}
```

### 状态码规范

| 状态码 | 场景 |
|--------|------|
| 401 | 未认证/Token 无效 → 跳转登录 |
| 403 | 无权限 → Toast 提示 |
| 404 | 资源不存在 |
| 422 | 校验失败 |
| 500 | 服务器错误 |

---

## AI 集成规范

- AI 能力必须是独立领域模块，不散落在业务代码中
- 模型供应商必须可替换
- Prompt 模板、密钥、配置集中管理
- 优先 Vercel AI SDK，预留 LangChain/RAG 扩展边界
- 前端不直接持有敏感模型密钥

---

## Subagent 并行规则

当任务涉及多模块、多文件、无依赖时，自动拆分为并行 Subagent：

| 规则 | 说明 |
|------|------|
| 拆分条件 | 任务涉及多个独立模块/文件且无依赖关系 |
| 子代理职责 | 每个子代理仅负责 1 个独立模块/文件，避免冲突 |
| 子代理类型 | `code-reviewer`、`test-writer`、`explorer`、`doc-generator` |
| 并行上限 | 最多 5 个 Subagent 同时运行 |

**示例场景**:
- 同时修改前后端多个独立模块 → 拆分为多个子代理
- 编写多个文件的单元测试 → test-writer 子代理并行处理
- 探索不同目录的代码结构 → explorer 子代理并行探索

---

## 必须覆盖的交互状态

- Loading 状态
- Empty 状态
- Error 状态
- 提交反馈
- 危险操作确认

---

## 环境变量管理

- `.env.example` 必须提交，包含所有必要变量
- `.env` 禁止提交
- 后端密钥必须在服务端
- 前端公开变量以 `VITE_` 或 `NEXT_PUBLIC_` 前缀标识

---

## Claude Code 特定配置

### 工具使用偏好

- 文件操作优先使用专用工具 (Read/Write/Edit/Glob/Grep)，不用 shell 命令
- 代码修改先读后改，不盲目编辑
- 复杂任务用 TaskCreate 拆分步骤
- 需要用户确认的决策用 AskUserQuestion

### 回复风格

- 简洁直接，先说结论/行动
- 无必要不写 trailing summary
- 技术术语保留英文，解释用中文

---

## 一句话验收标准

> 能运行、能联调、有错误处理、有类型定义、有合理目录、有最小注释、能解释设计取舍

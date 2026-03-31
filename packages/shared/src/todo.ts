/**
 * Todo 任务管理相关类型定义
 *
 * 用途说明：
 * - 定义 Todo 任务的状态枚举、实体类型和请求参数
 * - 前后端共享，保证数据结构一致性
 *
 * 使用场景：
 * - 任务管理页面的列表展示、新增、编辑、删除操作
 * - API 请求/响应的类型约束
 */

// ==================== Todo 状态枚举 ====================

/**
 * Todo 任务状态
 *
 * - TODO: 待办 - 新创建的任务默认状态
 * - IN_PROGRESS: 进行中 - 用户开始处理任务
 * - DONE: 已完成 - 任务已完成
 */
export const TODO_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'] as const;
export type TodoStatus = (typeof TODO_STATUSES)[number];

/**
 * 状态标签配置（用于前端展示）
 */
export const TODO_STATUS_LABELS: Record<TodoStatus, string> = {
  TODO: '待办',
  IN_PROGRESS: '进行中',
  DONE: '已完成'
};

// ==================== Todo 实体类型 ====================

/**
 * Todo 任务实体
 *
 * 对应数据库 Todo 表，包含任务的完整信息：
 * - 基本字段：标题、描述
 * - 状态：TODO / IN_PROGRESS / DONE
 * - 时间戳：创建时间、更新时间
 */
export interface Todo {
  id: string;           // 任务 ID
  userId: string;       // 所属用户 ID
  title: string;        // 任务标题
  description: string | null; // 任务描述（可选）
  status: TodoStatus;   // 任务状态
  createdAt: string;    // 创建时间
  updatedAt: string;    // 更新时间
}

// ==================== API 请求/响应类型 ====================

/**
 * 创建任务请求参数
 *
 * 用于新增任务时提交：
 * - title: 必填，任务标题
 * - description: 可选，任务描述
 */
export interface CreateTodoRequest {
  title: string;
  description?: string;
}

/**
 * 更新任务请求参数
 *
 * 用于编辑任务时提交，所有字段可选：
 * - 可单独更新标题、描述或状态
 */
export interface UpdateTodoRequest {
  title?: string;
  description?: string;
  status?: TodoStatus;
}

/**
 * 任务列表查询参数
 *
 * 用于筛选和分页：
 * - status: 按状态筛选（可选）
 * - page: 页码（默认 1）
 * - pageSize: 每页数量（默认 10）
 */
export interface TodoListQuery {
  status?: TodoStatus;
  page?: number;
  pageSize?: number;
}

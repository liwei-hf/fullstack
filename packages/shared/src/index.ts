/**
 * 共享类型定义和工具函数
 *
 * 用途说明：
 * - 存放前端和后端共享的类型定义、接口契约、常量
 * - 避免前后端分别定义相同类型导致的联调成本
 * - 保持数据结构和接口的一致性
 *
 * 不存放：
 * - 前端专属的 UI 逻辑
 * - 后端专属的数据库实现
 * - 与具体框架强耦合的运行时代码
 */

// ==================== 用户常量 ====================

/**
 * 用户角色枚举值
 * - admin：管理员，可访问管理后台
 * - user：普通用户，仅可访问移动端应用
 */
export const USER_ROLES = ['admin', 'user'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * 用户状态枚举值
 * - active：正常状态，可登录和使用系统
 * - disabled：已禁用，无法登录
 */
export const USER_STATUSES = ['active', 'disabled'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/**
 * 客户端类型枚举值
 * - admin：管理后台
 * - mobile：移动端应用
 */
export const CLIENT_TYPES = ['admin', 'mobile'] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];

// ==================== 认证相关类型 ====================

/**
 * 认证 Token 信息
 *
 * 后端登录后返回的 Token 信息：
 * - accessToken：访问令牌（有效期短，如 15 分钟）
 * - refreshToken：刷新令牌（有效期长，如 7 天）
 * - expiresIn：accessToken 过期时间（秒）
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * 当前登录用户信息
 *
 * 登录后保存在前端 Zustand store 中，包含：
 * - 基本身份信息（id、username、phone、nickname、avatar）
 * - 权限信息（role、status、clientType）
 * - 会话信息（sessionId，用于登出时撤销会话）
 */
export interface CurrentUser {
  id: string;
  username: string;
  phone: string;
  nickname: string;
  avatar: string | null;
  role: UserRole;
  status: UserStatus;
  clientType: ClientType;
  sessionId: string;
}

/**
 * 认证响应结构
 *
 * 登录接口（/api/auth/login）和刷新 Token 接口（/api/auth/refresh）的返回格式
 */
export interface AuthResponse {
  user: CurrentUser;
  tokens: AuthTokens;
}

/**
 * 登录请求参数
 *
 * 用于管理端和移动端登录：
 * - account：账号（用户名或手机号）
 * - password：密码
 * - clientType：客户端类型（admin/mobile），决定访问权限和会话策略
 * - deviceId：设备 ID（可选，用于移动端标识设备）
 */
export interface LoginPayload {
  account: string;
  password: string;
  clientType: ClientType;
  deviceId?: string;
}

/**
 * 刷新 Token 请求参数
 */
export interface RefreshPayload {
  refreshToken: string;
}

// ==================== 分页相关类型 ====================

/**
 * 分页元信息
 *
 * 用于列表接口返回分页数据：
 * - page：当前页码
 * - pageSize：每页数量
 * - total：总记录数
 */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

/**
 * 分页响应结构
 *
 * 通用分页列表返回格式，T 为列表项类型
 */
export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}

/**
 * 默认每页数量
 */
export const DEFAULT_PAGE_SIZE = 10;

// ==================== 用户管理相关类型 ====================

/**
 * 用户列表项
 *
 * 管理端用户列表展示的数据结构，包含：
 * - 基本身份信息
 * - 角色和状态
 * - 时间戳（最后登录时间、创建时间、更新时间）
 */
export interface UserListItem {
  id: string;
  username: string;
  phone: string;
  nickname: string;
  avatar: string | null;
  role: UserRole;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 用户表单数据（新增/编辑）
 *
 * 用于新增或编辑用户时的表单提交：
 * - 编辑时 username 和 phone 通常不可修改
 */
export interface UserFormPayload {
  username: string;
  phone: string;
  nickname: string;
  avatar?: string | null;
}

/**
 * 更新用户状态请求参数
 */
export interface UpdateUserStatusPayload {
  status: UserStatus;
}

// ==================== 通用类型 ====================

/**
 * API 统一响应包装器
 *
 * 后端所有接口返回都包裹在 { data: T } 结构中
 * 前端 API 客户端自动解包返回 data 字段
 */
export interface ApiEnvelope<T> {
  data: T;
}

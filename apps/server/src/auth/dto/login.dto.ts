/**
 * 登录请求数据传输对象（DTO）
 *
 * 用于验证登录接口请求参数的格式
 * 使用 class-validator 装饰器进行参数校验
 *
 * 校验规则：
 * - account：必填，字符串，账号（用户名或手机号）
 * - password：必填，字符串，密码
 * - clientType：必填，必须是 'admin' 或 'mobile'
 * - deviceId：移动端登录时必填，字符串
 */
import { IsString, IsNotEmpty, IsIn, IsOptional, ValidateIf } from 'class-validator';
import { CLIENT_TYPES } from '@fullstack/shared';

export class LoginDto {
  /**
   * 账号（用户名或手机号）
   */
  @IsString()
  @IsNotEmpty()
  account!: string;

  /**
   * 密码
   */
  @IsString()
  @IsNotEmpty()
  password!: string;

  /**
   * 客户端类型
   * - admin：管理后台
   * - mobile：移动端应用
   */
  @IsIn(CLIENT_TYPES)
  clientType!: 'admin' | 'mobile';

  /**
   * 设备 ID（可选）
   * 用于标识移动设备，支持单会话策略
   * Web 端 H5 可不传
   */
  @IsOptional()
  @IsString()
  deviceId?: string;
}

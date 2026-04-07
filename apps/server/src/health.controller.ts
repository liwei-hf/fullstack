import { Controller, Get } from '@nestjs/common';

/**
 * 健康检查控制器
 *
 * 用途：
 * 1. 给 Nginx、发布脚本和外部探活提供一个不依赖登录态的检查入口
 * 2. 避免部署验证继续依赖默认账号密码或业务接口
 */
@Controller('health')
export class HealthController {
  /**
   * 返回最小可用健康状态
   *
   * 这里只做应用层存活检查，不串联数据库和外部模型，
   * 目的是让部署探活稳定、快速、低耦合。
   */
  @Get()
  getHealth() {
    return {
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
      },
    };
  }
}

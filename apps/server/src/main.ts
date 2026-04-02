/**
 * 应用启动入口文件
 *
 * 核心配置说明：
 * - CORS：启用跨域，允许携带认证信息（cookie/authorization）
 * - Global Prefix：所有 API 路由统一加 /api 前缀
 * - ValidationPipe：全局参数校验，自动转换类型、过滤非法参数
 */
import 'reflect-metadata'; // 启用装饰器元数据反射，NestJS 依赖注入必需
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

// 修复 Windows/macOS 终端中文输出乱码问题
process.env.NODE_NO_WARNINGS = '1';

async function bootstrap() {
  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((item) => item.trim()).filter(Boolean)
    : [];

  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: corsOrigins.length > 0 ? corsOrigins : true,  // 生产环境可通过 CORS_ORIGINS 限制来源
      credentials: true,  // 允许携带认证信息（Cookie/Authorization）
    },
  });

  // 全局 API 前缀 - 所有路由变为 /api/xxx
  app.setGlobalPrefix('api');

  // 全局参数校验管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,        // 自动过滤未在 DTO 中定义的属性
      transform: true,        // 自动转换类型（如字符串转数字）
      forbidNonWhitelisted: true,  // 非法属性直接报错
    }),
  );

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 API server listening on http://localhost:${port}/api`);
}

bootstrap();

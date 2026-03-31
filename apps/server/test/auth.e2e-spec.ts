/**
 * Auth 模块 E2E 测试
 *
 * 测试范围：
 * - 用户登录（成功/失败）
 * - Token 刷新
 * - 用户登出
 * - 获取当前用户信息
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    // 创建测试模块
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    prisma = app.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('/api/auth/login (POST)', () => {
    it('应该成功登录并返回 token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          account: 'admin',
          password: 'Admin123456!',
          clientType: 'admin',
        })
        .expect(201);

      console.log('Login response:', JSON.stringify(response.body, null, 2));
      expect(response.body.data).toBeDefined();
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.tokens).toBeDefined();
      expect(response.body.data.tokens.accessToken).toBeDefined();
      expect(response.body.data.tokens.refreshToken).toBeDefined();

      accessToken = response.body.data.tokens.accessToken;
      refreshToken = response.body.data.tokens.refreshToken;
    });

    it('应该拒绝错误的密码', async () => {
      return request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          account: 'admin',
          password: 'wrongpassword',
          clientType: 'admin',
        })
        .expect(401);
    });

    it('应该拒绝不存在的账号', async () => {
      return request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          account: 'nonexistent',
          password: 'somepassword',
          clientType: 'admin',
        })
        .expect(401);
    });

    it('应该拒绝缺少必填字段的请求', async () => {
      return request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          account: 'admin',
          // 缺少 password 和 clientType
        })
        .expect(400);
    });
  });

  describe('/api/auth/refresh (POST)', () => {
    it('应该成功刷新 token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(201);

      expect(response.body.data.tokens.accessToken).toBeDefined();
      expect(response.body.data.tokens.refreshToken).toBeDefined();
    });

    it('应该拒绝无效的 refresh token', async () => {
      return request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);
    });
  });

  describe('/api/auth/me (GET)', () => {
    it('应该返回当前用户信息', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.data.username).toBe('admin');
      expect(response.body.data.role).toBe('admin');
    });

    it('应该拒绝未授权的请求', async () => {
      return request(app.getHttpServer())
        .get('/api/auth/me')
        .expect(401);
    });
  });

  describe('/api/auth/logout (POST)', () => {
    it('应该成功登出', async () => {
      // 先登录获取新 token
      const loginResponse = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          account: 'admin',
          password: 'Admin123456!',
          clientType: 'admin',
        });

      const token = loginResponse.body.data.tokens.accessToken;

      return request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
    });
  });
});

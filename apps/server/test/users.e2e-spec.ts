/**
 * Users 模块 E2E 测试
 *
 * 测试范围：
 * - 获取用户列表
 * - 创建用户
 * - 更新用户
 * - 更新用户状态
 * - 重置密码
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('UsersController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let createdUserId: string;

  beforeAll(async () => {
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

    // 登录获取 admin token
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        account: 'admin',
        password: 'Admin123456!',
        clientType: 'admin',
      });

    accessToken = loginResponse.body.data.tokens.accessToken;
  });

  afterAll(async () => {
    // 清理测试数据
    if (createdUserId) {
      await prisma.user.delete({ where: { id: createdUserId } }).catch(() => {});
    }
    await prisma.$disconnect();
    await app.close();
  });

  describe('/api/admin/users (GET)', () => {
    it('应该返回用户列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.data.items).toBeDefined();
      expect(response.body.data.meta).toBeDefined();
      expect(Array.isArray(response.body.data.items)).toBe(true);
    });

    it('应该支持搜索', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/admin/users?q=admin')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data.items).toBeDefined();
    });

    it('应该支持分页', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/admin/users?page=1&pageSize=5')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data.meta.page).toBe(1);
      expect(response.body.data.meta.pageSize).toBe(5);
    });

    it('应该拒绝未授权的请求', async () => {
      return request(app.getHttpServer())
        .get('/api/admin/users')
        .expect(401);
    });
  });

  describe('/api/admin/users (POST)', () => {
    it('应该创建新用户', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          username: `testuser_${Date.now()}`,
          phone: `139${Date.now().toString().slice(-8)}`,
        })
        .expect(201);

      expect(response.body.data).toBeDefined();
      expect(response.body.data.username).toBeDefined();
      expect(response.body.data.role).toBe('user');
      expect(response.body.data.status).toBe('active');

      createdUserId = response.body.data.id;
    });

    it('应该拒绝缺少必填字段的请求', async () => {
      return request(app.getHttpServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          username: 'test',
          // 缺少 phone
        })
        .expect(400);
    });

    it('应该拒绝重复的用户名', async () => {
      // 先创建一个用户
      const uniqueName = `testuser_unique_${Date.now()}`;
      const uniquePhone = `139${Date.now().toString().slice(-8)}`;

      await request(app.getHttpServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          username: uniqueName,
          phone: uniquePhone,
        });

      // 尝试创建同名用户
      return request(app.getHttpServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          username: uniqueName,
          phone: '13912345678',
        })
        .expect(409);
    });
  });

  describe('/api/admin/users/:id (PATCH)', () => {
    it('应该更新用户信息', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/admin/users/${createdUserId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          departmentId: null,
        })
        .expect(200);

      expect(response.body.data.id).toBe(createdUserId);
    });
  });

  describe('/api/admin/users/:id/status (PATCH)', () => {
    it('应该更新用户状态为 disabled', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/admin/users/${createdUserId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          status: 'disabled',
        })
        .expect(200);

      expect(response.body.data.status).toBe('disabled');
    });

    it('应该更新用户状态为 active', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/admin/users/${createdUserId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          status: 'active',
        })
        .expect(200);

      expect(response.body.data.status).toBe('active');
    });
  });

  describe('/api/admin/users/:id/reset-password (POST)', () => {
    it('应该重置用户密码', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/admin/users/${createdUserId}/reset-password`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      expect(response.body.data.success).toBe(true);
      expect(response.body.data.defaultPassword).toBeDefined();
    });
  });
});

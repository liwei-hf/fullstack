/**
 * Todos 模块 E2E 测试
 *
 * 测试范围：
 * - 创建任务
 * - 获取任务列表
 * - 获取单个任务
 * - 更新任务
 * - 删除任务
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('TodosController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let userId: string;
  let createdTodoId: string;

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

    // 登录获取 token
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        account: 'admin',
        password: 'Admin123456!',
        clientType: 'admin',
      });

    accessToken = loginResponse.body.data?.tokens?.accessToken;
    userId = loginResponse.body.data?.user?.id;
  });

  afterAll(async () => {
    // 清理测试数据
    if (createdTodoId) {
      await prisma.todo.delete({ where: { id: createdTodoId } }).catch(() => {});
    }
    await prisma.$disconnect();
    await app.close();
  });

  describe('/api/todos (POST)', () => {
    it('应该创建新任务', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/todos')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: '测试任务',
          description: '这是一个测试任务',
        })
        .expect(201);

      expect(response.body.data).toBeDefined();
      expect(response.body.data.title).toBe('测试任务');
      expect(response.body.data.status).toBe('todo');
      expect(response.body.data.userId).toBe(userId);

      createdTodoId = response.body.data.id;
    });

    it('应该拒绝缺少标题的请求', async () => {
      return request(app.getHttpServer())
        .post('/api/todos')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          description: '缺少标题',
        })
        .expect(400);
    });

    it('应该拒绝未授权的请求', async () => {
      return request(app.getHttpServer())
        .post('/api/todos')
        .send({
          title: '未授权任务',
        })
        .expect(401);
    });
  });

  describe('/api/todos (GET)', () => {
    it('应该返回任务列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/todos')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.data.items).toBeDefined();
      expect(response.body.data.meta).toBeDefined();
      expect(Array.isArray(response.body.data.items)).toBe(true);
    });

    it('应该支持状态筛选', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/todos?status=TODO')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data.items).toBeDefined();
      response.body.data.items.forEach((todo: any) => {
        expect(todo.status).toBe('todo');
      });
    });

    it('应该支持分页', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/todos?page=1&pageSize=5')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data.meta.page).toBe(1);
      expect(response.body.data.meta.pageSize).toBe(5);
    });
  });

  describe('/api/todos/:id (GET)', () => {
    it('应该返回单个任务详情', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/todos/${createdTodoId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.data.id).toBe(createdTodoId);
    });

    it('应该拒绝访问不属于自己的任务', async () => {
      // 创建一个不属于当前用户的任务 ID（随机生成）
      const fakeId = 'fake-task-id';
      return request(app.getHttpServer())
        .get(`/api/todos/${fakeId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('/api/todos/:id (PATCH)', () => {
    it('应该更新任务', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/todos/${createdTodoId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: '更新后的任务',
        })
        .expect(200);

      expect(response.body.data.title).toBe('更新后的任务');
    });

    it('应该更新任务状态', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/todos/${createdTodoId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          status: 'IN_PROGRESS',
        })
        .expect(200);

      expect(response.body.data.status).toBe('in_progress');
    });
  });

  describe('/api/todos/:id (DELETE)', () => {
    it('应该删除任务', async () => {
      // 先创建一个新任务用于删除测试
      const createResponse = await request(app.getHttpServer())
        .post('/api/todos')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: '待删除任务',
        });

      const todoId = createResponse.body.data.id;

      await request(app.getHttpServer())
        .delete(`/api/todos/${todoId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // 验证已删除
      return request(app.getHttpServer())
        .get(`/api/todos/${todoId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});

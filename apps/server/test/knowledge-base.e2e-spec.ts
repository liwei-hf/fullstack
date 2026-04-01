/**
 * Knowledge Base / RAG E2E 测试
 *
 * 测试目标：
 * - 覆盖知识库创建、文档上传、后台处理、问答、删除这条主链路
 * - 外部依赖（MinIO / embedding / rerank / chat model）统一 mock，保证测试稳定
 * - 重点验证“业务编排是否正确”，而不是第三方服务是否可用
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import JSZip from 'jszip';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { KnowledgeBaseModelService } from '../src/knowledge-base/knowledge-base-model.service';
import { KnowledgeBaseParserService } from '../src/knowledge-base/knowledge-base-parser.service';
import { KnowledgeBaseRetrievalService } from '../src/knowledge-base/knowledge-base-retrieval.service';
import { KnowledgeBaseStorageService } from '../src/knowledge-base/knowledge-base-storage.service';
import { RedisService } from '../src/redis/redis.service';

describe('KnowledgeBase / RAG (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  const createdKnowledgeBaseIds: string[] = [];
  const redisJsonStore = new Map<string, unknown>();
  const storageObjectStore = new Map<string, Buffer>();

  const mockStorageService = {
    onModuleInit: jest.fn(),
    uploadObject: jest.fn(async (objectKey: string, buffer: Buffer) => {
      storageObjectStore.set(objectKey, buffer);
    }),
    getObjectBuffer: jest.fn(async (objectKey: string) => {
      return storageObjectStore.get(objectKey) ?? Buffer.from('mock file');
    }),
    removeObject: jest.fn().mockResolvedValue(undefined),
  };

  const mockParserService = {
    parseDocument: jest.fn().mockResolvedValue({
      fileType: 'MD',
      content: [
        '# 第一章 员工守则',
        '',
        '员工需要遵守考勤制度，并按时完成每日工作任务。',
        '',
        '# 第二章 请假流程',
        '',
        '请假需要提前申请，并经过直属负责人审批。',
      ].join('\n'),
    }),
  };

  const mockRetrievalService = {
    ensureVectorSupport: jest.fn().mockResolvedValue(undefined),
    embedChunks: jest.fn().mockResolvedValue(undefined),
    retrieveContext: jest.fn(),
  };

  const mockModelService = {
    getChatModelInfo: jest.fn().mockReturnValue({
      provider: 'zhipu',
      model: 'glm-test',
    }),
    createChatModel: jest.fn().mockImplementation(() => ({
      stream: async function* () {
        yield { content: '结论：这是一条测试回答。' };
        yield { content: '依据来自员工手册中的请假流程说明。' };
      },
    })),
  };

  const mockRedisService = {
    isEnabled: jest.fn().mockReturnValue(false),
    getJson: jest.fn(async (key: string) => (redisJsonStore.get(key) as unknown) ?? null),
    setJson: jest.fn(async (key: string, value: unknown) => {
      redisJsonStore.set(key, value);
    }),
    deleteKeys: jest.fn(async (...keys: string[]) => {
      keys.forEach((key) => redisJsonStore.delete(key));
    }),
    createBullConnection: jest.fn().mockReturnValue(null),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(KnowledgeBaseStorageService)
      .useValue(mockStorageService)
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .overrideProvider(KnowledgeBaseParserService)
      .useValue(mockParserService)
      .overrideProvider(KnowledgeBaseRetrievalService)
      .useValue(mockRetrievalService)
      .overrideProvider(KnowledgeBaseModelService)
      .useValue(mockModelService)
      .compile();

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

    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        account: 'admin',
        password: 'Admin123456!',
        clientType: 'admin',
      })
      .expect(201);

    accessToken = loginResponse.body.data.tokens.accessToken;
  });

  afterAll(async () => {
    if (createdKnowledgeBaseIds.length > 0) {
      await prisma.documentChunk.deleteMany({
        where: {
          document: {
            knowledgeBaseId: {
              in: createdKnowledgeBaseIds,
            },
          },
        },
      });

      await prisma.document.deleteMany({
        where: {
          knowledgeBaseId: {
            in: createdKnowledgeBaseIds,
          },
        },
      });

      await prisma.qaLog.deleteMany({
        where: {
          knowledgeBaseId: {
            in: createdKnowledgeBaseIds,
          },
        },
      });

      await prisma.knowledgeBaseImportJob.deleteMany({
        where: {
          knowledgeBaseId: {
            in: createdKnowledgeBaseIds,
          },
        },
      });

      await prisma.knowledgeBase.deleteMany({
        where: {
          id: {
            in: createdKnowledgeBaseIds,
          },
        },
      });
    }

    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(() => {
    redisJsonStore.clear();
    storageObjectStore.clear();
    jest.clearAllMocks();
  });

  it('应该上传文档并完成后台处理，最终变为 READY', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/api/knowledge-base')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: `e2e-rag-upload-${Date.now()}`,
        description: '用于测试文档上传与处理链路',
      })
      .expect(201);

    const knowledgeBaseId = createResponse.body.data.id as string;
    createdKnowledgeBaseIds.push(knowledgeBaseId);

    const uploadResponse = await request(app.getHttpServer())
      .post(`/api/knowledge-base/${knowledgeBaseId}/documents/upload`)
      .set('Authorization', `Bearer ${accessToken}`)
      .field('chunkStrategy', 'paragraph')
      .attach('file', Buffer.from('# 员工手册\n\n请假需要审批。'), {
        filename: '员工手册.md',
        contentType: 'text/markdown',
      })
      .expect(201);

    expect(uploadResponse.body.data.fileName).toBe('员工手册.md');
    expect(uploadResponse.body.data.chunkStrategy).toBe('paragraph');

    const documentId = uploadResponse.body.data.id as string;
    const processedDocument = await waitForDocumentStatus(prisma, documentId, 'READY');

    expect(processedDocument.chunkCount).toBeGreaterThan(0);
    expect(processedDocument.characterCount).toBeGreaterThan(0);
    expect(mockStorageService.uploadObject).toHaveBeenCalled();
    expect(mockParserService.parseDocument).toHaveBeenCalled();
    expect(mockRetrievalService.embedChunks).toHaveBeenCalled();

    const listResponse = await request(app.getHttpServer())
      .get(`/api/knowledge-base/${knowledgeBaseId}/documents`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(listResponse.body.data[0].status).toBe('READY');
    expect(listResponse.body.data[0].chunkStrategy).toBe('paragraph');
  });

  it('应该删除空知识库并一并清理 qaLog', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/api/knowledge-base')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: `e2e-rag-delete-${Date.now()}`,
        description: '用于测试删除空知识库时清理问答日志',
      })
      .expect(201);

    const knowledgeBaseId = createResponse.body.data.id as string;
    createdKnowledgeBaseIds.push(knowledgeBaseId);

    const admin = await prisma.user.findFirstOrThrow({
      where: { username: 'admin' },
      select: { id: true },
    });

    await prisma.qaLog.createMany({
      data: [
        {
          knowledgeBaseId,
          userId: admin.id,
          question: '测试问题 1',
          answer: '测试回答 1',
          sourceCount: 1,
        },
        {
          knowledgeBaseId,
          userId: admin.id,
          question: '测试问题 2',
          answer: '测试回答 2',
          sourceCount: 2,
        },
      ],
    });

    await request(app.getHttpServer())
      .delete(`/api/knowledge-base/${knowledgeBaseId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const [knowledgeBase, qaLogCount] = await Promise.all([
      prisma.knowledgeBase.findUnique({ where: { id: knowledgeBaseId } }),
      prisma.qaLog.count({ where: { knowledgeBaseId } }),
    ]);

    expect(knowledgeBase).toBeNull();
    expect(qaLogCount).toBe(0);

    const index = createdKnowledgeBaseIds.indexOf(knowledgeBaseId);
    if (index >= 0) {
      createdKnowledgeBaseIds.splice(index, 1);
    }
  });

  it('应该导入 ZIP 中的文档文件，并忽略黑名单目录里的 Markdown', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/api/knowledge-base')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: `e2e-rag-zip-${Date.now()}`,
        description: '用于测试 ZIP 批量导入链路',
      })
      .expect(201);

    const knowledgeBaseId = createResponse.body.data.id as string;
    createdKnowledgeBaseIds.push(knowledgeBaseId);

    const zip = new JSZip();
    zip.file('docs/guide.md', '# Guide\n\n这是正文文档。');
    zip.file('README.md', '# Readme\n\n这是首页文档。');
    zip.file('assets/logo.md', '# Logo\n\n这是一份应被忽略的文档。');
    zip.file('.claude/notes.md', '# Notes\n\n这是一份应被忽略的文档。');
    zip.file('src/index.ts', 'export const answer = 42;');

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    const importResponse = await request(app.getHttpServer())
      .post(`/api/knowledge-base/${knowledgeBaseId}/import-zip`)
      .set('Authorization', `Bearer ${accessToken}`)
      .field('chunkStrategy', 'heading')
      .attach('file', zipBuffer, {
        filename: 'docs.zip',
        contentType: 'application/zip',
      })
      .expect(201);

    expect(importResponse.body.data.fileName).toBe('docs.zip');
    expect(importResponse.body.data.chunkStrategy).toBe('heading');

    const importJobId = importResponse.body.data.id as string;
    const importJob = await waitForImportJobStatus(prisma, importJobId, 'COMPLETED');
    expect(importJob.totalFileCount).toBe(2);
    expect(importJob.successFileCount).toBe(2);
    expect(importJob.failedFileCount).toBe(0);

    const documents = await prisma.document.findMany({
      where: { knowledgeBaseId },
      orderBy: { fileName: 'asc' },
    });

    expect(documents).toHaveLength(2);
    expect(documents.map((item) => item.fileName)).toEqual(['docs/guide.md', 'README.md']);
    expect(documents.every((item) => item.importJobId === importJobId)).toBe(true);
    expect(documents.every((item) => item.status === 'READY')).toBe(true);
  });

  it('应该为知识库列表写入缓存，并在后续读取时复用缓存结构', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/api/knowledge-base')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: `e2e-rag-cache-${Date.now()}`,
        description: '用于测试知识库缓存链路',
      })
      .expect(201);

    createdKnowledgeBaseIds.push(createResponse.body.data.id as string);

    const firstResponse = await request(app.getHttpServer())
      .get('/api/knowledge-base')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const secondResponse = await request(app.getHttpServer())
      .get('/api/knowledge-base')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(firstResponse.body.data.length).toBeGreaterThan(0);
    expect(secondResponse.body.data.length).toBeGreaterThan(0);
    expect(mockRedisService.getJson).toHaveBeenCalledWith('knowledge-base:list');
    expect(mockRedisService.setJson).toHaveBeenCalledWith(
      'knowledge-base:list',
      expect.any(Array),
      expect.any(Number),
    );
  });

  it('应该返回知识库问答的流式事件，并写入 qaLog', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/api/knowledge-base')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: `e2e-rag-chat-${Date.now()}`,
        description: '用于测试知识库问答 SSE 链路',
      })
      .expect(201);

    const knowledgeBaseId = createResponse.body.data.id as string;
    createdKnowledgeBaseIds.push(knowledgeBaseId);

    const admin = await prisma.user.findFirstOrThrow({
      where: { username: 'admin' },
      select: { id: true },
    });

    await prisma.document.create({
      data: {
        knowledgeBaseId,
        uploadedById: admin.id,
        fileName: '员工手册.md',
        fileType: 'MD',
        objectKey: `${knowledgeBaseId}/mock.md`,
        status: 'READY',
        chunkStrategy: 'FIXED',
        chunkCount: 2,
        characterCount: 120,
      },
    });

    mockRetrievalService.retrieveContext.mockResolvedValueOnce({
      candidates: [
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          documentName: '员工手册.md',
          sequence: 1,
          content: '请假需要提前申请，并经过直属负责人审批。',
          excerpt: '请假需要提前申请，并经过直属负责人审批。',
          score: 0.92,
        },
      ],
      sources: [
        {
          documentId: 'doc-1',
          documentName: '员工手册.md',
          chunkId: 'chunk-1',
          snippet: '请假需要提前申请，并经过直属负责人审批。',
        },
      ],
      contextText: '片段 1\n文档：员工手册.md\n内容：请假需要提前申请，并经过直属负责人审批。',
      metrics: {
        vectorSupportDurationMs: 1,
        queryEmbeddingDurationMs: 2,
        vectorQueryDurationMs: 3,
        rerankDurationMs: 4,
        contextBuildDurationMs: 1,
        totalRetrievalDurationMs: 10,
        initialCandidateCount: 1,
        finalCandidateCount: 1,
        finalContextChars: 40,
        rerankApplied: true,
      },
    });

    const requestId = `e2e-rag-request-${Date.now()}`;
    const response = await request(app.getHttpServer())
      .post(`/api/knowledge-base/${knowledgeBaseId}/chat/stream`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Request-Id', requestId)
      .send({ question: '请总结请假流程' })
      .expect(201);

    expect(response.headers['x-request-id']).toBe(requestId);
    expect(response.text).toContain('event: meta');
    expect(response.text).toContain(`"requestId":"${requestId}"`);
    expect(response.text).toContain('event: sources');
    expect(response.text).toContain('event: answer_delta');
    expect(response.text).toContain('event: done');
    expect(response.text).toContain('员工手册.md');
    expect(response.text).toContain('测试回答');

    const qaLog = await prisma.qaLog.findFirst({
      where: {
        knowledgeBaseId,
        question: '请总结请假流程',
      },
    });

    expect(qaLog).toBeTruthy();
    expect(qaLog?.sourceCount).toBe(1);
  });

  it('应该在同一个 sessionId 下保留短期上下文，支持连续追问', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/api/knowledge-base')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: `e2e-rag-memory-${Date.now()}`,
        description: '用于测试知识库连续对话短期记忆',
      })
      .expect(201);

    const knowledgeBaseId = createResponse.body.data.id as string;
    createdKnowledgeBaseIds.push(knowledgeBaseId);

    const admin = await prisma.user.findFirstOrThrow({
      where: { username: 'admin' },
      select: { id: true },
    });

    await prisma.document.create({
      data: {
        knowledgeBaseId,
        uploadedById: admin.id,
        fileName: '员工手册.md',
        fileType: 'MD',
        objectKey: `${knowledgeBaseId}/memory.md`,
        status: 'READY',
        chunkStrategy: 'PARAGRAPH',
        chunkCount: 2,
        characterCount: 180,
      },
    });

    mockRetrievalService.retrieveContext
      .mockResolvedValueOnce({
        candidates: [
          {
            chunkId: 'chunk-memory-1',
            documentId: 'doc-memory-1',
            documentName: '员工手册.md',
            sequence: 1,
            content: '请假需要提前申请，并经过直属负责人审批。',
            excerpt: '请假需要提前申请，并经过直属负责人审批。',
            score: 0.9,
          },
        ],
        sources: [
          {
            documentId: 'doc-memory-1',
            documentName: '员工手册.md',
            chunkId: 'chunk-memory-1',
            snippet: '请假需要提前申请，并经过直属负责人审批。',
          },
        ],
        contextText: '片段 1\n文档：员工手册.md\n内容：请假需要提前申请，并经过直属负责人审批。',
        metrics: {
          vectorSupportDurationMs: 1,
          queryEmbeddingDurationMs: 2,
          vectorQueryDurationMs: 3,
          rerankDurationMs: 4,
          contextBuildDurationMs: 1,
          totalRetrievalDurationMs: 10,
          initialCandidateCount: 1,
          finalCandidateCount: 1,
          finalContextChars: 40,
          rerankApplied: true,
        },
      })
      .mockResolvedValueOnce({
        candidates: [
          {
            chunkId: 'chunk-memory-2',
            documentId: 'doc-memory-1',
            documentName: '员工手册.md',
            sequence: 2,
            content: '病假需补充医院证明。',
            excerpt: '病假需补充医院证明。',
            score: 0.88,
          },
        ],
        sources: [
          {
            documentId: 'doc-memory-1',
            documentName: '员工手册.md',
            chunkId: 'chunk-memory-2',
            snippet: '病假需补充医院证明。',
          },
        ],
        contextText: '片段 2\n文档：员工手册.md\n内容：病假需补充医院证明。',
        metrics: {
          vectorSupportDurationMs: 1,
          queryEmbeddingDurationMs: 2,
          vectorQueryDurationMs: 3,
          rerankDurationMs: 4,
          contextBuildDurationMs: 1,
          totalRetrievalDurationMs: 10,
          initialCandidateCount: 1,
          finalCandidateCount: 1,
          finalContextChars: 24,
          rerankApplied: true,
        },
      });

    const sessionId = `e2e-session-${Date.now()}`;

    const firstResponse = await request(app.getHttpServer())
      .post(`/api/knowledge-base/${knowledgeBaseId}/chat/stream`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ question: '请说明请假流程', sessionId })
      .expect(201);

    const secondResponse = await request(app.getHttpServer())
      .post(`/api/knowledge-base/${knowledgeBaseId}/chat/stream`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ question: '那病假呢？', sessionId })
      .expect(201);

    expect(firstResponse.text).toContain(`"sessionId":"${sessionId}"`);
    expect(secondResponse.text).toContain(`"sessionId":"${sessionId}"`);
    expect(mockRetrievalService.retrieveContext).toHaveBeenNthCalledWith(
      2,
      knowledgeBaseId,
      expect.stringContaining('请说明请假流程'),
      expect.any(String),
    );
    expect(mockRetrievalService.retrieveContext).toHaveBeenNthCalledWith(
      2,
      knowledgeBaseId,
      expect.stringContaining('测试回答'),
      expect.any(String),
    );
    expect(mockRetrievalService.retrieveContext).toHaveBeenNthCalledWith(
      2,
      knowledgeBaseId,
      expect.stringContaining('那病假呢？'),
      expect.any(String),
    );
  });
});

async function waitForDocumentStatus(
  prisma: PrismaService,
  documentId: string,
  expectedStatus: 'READY' | 'FAILED',
  timeoutMs = 3000,
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (document?.status === expectedStatus) {
      return document;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`等待文档 ${documentId} 进入 ${expectedStatus} 超时`);
}

async function waitForImportJobStatus(
  prisma: PrismaService,
  importJobId: string,
  expectedStatus: 'COMPLETED' | 'FAILED' | 'PARTIAL_SUCCESS',
  timeoutMs = 3000,
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const importJob = await prisma.knowledgeBaseImportJob.findUnique({
      where: { id: importJobId },
    });

    if (importJob?.status === expectedStatus) {
      return importJob;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`等待导入任务 ${importJobId} 进入 ${expectedStatus} 超时`);
}

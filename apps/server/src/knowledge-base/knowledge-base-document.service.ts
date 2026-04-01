import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { KnowledgeBaseChunkStrategy, KnowledgeBaseDocumentItem } from '@fullstack/shared';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { RAG_UPLOAD_MAX_FILE_SIZE } from './knowledge-base.constants';
import {
  DEFAULT_CHUNK_STRATEGY,
  fromPersistenceChunkStrategy,
  toPersistenceChunkStrategy,
} from './knowledge-base-chunk-strategy.util';
import { normalizeDocumentFileName } from './knowledge-base-file-name.util';
import { KnowledgeBaseIngestionService } from './knowledge-base-ingestion.service';
import { KnowledgeBaseCacheService } from './knowledge-base-cache.service';
import { KnowledgeBaseQueueService } from './knowledge-base-queue.service';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KnowledgeBaseStorageService } from './knowledge-base-storage.service';
import type { AuthenticatedRequestUser } from './knowledge-base.types';

/**
 * 文档管理服务
 *
 * 负责上传文档、写入文档元数据、触发后台处理，以及删除文档时的状态流转。
 */
@Injectable()
export class KnowledgeBaseDocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly storageService: KnowledgeBaseStorageService,
    private readonly cacheService: KnowledgeBaseCacheService,
    private readonly queueService: KnowledgeBaseQueueService,
    private readonly ingestionService: KnowledgeBaseIngestionService,
  ) {}

  /**
   * 上传文档
   *
   * 这里故意把“上传成功”和“处理完成”拆成两个阶段：
   * - 当前接口快速返回，提升上传体验
   * - 解析、切片、向量化在后台异步执行，避免接口长时间阻塞
   */
  async uploadDocument(
    knowledgeBaseId: string,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    } | undefined,
    user: AuthenticatedRequestUser,
    chunkStrategy: KnowledgeBaseChunkStrategy = DEFAULT_CHUNK_STRATEGY,
  ): Promise<KnowledgeBaseDocumentItem> {
    this.ensureAdmin(user);
    await this.knowledgeBaseService.ensureKnowledgeBaseExists(knowledgeBaseId);

    if (!file) {
      throw new BadRequestException('请选择要上传的文件');
    }

    if (file.size > RAG_UPLOAD_MAX_FILE_SIZE) {
      throw new BadRequestException('单个文件大小不能超过 20MB');
    }

    // MinIO 中存储的是 objectKey，原始文件名单独保存在数据库里，方便后续展示和纠错。
    const extension = extname(file.originalname).toLowerCase();
    const normalizedFileName = normalizeDocumentFileName(file.originalname);
    const objectKey = `${knowledgeBaseId}/${randomUUID()}${extension}`;
    await this.storageService.uploadObject(objectKey, file.buffer, file.mimetype);

    const document = await this.prisma.document.create({
      data: {
        knowledgeBaseId,
        uploadedById: user.sub,
        fileName: normalizedFileName,
        fileType: file.mimetype || extension.replace('.', '').toUpperCase(),
        chunkStrategy: toPersistenceChunkStrategy(chunkStrategy),
        objectKey,
        status: 'UPLOADED',
      },
      include: {
        uploadedBy: true,
      },
    });

    await this.cacheService.invalidateKnowledgeBase(knowledgeBaseId);

    // 优先把处理任务投递到 BullMQ。
    // 如果当前环境还没启 Redis，则自动回退到应用内异步执行，保证开发阶段也能继续联调。
    const queued = await this.queueService.enqueueDocumentIngestion(document.id);
    if (!queued) {
      void this.ingestionService.processDocument(document.id);
    }

    return {
      id: document.id,
      knowledgeBaseId: document.knowledgeBaseId,
      fileName: normalizeDocumentFileName(document.fileName),
      fileType: document.fileType,
      chunkStrategy: fromPersistenceChunkStrategy(document.chunkStrategy),
      objectKey: document.objectKey,
      status: document.status,
      chunkCount: document.chunkCount,
      characterCount: document.characterCount,
      failureReason: document.failureReason,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
      uploadedBy: {
        id: document.uploadedBy.id,
        username: document.uploadedBy.username,
      },
    };
  }

  /**
   * 删除文档
   *
   * 先把状态改为 DELETING，再删对象存储和数据库记录。
   * 这样即使中途失败，前端和检索层也知道这份文档已经不应该继续参与问答。
   */
  async deleteDocument(documentId: string, user: AuthenticatedRequestUser) {
    this.ensureAdmin(user);

    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException('文档不存在');
    }

    await this.prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'DELETING',
      },
    });

    try {
      await this.storageService.removeObject(document.objectKey);
      await this.prisma.$transaction(async (tx) => {
        await tx.document.delete({
          where: { id: documentId },
        });
      });
      await this.cacheService.invalidateKnowledgeBase(document.knowledgeBaseId);

      return { success: true };
    } catch (error) {
      await this.prisma.document.update({
        where: { id: documentId },
        data: {
          status: 'DELETE_FAILED',
          failureReason: error instanceof Error ? error.message : '文档删除失败',
        },
      });
      throw error;
    }
  }

  // 当前版本只有管理员可以维护知识库文档，普通用户只负责问答。
  private ensureAdmin(user: AuthenticatedRequestUser) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('只有管理员可以管理知识库文档');
    }
  }
}

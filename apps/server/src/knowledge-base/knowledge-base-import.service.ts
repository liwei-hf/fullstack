import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  KnowledgeBaseChunkStrategy,
  KnowledgeBaseImportJobItem,
} from '@fullstack/shared';
import JSZip from 'jszip';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import {
  RAG_UPLOAD_MAX_FILE_SIZE,
  SUPPORTED_ZIP_EXTENSION,
} from './knowledge-base.constants';
import {
  DEFAULT_CHUNK_STRATEGY,
  fromPersistenceChunkStrategy,
  toPersistenceChunkStrategy,
} from './knowledge-base-chunk-strategy.util';
import { normalizeDocumentFileName } from './knowledge-base-file-name.util';
import { KnowledgeBaseCacheService } from './knowledge-base-cache.service';
import { KnowledgeBaseIngestionService } from './knowledge-base-ingestion.service';
import { KnowledgeBaseQueueService } from './knowledge-base-queue.service';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KnowledgeBaseStorageService } from './knowledge-base-storage.service';
import {
  normalizeZipEntryPath,
  resolveMimeTypeByPath,
  shouldImportZipEntry,
} from './knowledge-base-zip-import.util';
import type { AuthenticatedRequestUser } from './knowledge-base.types';

/**
 * ZIP 批量导入服务
 *
 * 这层把“ZIP 原包上传”和“后台逐文件导入”收口在一起，
 * 避免把压缩包解压逻辑塞进原来的单文件上传 service。
 */
@Injectable()
export class KnowledgeBaseImportService {
  private readonly logger = new Logger(KnowledgeBaseImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly storageService: KnowledgeBaseStorageService,
    private readonly cacheService: KnowledgeBaseCacheService,
    private readonly queueService: KnowledgeBaseQueueService,
    private readonly ingestionService: KnowledgeBaseIngestionService,
  ) {}

  /**
   * 上传 ZIP 原包并创建一条导入任务。
   *
   * 这里不在请求里同步解压，避免大压缩包阻塞接口；
   * 真正的逐文件导入交给 BullMQ worker 处理。
   */
  async uploadZip(
    knowledgeBaseId: string,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    } | undefined,
    user: AuthenticatedRequestUser,
    chunkStrategy: KnowledgeBaseChunkStrategy = DEFAULT_CHUNK_STRATEGY,
  ): Promise<KnowledgeBaseImportJobItem> {
    this.ensureAdmin(user);
    await this.knowledgeBaseService.ensureKnowledgeBaseExists(knowledgeBaseId);

    if (!file) {
      throw new BadRequestException('请选择要上传的 ZIP 文件');
    }

    if (file.size > RAG_UPLOAD_MAX_FILE_SIZE) {
      throw new BadRequestException('单个 ZIP 文件大小不能超过 20MB');
    }

    const extension = extname(file.originalname).toLowerCase();
    if (extension !== SUPPORTED_ZIP_EXTENSION) {
      throw new BadRequestException('仅支持上传 ZIP 压缩包');
    }

    const normalizedFileName = normalizeDocumentFileName(file.originalname);
    const objectKey = `${knowledgeBaseId}/imports/${randomUUID()}${SUPPORTED_ZIP_EXTENSION}`;
    await this.storageService.uploadObject(objectKey, file.buffer, file.mimetype || 'application/zip');

    const importJob = await this.prisma.knowledgeBaseImportJob.create({
      data: {
        knowledgeBaseId,
        uploadedById: user.sub,
        fileName: normalizedFileName,
        objectKey,
        chunkStrategy: toPersistenceChunkStrategy(chunkStrategy),
        status: 'UPLOADED',
      },
      include: {
        uploadedBy: true,
      },
    });

    const queued = await this.queueService.enqueueZipImport(importJob.id);
    if (!queued) {
      void this.processImportJob(importJob.id);
    }

    return this.toImportJobItem(importJob);
  }

  /**
   * 处理 ZIP 导入任务。
   *
   * 核心思路：
   * - 从 MinIO 拉 ZIP 原包
   * - 解压并筛出可导入的文档
   * - 每个文档创建一条 Document 记录
   * - 继续复用现有 processDocument() 完成切片和向量化
   */
  async processImportJob(
    importJobId: string,
    options?: {
      rethrowOnFailure?: boolean;
    },
  ) {
    let knowledgeBaseId: string | null = null;

    try {
      await this.prisma.knowledgeBaseImportJob.update({
        where: { id: importJobId },
        data: {
          status: 'PROCESSING',
          failureReason: null,
        },
      });

      const importJob = await this.prisma.knowledgeBaseImportJob.findUnique({
        where: { id: importJobId },
      });

      if (!importJob) {
        return;
      }
      knowledgeBaseId = importJob.knowledgeBaseId;

      const zipBuffer = await this.storageService.getObjectBuffer(importJob.objectKey);
      const zip = await JSZip.loadAsync(zipBuffer);
      const importableEntries = Object.values(zip.files)
        .filter((entry) => !entry.dir)
        .map((entry) => normalizeZipEntryPath(entry.name))
        .filter((entryPath): entryPath is string => Boolean(entryPath))
        .filter((entryPath) => shouldImportZipEntry(entryPath))
        .map((entryPath) => ({
          path: entryPath,
          entry: zip.file(entryPath) ?? zip.file(entryPath.replace(/\\/g, '/')),
        }))
        .filter(
          (
            item,
          ): item is {
            path: string;
            entry: JSZip.JSZipObject;
          } => Boolean(item.entry),
        );

      if (importableEntries.length === 0) {
        await this.prisma.knowledgeBaseImportJob.update({
          where: { id: importJobId },
          data: {
            status: 'FAILED',
            totalFileCount: 0,
            failedFileCount: 0,
            successFileCount: 0,
            failureReason: '压缩包中没有可导入的文档文件',
          },
        });
        return;
      }

      await this.prisma.knowledgeBaseImportJob.update({
        where: { id: importJobId },
        data: {
          totalFileCount: importableEntries.length,
        },
      });

      let successFileCount = 0;
      let failedFileCount = 0;
      let lastFailureReason: string | null = null;
      const chunkStrategy = fromPersistenceChunkStrategy(importJob.chunkStrategy);

      for (const item of importableEntries) {
        const objectKey = `${importJob.knowledgeBaseId}/${randomUUID()}${extname(item.path).toLowerCase()}`;
        const normalizedPath = normalizeDocumentFileName(item.path);

        const document = await this.prisma.document.create({
          data: {
            knowledgeBaseId: importJob.knowledgeBaseId,
            uploadedById: importJob.uploadedById,
            importJobId: importJob.id,
            fileName: normalizedPath,
            fileType: resolveMimeTypeByPath(item.path),
            chunkStrategy: importJob.chunkStrategy,
            objectKey,
            status: 'UPLOADED',
          },
        });

        try {
          const fileBuffer = await item.entry.async('nodebuffer');
          await this.storageService.uploadObject(
            objectKey,
            fileBuffer,
            resolveMimeTypeByPath(item.path),
          );

          await this.ingestionService.processDocument(document.id, {
            rethrowOnFailure: true,
          });

          successFileCount += 1;
        } catch (error) {
          failedFileCount += 1;
          lastFailureReason = error instanceof Error ? error.message : 'ZIP 导入失败';

          this.logger.warn(
            `ZIP 子文件导入失败(${normalizedPath}): ${lastFailureReason}`,
          );

          await this.prisma.document.updateMany({
            where: { id: document.id },
            data: {
              status: 'FAILED',
              failureReason: lastFailureReason,
              chunkStrategy: toPersistenceChunkStrategy(chunkStrategy),
            },
          });
        }
      }

      const status =
        failedFileCount === 0
          ? 'COMPLETED'
          : successFileCount > 0
            ? 'PARTIAL_SUCCESS'
            : 'FAILED';

      await this.prisma.knowledgeBaseImportJob.update({
        where: { id: importJobId },
        data: {
          status,
          successFileCount,
          failedFileCount,
          failureReason: status === 'FAILED' ? lastFailureReason : null,
        },
      });

      await this.cacheService.invalidateKnowledgeBase(importJob.knowledgeBaseId);
    } catch (error) {
      this.logger.error(
        `ZIP 导入任务失败: ${error instanceof Error ? error.message : String(error)}`,
      );

      await this.prisma.knowledgeBaseImportJob.updateMany({
        where: { id: importJobId },
        data: {
          status: 'FAILED',
          failureReason: error instanceof Error ? error.message : 'ZIP 导入失败',
        },
      });

      if (knowledgeBaseId) {
        await this.cacheService.invalidateKnowledgeBase(knowledgeBaseId);
      }

      if (options?.rethrowOnFailure) {
        throw error;
      }
    }
  }

  async getImportJob(id: string) {
    const importJob = await this.prisma.knowledgeBaseImportJob.findUnique({
      where: { id },
      include: {
        uploadedBy: true,
      },
    });

    if (!importJob) {
      throw new NotFoundException('导入任务不存在');
    }

    return this.toImportJobItem(importJob);
  }

  private toImportJobItem(
    importJob: {
      id: string;
      knowledgeBaseId: string;
      fileName: string;
      objectKey: string;
      chunkStrategy: 'FIXED' | 'PARAGRAPH' | 'HEADING';
      status: 'UPLOADED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'PARTIAL_SUCCESS';
      totalFileCount: number;
      successFileCount: number;
      failedFileCount: number;
      failureReason: string | null;
      createdAt: Date;
      updatedAt: Date;
      uploadedBy: {
        id: string;
        username: string;
      };
    },
  ): KnowledgeBaseImportJobItem {
    return {
      id: importJob.id,
      knowledgeBaseId: importJob.knowledgeBaseId,
      fileName: normalizeDocumentFileName(importJob.fileName),
      objectKey: importJob.objectKey,
      chunkStrategy: fromPersistenceChunkStrategy(importJob.chunkStrategy),
      status: importJob.status,
      totalFileCount: importJob.totalFileCount,
      successFileCount: importJob.successFileCount,
      failedFileCount: importJob.failedFileCount,
      failureReason: importJob.failureReason,
      createdAt: importJob.createdAt.toISOString(),
      updatedAt: importJob.updatedAt.toISOString(),
      uploadedBy: {
        id: importJob.uploadedBy.id,
        username: importJob.uploadedBy.username,
      },
    };
  }

  private ensureAdmin(user: AuthenticatedRequestUser) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('只有管理员可以批量导入知识库文档');
    }
  }
}

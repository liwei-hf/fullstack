import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { KnowledgeBaseDocumentItem } from '@fullstack/shared';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { RAG_UPLOAD_MAX_FILE_SIZE } from './knowledge-base.constants';
import { KnowledgeBaseIngestionService } from './knowledge-base-ingestion.service';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KnowledgeBaseStorageService } from './knowledge-base-storage.service';
import type { AuthenticatedRequestUser } from './knowledge-base.types';

@Injectable()
export class KnowledgeBaseDocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly storageService: KnowledgeBaseStorageService,
    private readonly ingestionService: KnowledgeBaseIngestionService,
  ) {}

  async uploadDocument(
    knowledgeBaseId: string,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    } | undefined,
    user: AuthenticatedRequestUser,
  ): Promise<KnowledgeBaseDocumentItem> {
    this.ensureAdmin(user);
    await this.knowledgeBaseService.ensureKnowledgeBaseExists(knowledgeBaseId);

    if (!file) {
      throw new BadRequestException('请选择要上传的文件');
    }

    if (file.size > RAG_UPLOAD_MAX_FILE_SIZE) {
      throw new BadRequestException('单个文件大小不能超过 20MB');
    }

    const extension = extname(file.originalname).toLowerCase();
    const objectKey = `${knowledgeBaseId}/${randomUUID()}${extension}`;
    await this.storageService.uploadObject(objectKey, file.buffer, file.mimetype);

    const document = await this.prisma.document.create({
      data: {
        knowledgeBaseId,
        uploadedById: user.sub,
        fileName: file.originalname,
        fileType: file.mimetype || extension.replace('.', '').toUpperCase(),
        objectKey,
        status: 'UPLOADED',
      },
      include: {
        uploadedBy: true,
      },
    });

    void this.ingestionService.processDocument(document.id);

    return {
      id: document.id,
      knowledgeBaseId: document.knowledgeBaseId,
      fileName: document.fileName,
      fileType: document.fileType,
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

  private ensureAdmin(user: AuthenticatedRequestUser) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('只有管理员可以管理知识库文档');
    }
  }
}

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  KnowledgeBaseDetail,
  KnowledgeBaseDocumentItem,
  KnowledgeBaseItem,
} from '@fullstack/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedRequestUser } from './knowledge-base.types';

@Injectable()
export class KnowledgeBaseService {
  constructor(private readonly prisma: PrismaService) {}

  async createKnowledgeBase(
    dto: { name: string; description?: string },
    user: AuthenticatedRequestUser,
  ): Promise<KnowledgeBaseDetail> {
    this.ensureAdmin(user);

    const exists = await this.prisma.knowledgeBase.findUnique({
      where: { name: dto.name.trim() },
    });
    if (exists) {
      throw new ConflictException('知识库名称已存在');
    }

    const knowledgeBase = await this.prisma.knowledgeBase.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        createdById: user.sub,
      },
      include: {
        createdBy: true,
        _count: {
          select: { documents: true },
        },
      },
    });

    return {
      id: knowledgeBase.id,
      name: knowledgeBase.name,
      description: knowledgeBase.description,
      documentCount: knowledgeBase._count.documents,
      readyDocumentCount: 0,
      createdAt: knowledgeBase.createdAt.toISOString(),
      updatedAt: knowledgeBase.updatedAt.toISOString(),
      createdBy: {
        id: knowledgeBase.createdBy.id,
        username: knowledgeBase.createdBy.username,
      },
    };
  }

  async listKnowledgeBases(): Promise<KnowledgeBaseItem[]> {
    const items = await this.prisma.knowledgeBase.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        documents: {
          select: { status: true },
        },
      },
    });

    return items.map((item) => {
      const readyDocumentCount = item.documents.filter((document) => document.status === 'READY').length;
      return {
        id: item.id,
        name: item.name,
        description: item.description,
        documentCount: item.documents.length,
        readyDocumentCount,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      };
    });
  }

  async getKnowledgeBase(id: string): Promise<KnowledgeBaseDetail> {
    const knowledgeBase = await this.prisma.knowledgeBase.findUnique({
      where: { id },
      include: {
        createdBy: true,
        documents: {
          select: { status: true },
        },
      },
    });

    if (!knowledgeBase) {
      throw new NotFoundException('知识库不存在');
    }

    return {
      id: knowledgeBase.id,
      name: knowledgeBase.name,
      description: knowledgeBase.description,
      documentCount: knowledgeBase.documents.length,
      readyDocumentCount: knowledgeBase.documents.filter((document) => document.status === 'READY').length,
      createdAt: knowledgeBase.createdAt.toISOString(),
      updatedAt: knowledgeBase.updatedAt.toISOString(),
      createdBy: {
        id: knowledgeBase.createdBy.id,
        username: knowledgeBase.createdBy.username,
      },
    };
  }

  async deleteKnowledgeBase(id: string, user: AuthenticatedRequestUser) {
    this.ensureAdmin(user);
    const knowledgeBase = await this.prisma.knowledgeBase.findUnique({
      where: { id },
      include: {
        _count: {
          select: { documents: true },
        },
      },
    });

    if (!knowledgeBase) {
      throw new NotFoundException('知识库不存在');
    }

    if (knowledgeBase._count.documents > 0) {
      throw new ConflictException('请先清空知识库中的文档后再删除');
    }

    await this.prisma.knowledgeBase.delete({ where: { id } });
    return { success: true };
  }

  async listDocuments(knowledgeBaseId: string): Promise<KnowledgeBaseDocumentItem[]> {
    await this.ensureKnowledgeBaseExists(knowledgeBaseId);
    const documents = await this.prisma.document.findMany({
      where: { knowledgeBaseId },
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedBy: true,
      },
    });

    return documents.map((document) => ({
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
    }));
  }

  async countReadyDocuments(knowledgeBaseId: string) {
    return this.prisma.document.count({
      where: {
        knowledgeBaseId,
        status: 'READY',
      },
    });
  }

  async ensureKnowledgeBaseExists(id: string) {
    const knowledgeBase = await this.prisma.knowledgeBase.findUnique({ where: { id } });
    if (!knowledgeBase) {
      throw new NotFoundException('知识库不存在');
    }
    return knowledgeBase;
  }

  private ensureAdmin(user: AuthenticatedRequestUser) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('只有管理员可以执行该操作');
    }
  }
}

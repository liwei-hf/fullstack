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
import { fromPersistenceChunkStrategy } from './knowledge-base-chunk-strategy.util';
import { normalizeDocumentFileName } from './knowledge-base-file-name.util';
import type { AuthenticatedRequestUser } from './knowledge-base.types';

/**
 * 知识库核心服务
 *
 * 负责知识库本身的 CRUD，以及文档列表这类偏资源管理的查询逻辑。
 */
@Injectable()
export class KnowledgeBaseService {
  constructor(private readonly prisma: PrismaService) {}

  // 创建知识库时先校验重名，避免后续上传文档时出现归属混乱。
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

  // 列表页主要关注数量和状态聚合，因此这里直接在 service 里做轻量映射。
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

  // 详情页用于展示单个知识库的基础信息和可用文档数。
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

  // 当前版本只允许删除空知识库，避免把对象存储和向量清理耦合进一次删除里。
  // 但问答日志只是知识库的派生历史数据，所以这里允许一并清掉，避免空知识库被 qaLog 外键拦住。
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

    await this.prisma.$transaction(async (tx) => {
      await tx.qaLog.deleteMany({
        where: { knowledgeBaseId: id },
      });

      await tx.knowledgeBase.delete({ where: { id } });
    });

    return { success: true };
  }

  // 文档列表会把持久化层的枚举转换成前端更友好的共享契约枚举。
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
    }));
  }

  // 问答前先用这个方法快速判断知识库里是否存在 READY 文档。
  async countReadyDocuments(knowledgeBaseId: string) {
    return this.prisma.document.count({
      where: {
        knowledgeBaseId,
        status: 'READY',
      },
    });
  }

  // 统一的存在性校验，避免多个 service 重复写 not found 逻辑。
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

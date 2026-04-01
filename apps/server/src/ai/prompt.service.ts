import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { ChatOpenAI } from '@langchain/openai';
import type {
  CreatePromptVersionRequest,
  PromptTemplateCode,
  PromptTemplateDetail,
  PromptTemplateListItem,
  PromptTestLogItem,
  PromptTestResult,
  PromptVersionItem,
  UpdatePromptVersionRequest,
} from '@fullstack/shared';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';
import {
  PROMPT_DEFAULT_DEFINITIONS,
  getPromptDefaultDefinition,
} from './prompt-defaults.registry';
import { interpolatePromptTemplate } from './prompt-template.util';

type PromptUser = { sub: string; role: 'admin' | 'user' };

/**
 * Prompt 管理服务
 *
 * 负责：
 * - 同步默认 Prompt 模板到数据库
 * - 管理 Prompt 版本的新增、编辑、发布
 * - 解析运行时生效的 Prompt（数据库优先，代码兜底）
 * - 记录 Prompt 测试日志
 */
@Injectable()
export class PromptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly provider: OpenAiCompatibleProvider,
  ) {}

  async listTemplates(): Promise<PromptTemplateListItem[]> {
    await this.ensureTemplatesSynced();

    const templates = await this.prisma.promptTemplate.findMany({
      include: {
        versions: {
          where: { status: 'ACTIVE' },
          orderBy: { version: 'desc' },
          take: 1,
        },
        _count: {
          select: { versions: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return templates.map((template) => ({
      id: template.id,
      code: template.code as PromptTemplateCode,
      name: template.name,
      description: template.description,
      scene: template.scene as 'nl2sql' | 'rag',
      activeVersion: template.versions[0]
        ? {
            id: template.versions[0].id,
            version: template.versions[0].version,
            status: this.toPromptVersionStatus(template.versions[0].status),
            updatedAt: template.versions[0].updatedAt.toISOString(),
          }
        : null,
      versionCount: template._count.versions,
      updatedAt: template.updatedAt.toISOString(),
    }));
  }

  async getTemplateDetail(code: PromptTemplateCode): Promise<PromptTemplateDetail> {
    await this.ensureTemplatesSynced();

    const template = await this.prisma.promptTemplate.findUnique({
      where: { code },
      include: {
        versions: {
          include: {
            createdBy: true,
          },
          orderBy: { version: 'desc' },
        },
      },
    });

    if (!template) {
      throw new NotFoundException('Prompt 模板不存在');
    }

    const defaultDefinition = getPromptDefaultDefinition(code);
    const activeVersion = template.versions.find((item) => item.status === 'ACTIVE') ?? null;

    return {
      id: template.id,
      code: template.code as PromptTemplateCode,
      name: template.name,
      description: template.description,
      scene: template.scene as 'nl2sql' | 'rag',
      defaultDraft: {
        systemPrompt: defaultDefinition.systemPrompt,
        userPromptTemplate: defaultDefinition.userPromptTemplate,
        variablesSchema: (defaultDefinition.variablesSchema ?? null) as Record<string, unknown> | null,
      },
      activeVersionId: activeVersion?.id ?? null,
      versions: template.versions.map((version) => this.toPromptVersionItem(version)),
    };
  }

  async createVersion(
    code: PromptTemplateCode,
    dto: CreatePromptVersionRequest,
    user: PromptUser,
  ): Promise<PromptVersionItem> {
    this.ensureAdmin(user);
    await this.ensureTemplatesSynced();

    const template = await this.prisma.promptTemplate.findUnique({
      where: { code },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });

    if (!template) {
      throw new NotFoundException('Prompt 模板不存在');
    }

    const nextVersion = (template.versions[0]?.version ?? 0) + 1;
    const created = await this.prisma.promptVersion.create({
      data: {
        templateId: template.id,
        version: nextVersion,
        systemPrompt: dto.systemPrompt,
        userPromptTemplate: dto.userPromptTemplate,
        variablesSchema: this.toNullableJsonValue(dto.variablesSchema),
        createdById: user.sub,
        status: 'DRAFT',
      },
    });
    const version = await this.prisma.promptVersion.findUniqueOrThrow({
      where: { id: created.id },
      include: { createdBy: true },
    });

    return this.toPromptVersionItem(version);
  }

  async updateVersion(
    id: string,
    dto: UpdatePromptVersionRequest,
    user: PromptUser,
  ): Promise<PromptVersionItem> {
    this.ensureAdmin(user);

    const current = await this.prisma.promptVersion.findUnique({
      where: { id },
      include: { createdBy: true },
    });

    if (!current) {
      throw new NotFoundException('Prompt 版本不存在');
    }

    if (current.status !== 'DRAFT') {
      throw new ConflictException('只有草稿版本允许编辑');
    }

    const updated = await this.prisma.promptVersion.update({
      where: { id },
      data: {
        systemPrompt: dto.systemPrompt,
        userPromptTemplate: dto.userPromptTemplate,
        variablesSchema: this.toNullableJsonValue(dto.variablesSchema),
      },
    });
    const version = await this.prisma.promptVersion.findUniqueOrThrow({
      where: { id: updated.id },
      include: { createdBy: true },
    });

    return this.toPromptVersionItem(version);
  }

  async publishVersion(id: string, user: PromptUser): Promise<PromptVersionItem> {
    this.ensureAdmin(user);

    const version = await this.prisma.promptVersion.findUnique({
      where: { id },
      include: {
        template: true,
        createdBy: true,
      },
    });

    if (!version) {
      throw new NotFoundException('Prompt 版本不存在');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.promptVersion.updateMany({
        where: {
          templateId: version.templateId,
          status: 'ACTIVE',
        },
        data: {
          status: 'ARCHIVED',
        },
      });

      await tx.promptVersion.update({
        where: { id },
        data: { status: 'ACTIVE' },
      });
    });

    const published = await this.prisma.promptVersion.findUniqueOrThrow({
      where: { id },
      include: { createdBy: true },
    });

    return this.toPromptVersionItem(published);
  }

  async testPrompt(input: {
    templateCode: PromptTemplateCode;
    promptVersionId?: string;
    variables: Record<string, unknown>;
    user: PromptUser;
  }): Promise<PromptTestResult> {
    this.ensureAdmin(input.user);

    const requestId = randomUUID();
    const startedAt = Date.now();
    let resolvedPrompt:
      | {
          systemPrompt: string;
          userPrompt: string;
          source: 'default' | 'database';
          promptVersionId: string | null;
        }
      | null = null;

    try {
      resolvedPrompt = await this.resolvePrompt(
        input.templateCode,
        input.variables,
        input.promptVersionId,
      );

      const output = await this.generatePromptTestOutput(input.templateCode, resolvedPrompt);

      const durationMs = Date.now() - startedAt;
      await this.prisma.promptTestLog.create({
        data: {
          templateCode: input.templateCode,
          promptVersionId: resolvedPrompt.promptVersionId,
          input: this.toJsonValue(input.variables),
          resolvedPrompt: this.toJsonValue({
            systemPrompt: resolvedPrompt.systemPrompt,
            userPrompt: resolvedPrompt.userPrompt,
          }),
          output,
          durationMs,
          success: true,
          createdById: input.user.sub,
        },
      });

      return {
        requestId,
        templateCode: input.templateCode,
        promptVersionId: resolvedPrompt.promptVersionId,
        resolvedPrompt: {
          systemPrompt: resolvedPrompt.systemPrompt,
          userPrompt: resolvedPrompt.userPrompt,
        },
        output,
        durationMs,
        source: resolvedPrompt.source,
      };
    } catch (error) {
      await this.prisma.promptTestLog.create({
        data: {
          templateCode: input.templateCode,
          promptVersionId: resolvedPrompt?.promptVersionId ?? input.promptVersionId ?? null,
          input: this.toJsonValue(input.variables),
          resolvedPrompt: this.toJsonValue(
            resolvedPrompt
            ? {
                systemPrompt: resolvedPrompt.systemPrompt,
                userPrompt: resolvedPrompt.userPrompt,
              }
            : { systemPrompt: '', userPrompt: '' },
          ),
          output: null,
          durationMs: Date.now() - startedAt,
          success: false,
          errorMessage: error instanceof Error ? error.message : 'Prompt 测试失败',
          createdById: input.user.sub,
        },
      });
      throw error;
    }
  }

  async listTestLogs(limit = 20): Promise<PromptTestLogItem[]> {
    const logs = await this.prisma.promptTestLog.findMany({
      include: {
        createdBy: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return logs.map((log) => ({
      id: log.id,
      templateCode: log.templateCode as PromptTemplateCode,
      promptVersionId: log.promptVersionId,
      input: (log.input as Record<string, unknown>) ?? {},
      resolvedPrompt: (log.resolvedPrompt as {
        systemPrompt: string;
        userPrompt: string;
      }) ?? { systemPrompt: '', userPrompt: '' },
      output: log.output,
      durationMs: log.durationMs,
      success: log.success,
      errorMessage: log.errorMessage,
      createdBy: {
        id: log.createdBy.id,
        username: log.createdBy.username,
      },
      createdAt: log.createdAt.toISOString(),
    }));
  }

  async resolvePrompt(
    code: PromptTemplateCode,
    variables: Record<string, unknown>,
    promptVersionId?: string,
  ) {
    await this.ensureTemplatesSynced();

    let version = null as null | {
      id: string;
      systemPrompt: string;
      userPromptTemplate: string;
    };

    if (promptVersionId) {
      const found = await this.prisma.promptVersion.findUnique({
        where: { id: promptVersionId },
        select: {
          id: true,
          systemPrompt: true,
          userPromptTemplate: true,
          template: {
            select: { code: true },
          },
        },
      });

      if (!found) {
        throw new NotFoundException('Prompt 版本不存在');
      }

      if (found.template.code !== code) {
        throw new ConflictException('Prompt 版本与模板编码不匹配');
      }

      version = {
        id: found.id,
        systemPrompt: found.systemPrompt,
        userPromptTemplate: found.userPromptTemplate,
      };
    } else {
      const active = await this.prisma.promptVersion.findFirst({
        where: {
          template: { code },
          status: 'ACTIVE',
        },
        orderBy: { version: 'desc' },
        select: {
          id: true,
          systemPrompt: true,
          userPromptTemplate: true,
        },
      });

      if (active) {
        version = active;
      }
    }

    if (version) {
      return {
        source: 'database' as const,
        promptVersionId: version.id,
        systemPrompt: interpolatePromptTemplate(version.systemPrompt, variables),
        userPrompt: interpolatePromptTemplate(version.userPromptTemplate, variables),
      };
    }

    const fallback = getPromptDefaultDefinition(code);
    return {
      source: 'default' as const,
      promptVersionId: null,
      systemPrompt: interpolatePromptTemplate(fallback.systemPrompt, variables),
      userPrompt: interpolatePromptTemplate(fallback.userPromptTemplate, variables),
    };
  }

  private async ensureTemplatesSynced() {
    await Promise.all(
      PROMPT_DEFAULT_DEFINITIONS.map((definition) =>
        this.prisma.promptTemplate.upsert({
          where: { code: definition.code },
          update: {
            name: definition.name,
            description: definition.description,
            scene: definition.scene,
          },
          create: {
            code: definition.code,
            name: definition.name,
            description: definition.description,
            scene: definition.scene,
          },
        }),
      ),
    );
  }

  private toPromptVersionItem(version: {
    id: string;
    templateId: string;
    version: number;
    systemPrompt: string;
    userPromptTemplate: string;
    variablesSchema: unknown;
    status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
    createdAt: Date;
    updatedAt: Date;
    createdBy: { id: string; username: string };
  }): PromptVersionItem {
    return {
      id: version.id,
      templateId: version.templateId,
      version: version.version,
      systemPrompt: version.systemPrompt,
      userPromptTemplate: version.userPromptTemplate,
      variablesSchema: (version.variablesSchema as Record<string, unknown> | null) ?? null,
      status: this.toPromptVersionStatus(version.status),
      createdBy: {
        id: version.createdBy.id,
        username: version.createdBy.username,
      },
      createdAt: version.createdAt.toISOString(),
      updatedAt: version.updatedAt.toISOString(),
    };
  }

  private toPromptVersionStatus(status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED') {
    switch (status) {
      case 'ACTIVE':
        return 'active' as const;
      case 'ARCHIVED':
        return 'archived' as const;
      case 'DRAFT':
      default:
        return 'draft' as const;
    }
  }

  private getPromptTestModel(code: PromptTemplateCode) {
    if (code === 'sql_generation') {
      return (
        this.configService.get<string>('OPENAI_SQL_MODEL') ||
        this.configService.get<string>('OPENAI_MODEL')
      );
    }

    return (
      this.configService.get<string>('OPENAI_ANSWER_MODEL') ||
      this.configService.get<string>('OPENAI_CHAT_MODEL') ||
      this.configService.get<string>('OPENAI_MODEL')
    );
  }

  private async generatePromptTestOutput(
    code: PromptTemplateCode,
    resolvedPrompt: { systemPrompt: string; userPrompt: string },
  ) {
    if (code === 'knowledge_base_answer') {
      const model = this.createKnowledgeBasePromptTestModel();
      const response = await model.invoke(
        [resolvedPrompt.systemPrompt, '', resolvedPrompt.userPrompt].join('\n\n'),
      );
      return this.extractText(response.content);
    }

    return this.provider.generateText({
      model: this.getPromptTestModel(code),
      temperature: code === 'sql_generation' ? 0.1 : 0.3,
      messages: [
        { role: 'system', content: resolvedPrompt.systemPrompt },
        { role: 'user', content: resolvedPrompt.userPrompt },
      ],
    });
  }

  private ensureAdmin(user: PromptUser) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('只有管理员可以管理 Prompt');
    }
  }

  private toNullableJsonValue(value?: Record<string, unknown> | null) {
    if (value === null || value === undefined) {
      return Prisma.JsonNull;
    }

    return value as Prisma.InputJsonValue;
  }

  private toJsonValue(value: Record<string, unknown>) {
    return value as Prisma.InputJsonValue;
  }

  private createKnowledgeBasePromptTestModel() {
    const model =
      this.configService.get<string>('ZHIPU_CHAT_MODEL') ||
      this.configService.get<string>('OPENAI_CHAT_MODEL') ||
      this.configService.get<string>('OPENAI_ANSWER_MODEL') ||
      this.configService.get<string>('OPENAI_MODEL');

    if (!model) {
      throw new InternalServerErrorException('缺少知识库问答聊天模型配置');
    }

    const apiKey =
      this.configService.get<string>('ZHIPU_API_KEY') ||
      this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      throw new InternalServerErrorException('缺少 ZHIPU_API_KEY 或 OPENAI_API_KEY 配置');
    }

    const baseURL =
      this.configService.get<string>('ZHIPU_CHAT_MODEL')
        ? this.configService.get<string>('ZHIPU_BASE_URL')
        : this.configService.get<string>('OPENAI_BASE_URL');

    return new ChatOpenAI({
      apiKey,
      model,
      temperature: 0.3,
      configuration: baseURL ? { baseURL } : undefined,
    });
  }

  private extractText(content: unknown) {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === 'string') {
            return part;
          }

          if (
            part &&
            typeof part === 'object' &&
            'type' in part &&
            part.type === 'text' &&
            'text' in part &&
            typeof part.text === 'string'
          ) {
            return part.text;
          }

          return '';
        })
        .join('');
    }

    return '';
  }
}

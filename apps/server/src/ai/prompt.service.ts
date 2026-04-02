import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { ChatOpenAI } from '@langchain/openai';
import type {
  PromptTemplateCode,
  PromptTemplateDetail,
  PromptTemplateListItem,
  PromptTestLogItem,
  PromptTestResult,
  UpdatePromptTemplateRequest,
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
 * 当前版本采用“单模板直接编辑”模式：
 * - 每个 Prompt 模板只有一份当前生效内容
 * - 不再暴露版本、发布、回滚这些概念
 * - 运行时优先读取数据库模板，代码默认模板只作为兜底
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
      orderBy: { createdAt: 'asc' },
    });

    return templates.map((template) => ({
      id: template.id,
      code: template.code as PromptTemplateCode,
      name: template.name,
      description: template.description,
      scene: template.scene as 'nl2sql' | 'rag',
      updatedAt: template.updatedAt.toISOString(),
    }));
  }

  async getTemplateDetail(code: PromptTemplateCode): Promise<PromptTemplateDetail> {
    await this.ensureTemplatesSynced();

    const template = await this.prisma.promptTemplate.findUnique({
      where: { code },
    });

    if (!template) {
      throw new NotFoundException('Prompt 模板不存在');
    }

    return {
      id: template.id,
      code: template.code as PromptTemplateCode,
      name: template.name,
      description: template.description,
      scene: template.scene as 'nl2sql' | 'rag',
      systemPrompt: template.systemPrompt,
      userPromptTemplate: template.userPromptTemplate,
      variablesSchema: (template.variablesSchema as Record<string, unknown> | null) ?? null,
    };
  }

  async updateTemplate(
    code: PromptTemplateCode,
    dto: UpdatePromptTemplateRequest,
    user: PromptUser,
  ): Promise<PromptTemplateDetail> {
    this.ensureAdmin(user);
    await this.ensureTemplatesSynced();

    const updated = await this.prisma.promptTemplate.update({
      where: { code },
      data: {
        systemPrompt: dto.systemPrompt,
        userPromptTemplate: dto.userPromptTemplate,
        variablesSchema: this.toNullableJsonValue(dto.variablesSchema),
      },
    });

    return {
      id: updated.id,
      code: updated.code as PromptTemplateCode,
      name: updated.name,
      description: updated.description,
      scene: updated.scene as 'nl2sql' | 'rag',
      systemPrompt: updated.systemPrompt,
      userPromptTemplate: updated.userPromptTemplate,
      variablesSchema: (updated.variablesSchema as Record<string, unknown> | null) ?? null,
    };
  }

  async testPrompt(input: {
    templateCode: PromptTemplateCode;
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
        }
      | null = null;

    try {
      resolvedPrompt = await this.resolvePrompt(input.templateCode, input.variables);

      const output = await this.generatePromptTestOutput(input.templateCode, resolvedPrompt);

      const durationMs = Date.now() - startedAt;
      await this.prisma.promptTestLog.create({
        data: {
          templateCode: input.templateCode,
          promptVersionId: null,
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
          promptVersionId: null,
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
      input: (log.input as Record<string, unknown>) ?? {},
      resolvedPrompt:
        (log.resolvedPrompt as {
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

  async resolvePrompt(code: PromptTemplateCode, variables: Record<string, unknown>) {
    await this.ensureTemplatesSynced();

    const template = await this.prisma.promptTemplate.findUnique({
      where: { code },
      select: {
        systemPrompt: true,
        userPromptTemplate: true,
      },
    });

    if (template?.systemPrompt && template.userPromptTemplate) {
      return {
        source: 'database' as const,
        systemPrompt: interpolatePromptTemplate(template.systemPrompt, variables),
        userPrompt: interpolatePromptTemplate(template.userPromptTemplate, variables),
      };
    }

    const fallback = getPromptDefaultDefinition(code);
    return {
      source: 'default' as const,
      systemPrompt: interpolatePromptTemplate(fallback.systemPrompt, variables),
      userPrompt: interpolatePromptTemplate(fallback.userPromptTemplate, variables),
    };
  }

  private async ensureTemplatesSynced() {
    await Promise.all(
      PROMPT_DEFAULT_DEFINITIONS.map(async (definition) => {
        const template = await this.prisma.promptTemplate.upsert({
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
            systemPrompt: definition.systemPrompt,
            userPromptTemplate: definition.userPromptTemplate,
            variablesSchema: this.toNullableJsonValue(definition.variablesSchema ?? undefined),
          },
        });

        // 兼容老数据：历史模板没有“当前生效内容”字段时，自动补成代码默认值。
        if (!template.systemPrompt || !template.userPromptTemplate) {
          await this.prisma.promptTemplate.update({
            where: { id: template.id },
            data: {
              systemPrompt: template.systemPrompt || definition.systemPrompt,
              userPromptTemplate:
                template.userPromptTemplate || definition.userPromptTemplate,
              variablesSchema:
                template.variablesSchema ??
                this.toNullableJsonValue(definition.variablesSchema ?? undefined),
            },
          });
        }
      }),
    );
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

  private createKnowledgeBasePromptTestModel() {
    const modelName =
      this.configService.get<string>('ZHIPU_CHAT_MODEL') ||
      this.configService.get<string>('OPENAI_ANSWER_MODEL') ||
      this.configService.get<string>('OPENAI_CHAT_MODEL') ||
      this.configService.get<string>('OPENAI_MODEL');

    if (!modelName) {
      throw new InternalServerErrorException('未配置 Prompt 测试模型');
    }

    return new ChatOpenAI({
      model: modelName,
      apiKey:
        this.configService.get<string>('ZHIPU_API_KEY') ||
        this.configService.get<string>('OPENAI_API_KEY'),
      configuration: this.buildConfiguration(
        this.configService.get<string>('ZHIPU_BASE_URL') ||
          this.configService.get<string>('OPENAI_BASE_URL'),
      ),
      temperature: 0.3,
    });
  }

  private extractText(content: unknown) {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((item) =>
          typeof item === 'string'
            ? item
            : typeof item === 'object' && item && 'text' in item
              ? String((item as { text?: unknown }).text ?? '')
              : '',
        )
        .join('');
    }

    return String(content ?? '');
  }

  private ensureAdmin(user: PromptUser) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('只有管理员可以管理 Prompt');
    }
  }

  private toJsonValue(value: Record<string, unknown>) {
    return value as Prisma.InputJsonValue;
  }

  private toNullableJsonValue(value: Record<string, unknown> | undefined) {
    return value ? (value as Prisma.InputJsonValue) : Prisma.JsonNull;
  }

  private buildConfiguration(baseURL?: string) {
    return baseURL ? { baseURL } : undefined;
  }
}

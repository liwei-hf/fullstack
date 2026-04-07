import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiSettings, AiSqlVisibility } from '@fullstack/shared';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';

const AI_SQL_VISIBILITY_SETTING_KEY = 'ai.sqlVisibility';

@Injectable()
export class SystemSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getAiSettings(): Promise<AiSettings> {
    return {
      sqlVisibility: await this.resolveAiSqlVisibility(),
    };
  }

  async updateAiSettings(
    user: { sub: string; role: 'admin' | 'user' },
    dto: UpdateAiSettingsDto,
  ): Promise<AiSettings> {
    this.ensureAdmin(user);

    await this.prisma.systemSetting.upsert({
      where: { key: AI_SQL_VISIBILITY_SETTING_KEY },
      update: {
        value: { sqlVisibility: dto.sqlVisibility },
        updatedById: user.sub,
      },
      create: {
        key: AI_SQL_VISIBILITY_SETTING_KEY,
        value: { sqlVisibility: dto.sqlVisibility },
        updatedById: user.sub,
      },
    });

    return this.getAiSettings();
  }

  /**
   * 优先读取数据库中的后台配置；如果还没配置过，再回退到环境变量。
   *
   * 这样既支持“首次部署时通过 env 兜底”，也支持“管理员在后台改完立即生效”。
   */
  async resolveAiSqlVisibility(): Promise<AiSqlVisibility> {
    const persistedSetting = await this.prisma.systemSetting.findUnique({
      where: { key: AI_SQL_VISIBILITY_SETTING_KEY },
    });

    const persistedVisibility = this.extractVisibilityFromValue(persistedSetting?.value);
    if (persistedVisibility) {
      return persistedVisibility;
    }

    const envVisibility = this.extractVisibilityFromValue({
      sqlVisibility: this.configService.get<string>('AI_SQL_VISIBILITY'),
    });

    return envVisibility ?? 'admin_only';
  }

  private ensureAdmin(user: { role: 'admin' | 'user' }) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('只有管理员可以修改系统设置');
    }
  }

  private extractVisibilityFromValue(value: unknown): AiSqlVisibility | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const sqlVisibility = (value as { sqlVisibility?: unknown }).sqlVisibility;
    if (
      sqlVisibility === 'visible' ||
      sqlVisibility === 'hidden' ||
      sqlVisibility === 'admin_only'
    ) {
      return sqlVisibility;
    }

    return null;
  }
}

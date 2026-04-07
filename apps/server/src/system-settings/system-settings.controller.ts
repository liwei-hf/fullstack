import { Body, Controller, ForbiddenException, Get, Patch, UseGuards } from '@nestjs/common';
import type { AiSettings } from '@fullstack/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user';
import { SystemSettingsService } from './system-settings.service';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';

@Controller('admin/settings')
@UseGuards(JwtAuthGuard)
export class SystemSettingsController {
  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  @Get('ai')
  async getAiSettings(
    @CurrentUser() user: { sub: string; role: 'admin' | 'user' },
  ): Promise<{ data: AiSettings }> {
    this.ensureAdmin(user);
    return {
      data: await this.systemSettingsService.getAiSettings(),
    };
  }

  @Patch('ai')
  async updateAiSettings(
    @CurrentUser() user: { sub: string; role: 'admin' | 'user' },
    @Body() dto: UpdateAiSettingsDto,
  ): Promise<{ data: AiSettings }> {
    return {
      data: await this.systemSettingsService.updateAiSettings(user, dto),
    };
  }

  private ensureAdmin(user: { role: 'admin' | 'user' }) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('只有管理员可以查看系统设置');
    }
  }
}

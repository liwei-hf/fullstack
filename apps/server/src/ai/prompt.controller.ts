import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PROMPT_TEMPLATE_CODES } from '@fullstack/shared';
import { CurrentUser } from '../common/decorators/current-user';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreatePromptVersionDto } from './dto/create-prompt-version.dto';
import { PromptTestDto } from './dto/prompt-test.dto';
import { UpdatePromptVersionDto } from './dto/update-prompt-version.dto';
import { PromptService } from './prompt.service';

/**
 * Prompt 管理 HTTP 入口
 *
 * 后台通过这组接口维护 Prompt 模板、版本和测试日志。
 */
@Controller('ai/prompts')
@UseGuards(JwtAuthGuard)
export class PromptController {
  constructor(private readonly promptService: PromptService) {}

  private ensureAdmin(user: { sub: string; role: 'admin' | 'user' }) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('只有管理员可以管理 Prompt');
    }
  }

  @Get('templates')
  async listTemplates(@CurrentUser() user: { sub: string; role: 'admin' | 'user' }) {
    this.ensureAdmin(user);
    return {
      data: await this.promptService.listTemplates(),
    };
  }

  @Get('templates/:code')
  async getTemplateDetail(
    @Param('code') code: (typeof PROMPT_TEMPLATE_CODES)[number],
    @CurrentUser() user: { sub: string; role: 'admin' | 'user' },
  ) {
    this.ensureAdmin(user);
    return {
      data: await this.promptService.getTemplateDetail(code),
    };
  }

  @Post('templates/:code/versions')
  async createVersion(
    @Param('code') code: (typeof PROMPT_TEMPLATE_CODES)[number],
    @Body() dto: CreatePromptVersionDto,
    @CurrentUser() user: { sub: string; role: 'admin' | 'user' },
  ) {
    this.ensureAdmin(user);
    return {
      data: await this.promptService.createVersion(code, dto, user),
    };
  }

  @Patch('versions/:id')
  async updateVersion(
    @Param('id') id: string,
    @Body() dto: UpdatePromptVersionDto,
    @CurrentUser() user: { sub: string; role: 'admin' | 'user' },
  ) {
    this.ensureAdmin(user);
    return {
      data: await this.promptService.updateVersion(id, dto, user),
    };
  }

  @Post('versions/:id/publish')
  async publishVersion(
    @Param('id') id: string,
    @CurrentUser() user: { sub: string; role: 'admin' | 'user' },
  ) {
    this.ensureAdmin(user);
    return {
      data: await this.promptService.publishVersion(id, user),
    };
  }

  @Post('test')
  async testPrompt(
    @Body() dto: PromptTestDto,
    @CurrentUser() user: { sub: string; role: 'admin' | 'user' },
  ) {
    this.ensureAdmin(user);
    return {
      data: await this.promptService.testPrompt({
        templateCode: dto.templateCode,
        promptVersionId: dto.promptVersionId,
        variables: dto.variables,
        user,
      }),
    };
  }

  @Get('test-logs')
  async listTestLogs(
    @Query('limit') limit: string | undefined,
    @CurrentUser() user: { sub: string; role: 'admin' | 'user' },
  ) {
    this.ensureAdmin(user);
    return {
      data: await this.promptService.listTestLogs(limit ? Number(limit) : 20),
    };
  }
}

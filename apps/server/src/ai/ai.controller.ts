import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AiLogType } from '@fullstack/shared';
import { CurrentUser } from '../common/decorators/current-user';
import { resolveRequestId } from '../common/utils/request-id.util';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiLogService } from './ai-log.service';
import { AiService } from './ai.service';
import { AiSqlStreamDto } from './dto/ai-sql-stream.dto';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly aiLogService: AiLogService,
  ) {}

  @Get('logs')
  async listLogs(
    @CurrentUser() user: { sub: string; role: 'admin' | 'user'; status: string },
    @Query('type') type?: AiLogType,
  ) {
    return {
      data: await this.aiLogService.listCurrentUserLogs({
        userId: user.sub,
        type,
      }),
    };
  }

  @Get('logs/:type/:id')
  async getLogDetail(
    @CurrentUser() user: { sub: string; role: 'admin' | 'user'; status: string },
    @Param('type') type: AiLogType,
    @Param('id') id: string,
  ) {
    return {
      data: await this.aiLogService.getCurrentUserLogDetail({
        id,
        type,
        userId: user.sub,
      }),
    };
  }

  @Post('sql/stream')
  async streamSqlAnswer(
    @Body() dto: AiSqlStreamDto,
    @CurrentUser() user: { sub: string; role: 'admin' | 'user'; status: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const requestId = resolveRequestId(req.headers);

    // 统一在控制器层设置 SSE 头，业务层只负责写事件内容。
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    await this.aiService.streamSqlAnswer(dto.question, user, res, requestId, dto.sessionId);
  }
}

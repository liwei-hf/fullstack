import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiService } from './ai.service';
import { AiSqlStreamDto } from './dto/ai-sql-stream.dto';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('sql/stream')
  async streamSqlAnswer(
    @Body() dto: AiSqlStreamDto,
    @CurrentUser() user: { sub: string; role: 'admin' | 'user'; status: string },
    @Res() res: Response,
  ) {
    // 统一在控制器层设置 SSE 头，业务层只负责写事件内容。
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    await this.aiService.streamSqlAnswer(dto.question, user, res);
  }
}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { AiController } from './ai.controller';
import { PromptController } from './prompt.controller';
import { PromptService } from './prompt.service';
import { AiService } from './ai.service';
import { AiLogService } from './ai-log.service';
import { AiSessionMemoryService } from './ai-session-memory.service';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';
import { SqlValidator } from './sql-validator';

@Module({
  imports: [PrismaModule, RedisModule, SystemSettingsModule],
  controllers: [AiController, PromptController],
  providers: [
    AiService,
    AiLogService,
    AiSessionMemoryService,
    PromptService,
    OpenAiCompatibleProvider,
    SqlValidator,
  ],
  exports: [AiService, AiLogService, AiSessionMemoryService, PromptService],
})
export class AiModule {}

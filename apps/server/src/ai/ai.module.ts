import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';
import { SqlValidator } from './sql-validator';

@Module({
  imports: [PrismaModule],
  controllers: [AiController],
  providers: [AiService, OpenAiCompatibleProvider, SqlValidator],
  exports: [AiService],
})
export class AiModule {}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RAG_UPLOAD_MAX_FILE_SIZE } from './knowledge-base.constants';
import { KnowledgeBaseChatService } from './knowledge-base-chat.service';
import { KnowledgeBaseDocumentService } from './knowledge-base-document.service';
import { KnowledgeBaseService } from './knowledge-base.service';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto';
import { RagChatStreamDto } from './dto/rag-chat-stream.dto';
import type { AuthenticatedRequestUser } from './knowledge-base.types';

@Controller('knowledge-base')
@UseGuards(JwtAuthGuard)
export class KnowledgeBaseController {
  constructor(
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly knowledgeBaseDocumentService: KnowledgeBaseDocumentService,
    private readonly knowledgeBaseChatService: KnowledgeBaseChatService,
  ) {}

  @Post()
  async createKnowledgeBase(
    @Body() dto: CreateKnowledgeBaseDto,
    @CurrentUser() user: AuthenticatedRequestUser,
  ) {
    return {
      data: await this.knowledgeBaseService.createKnowledgeBase(dto, user),
    };
  }

  @Get()
  async listKnowledgeBases() {
    return {
      data: await this.knowledgeBaseService.listKnowledgeBases(),
    };
  }

  @Get(':id')
  async getKnowledgeBase(@Param('id') id: string) {
    return {
      data: await this.knowledgeBaseService.getKnowledgeBase(id),
    };
  }

  @Delete(':id')
  async deleteKnowledgeBase(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedRequestUser,
  ) {
    return {
      data: await this.knowledgeBaseService.deleteKnowledgeBase(id, user),
    };
  }

  @Post(':id/documents/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: RAG_UPLOAD_MAX_FILE_SIZE,
      },
    }),
  )
  async uploadDocument(
    @Param('id') id: string,
    @UploadedFile() file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    } | undefined,
    @CurrentUser() user: AuthenticatedRequestUser,
  ) {
    return {
      data: await this.knowledgeBaseDocumentService.uploadDocument(id, file, user),
    };
  }

  @Get(':id/documents')
  async listDocuments(@Param('id') id: string) {
    return {
      data: await this.knowledgeBaseService.listDocuments(id),
    };
  }

  @Delete('documents/:documentId')
  async deleteDocument(
    @Param('documentId') documentId: string,
    @CurrentUser() user: AuthenticatedRequestUser,
  ) {
    return {
      data: await this.knowledgeBaseDocumentService.deleteDocument(documentId, user),
    };
  }

  @Post(':id/chat/stream')
  async streamAnswer(
    @Param('id') id: string,
    @Body() dto: RagChatStreamDto,
    @CurrentUser() user: AuthenticatedRequestUser,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    await this.knowledgeBaseChatService.streamAnswer(id, dto.question, user, res);
  }
}

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
import { UploadDocumentDto } from './dto/upload-document.dto';
import type { AuthenticatedRequestUser } from './knowledge-base.types';

/**
 * 知识库 HTTP 入口
 *
 * controller 只做参数接收、鉴权挂载和响应封装，
 * 具体业务逻辑全部下沉到 service，方便后续扩展和测试。
 */
@Controller('knowledge-base')
@UseGuards(JwtAuthGuard)
export class KnowledgeBaseController {
  constructor(
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly knowledgeBaseDocumentService: KnowledgeBaseDocumentService,
    private readonly knowledgeBaseChatService: KnowledgeBaseChatService,
  ) {}

  // 创建知识库，只负责接收入参并把当前用户传给 service。
  @Post()
  async createKnowledgeBase(
    @Body() dto: CreateKnowledgeBaseDto,
    @CurrentUser() user: AuthenticatedRequestUser,
  ) {
    return {
      data: await this.knowledgeBaseService.createKnowledgeBase(dto, user),
    };
  }

  // 获取知识库列表，供管理端和移动端选择问答范围。
  @Get()
  async listKnowledgeBases() {
    return {
      data: await this.knowledgeBaseService.listKnowledgeBases(),
    };
  }

  // 获取单个知识库详情，用于展示描述和文档计数。
  @Get(':id')
  async getKnowledgeBase(@Param('id') id: string) {
    return {
      data: await this.knowledgeBaseService.getKnowledgeBase(id),
    };
  }

  // 删除知识库时只允许删除空知识库，避免级联清理带来不一致。
  @Delete(':id')
  async deleteKnowledgeBase(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedRequestUser,
  ) {
    return {
      data: await this.knowledgeBaseService.deleteKnowledgeBase(id, user),
    };
  }

  // 上传接口只负责建立文档记录，真正的解析和向量化在后台异步执行。
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
    @Body() dto: UploadDocumentDto,
    @CurrentUser() user: AuthenticatedRequestUser,
  ) {
    return {
      data: await this.knowledgeBaseDocumentService.uploadDocument(id, file, user, dto.chunkStrategy),
    };
  }

  // 获取当前知识库下的文档列表和处理状态。
  @Get(':id/documents')
  async listDocuments(@Param('id') id: string) {
    return {
      data: await this.knowledgeBaseService.listDocuments(id),
    };
  }

  // 删除文档时会先从检索链路中剔除，再做对象存储和数据库清理。
  @Delete('documents/:documentId')
  async deleteDocument(
    @Param('documentId') documentId: string,
    @CurrentUser() user: AuthenticatedRequestUser,
  ) {
    return {
      data: await this.knowledgeBaseDocumentService.deleteDocument(documentId, user),
    };
  }

  // 问答接口走 SSE，前端可以边收 token 边渲染回答。
  @Post(':id/chat/stream')
  async streamAnswer(
    @Param('id') id: string,
    @Body() dto: RagChatStreamDto,
    @CurrentUser() user: AuthenticatedRequestUser,
    @Res() res: Response,
  ) {
    // SSE 响应头需要在开始写流之前就设置好，避免浏览器按普通 JSON 处理。
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    await this.knowledgeBaseChatService.streamAnswer(id, dto.question, user, res);
  }
}

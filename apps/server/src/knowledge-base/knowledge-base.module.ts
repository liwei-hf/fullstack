import { Module } from '@nestjs/common';
import { KnowledgeBaseChatService } from './knowledge-base-chat.service';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { KnowledgeBaseDocumentService } from './knowledge-base-document.service';
import { KnowledgeBaseIngestionService } from './knowledge-base-ingestion.service';
import { KnowledgeBaseModelService } from './knowledge-base-model.service';
import { KnowledgeBaseParserService } from './knowledge-base-parser.service';
import { KnowledgeBaseRetrievalService } from './knowledge-base-retrieval.service';
import { KnowledgeBaseRerankService } from './knowledge-base-rerank.service';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KnowledgeBaseStorageService } from './knowledge-base-storage.service';

/**
 * 知识库模块
 *
 * 这层把“知识库 CRUD、文档上传、切片向量化、检索、问答”收口在同一个领域模块里，
 * 但依然按照 service 职责拆分，避免 RAG 全链路揉成一个超大 service。
 */
@Module({
  controllers: [KnowledgeBaseController],
  providers: [
    KnowledgeBaseService,
    KnowledgeBaseDocumentService,
    KnowledgeBaseIngestionService,
    KnowledgeBaseParserService,
    KnowledgeBaseStorageService,
    KnowledgeBaseRetrievalService,
    KnowledgeBaseModelService,
    KnowledgeBaseRerankService,
    KnowledgeBaseChatService,
  ],
})
export class KnowledgeBaseModule {}

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

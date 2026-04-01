import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import {
  KNOWLEDGE_BASE_IMPORT_ZIP_QUEUE_JOB_NAME,
  KNOWLEDGE_BASE_QUEUE_JOB_NAME,
  KNOWLEDGE_BASE_QUEUE_NAME,
} from '../redis/redis.constants';
import { KnowledgeBaseImportService } from './knowledge-base-import.service';
import { RedisService } from '../redis/redis.service';
import { KnowledgeBaseIngestionService } from './knowledge-base-ingestion.service';

/**
 * 知识库队列消费者
 *
 * 第一版 worker 仍然跑在主应用进程里，
 * 但已经把处理入口从 HTTP 请求生命周期里解耦出来，后续可以平滑拆到独立 worker。
 */
@Injectable()
export class KnowledgeBaseQueueWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KnowledgeBaseQueueWorker.name);
  private worker: Worker | null = null;

  constructor(
    private readonly redisService: RedisService,
    private readonly ingestionService: KnowledgeBaseIngestionService,
    private readonly importService: KnowledgeBaseImportService,
  ) {}

  onModuleInit() {
    const connection = this.redisService.createBullConnection();
    if (!connection) {
      this.logger.warn('未配置 Redis，知识库文档处理将退回应用内异步执行');
      return;
    }

    this.worker = new Worker(
      KNOWLEDGE_BASE_QUEUE_NAME,
      async (job) => {
        if (job.name === KNOWLEDGE_BASE_QUEUE_JOB_NAME) {
          await this.ingestionService.processDocument(job.data.documentId, {
            rethrowOnFailure: true,
          });
          return;
        }

        if (job.name === KNOWLEDGE_BASE_IMPORT_ZIP_QUEUE_JOB_NAME) {
          await this.importService.processImportJob(job.data.importJobId, {
            rethrowOnFailure: true,
          });
        }
      },
      {
        connection,
        concurrency: 2,
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(`文档处理任务完成: ${job.id}`);
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(`文档处理任务失败: ${job?.id} - ${error.message}`);
    });
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }
}

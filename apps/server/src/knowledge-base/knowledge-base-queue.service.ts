import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  KNOWLEDGE_BASE_IMPORT_ZIP_QUEUE_JOB_NAME,
  KNOWLEDGE_BASE_QUEUE_JOB_NAME,
  KNOWLEDGE_BASE_QUEUE_NAME,
} from '../redis/redis.constants';
import { RedisService } from '../redis/redis.service';

/**
 * 知识库队列生产者
 *
 * 上传接口只负责把“处理文档”投递到队列里，
 * 真正的解析、切片和向量化交给 worker 消费。
 */
@Injectable()
export class KnowledgeBaseQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(KnowledgeBaseQueueService.name);
  private readonly queue: Queue | null;

  constructor(private readonly redisService: RedisService) {
    const connection = this.redisService.createBullConnection();
    this.queue = connection
      ? new Queue(KNOWLEDGE_BASE_QUEUE_NAME, { connection })
      : null;
  }

  async enqueueDocumentIngestion(documentId: string) {
    if (!this.queue) {
      return false;
    }

    await this.queue.add(
      KNOWLEDGE_BASE_QUEUE_JOB_NAME,
      { documentId },
      {
        jobId: `document:${documentId}`,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 50,
        removeOnFail: 20,
      },
    );

    this.logger.log(`文档处理任务已入队: ${documentId}`);
    return true;
  }

  async enqueueZipImport(importJobId: string) {
    if (!this.queue) {
      return false;
    }

    await this.queue.add(
      KNOWLEDGE_BASE_IMPORT_ZIP_QUEUE_JOB_NAME,
      { importJobId },
      {
        jobId: `import:${importJobId}`,
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 3000,
        },
        removeOnComplete: 20,
        removeOnFail: 20,
      },
    );

    this.logger.log(`ZIP 导入任务已入队: ${importJobId}`);
    return true;
  }

  async onModuleDestroy() {
    if (this.queue) {
      await this.queue.close();
    }
  }
}

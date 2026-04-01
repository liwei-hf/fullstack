import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';

/**
 * 对象存储服务
 *
 * 统一封装 MinIO 的上传、下载和删除，业务层只关心 objectKey，不直接处理 SDK 细节。
 */
@Injectable()
export class KnowledgeBaseStorageService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeBaseStorageService.name);
  private client: Client | null = null;
  private readonly bucketName: string | null;

  constructor(private readonly configService: ConfigService) {
    this.bucketName = this.configService.get<string>('MINIO_BUCKET') ?? null;
  }

  // 模块启动时兜底初始化 bucket，减少首次上传时的环境依赖问题。
  async onModuleInit() {
    if (!this.isConfigured()) {
      this.logger.warn('MinIO 未配置，文档上传能力暂不可用');
      return;
    }

    this.client = new Client({
      endPoint: this.configService.get<string>('MINIO_ENDPOINT')!,
      port: Number(this.configService.get<string>('MINIO_PORT') || 9000),
      useSSL: this.configService.get<string>('MINIO_USE_SSL') === 'true',
      accessKey: this.configService.get<string>('MINIO_ACCESS_KEY')!,
      secretKey: this.configService.get<string>('MINIO_SECRET_KEY')!,
    });

    const exists = await this.client.bucketExists(this.bucketName!);
    if (!exists) {
      await this.client.makeBucket(this.bucketName!);
    }
  }

  // 上传原始文件到对象存储，供后续异步解析和重试使用。
  async uploadObject(objectKey: string, fileBuffer: Buffer, contentType: string) {
    const client = this.getClientOrThrow();

    await client.putObject(this.bucketName!, objectKey, fileBuffer, fileBuffer.length, {
      'Content-Type': contentType,
    });
  }

  // 下载对象时统一转成 Buffer，方便解析器直接消费。
  async getObjectBuffer(objectKey: string) {
    const client = this.getClientOrThrow();
    const stream = await client.getObject(this.bucketName!, objectKey);
    const chunks: Buffer[] = [];

    return new Promise<Buffer>((resolve, reject) => {
      stream.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  // 删除对象存储中的原始文件。
  async removeObject(objectKey: string) {
    const client = this.getClientOrThrow();
    await client.removeObject(this.bucketName!, objectKey);
  }

  private isConfigured() {
    return (
      !!this.configService.get<string>('MINIO_ENDPOINT') &&
      !!this.configService.get<string>('MINIO_ACCESS_KEY') &&
      !!this.configService.get<string>('MINIO_SECRET_KEY') &&
      !!this.bucketName
    );
  }

  // 没配置 MinIO 时直接阻断文档链路，避免静默失败。
  private getClientOrThrow() {
    if (!this.client || !this.bucketName) {
      throw new InternalServerErrorException('MinIO 未配置完成，暂时无法处理文档');
    }

    return this.client;
  }
}

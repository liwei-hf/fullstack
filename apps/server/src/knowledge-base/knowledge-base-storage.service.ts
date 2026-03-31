import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';

@Injectable()
export class KnowledgeBaseStorageService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeBaseStorageService.name);
  private client: Client | null = null;
  private readonly bucketName: string | null;

  constructor(private readonly configService: ConfigService) {
    this.bucketName = this.configService.get<string>('MINIO_BUCKET') ?? null;
  }

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

  async uploadObject(objectKey: string, fileBuffer: Buffer, contentType: string) {
    const client = this.getClientOrThrow();

    await client.putObject(this.bucketName!, objectKey, fileBuffer, fileBuffer.length, {
      'Content-Type': contentType,
    });
  }

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

  private getClientOrThrow() {
    if (!this.client || !this.bucketName) {
      throw new InternalServerErrorException('MinIO 未配置完成，暂时无法处理文档');
    }

    return this.client;
  }
}

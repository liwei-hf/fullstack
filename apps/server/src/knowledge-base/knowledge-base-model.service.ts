import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ZhipuAIEmbeddings } from '@langchain/community/embeddings/zhipuai';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';

interface ModelConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
}

@Injectable()
export class KnowledgeBaseModelService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * 聊天模型用于最终组织答案，和 embedding 模型分开配置，
   * 这样后面切供应商时不会影响向量维度和索引策略。
   */
  createChatModel(model?: string) {
    const resolvedModel =
      model ||
      this.configService.get<string>('ZHIPU_CHAT_MODEL') ||
      this.configService.get<string>('OPENAI_CHAT_MODEL') ||
      this.configService.get<string>('OPENAI_ANSWER_MODEL') ||
      this.configService.get<string>('OPENAI_MODEL');

    if (!resolvedModel) {
      throw new InternalServerErrorException('缺少 OPENAI_CHAT_MODEL 配置');
    }

    const { apiKey, baseURL } = this.resolveModelConfig({
      primaryApiKeyKey: 'ZHIPU_API_KEY',
      fallbackApiKeyKey: 'OPENAI_API_KEY',
      primaryBaseUrlKey: 'ZHIPU_BASE_URL',
      fallbackBaseUrlKey: 'OPENAI_BASE_URL',
      model: resolvedModel,
    });

    return new ChatOpenAI({
      apiKey,
      model: resolvedModel,
      configuration: this.buildConfiguration(baseURL),
      temperature: 0.3,
    });
  }

  /**
   * embedding 允许单独指定 base url 和 key，
   * 兼容“聊天走 DeepSeek、向量走 OpenAI”这类常见组合。
   */
  createEmbeddingModel() {
    const zhipuApiKey = this.configService.get<string>('ZHIPU_API_KEY');
    const zhipuModel = this.configService.get<string>('ZHIPU_EMBEDDING_MODEL');

    if (zhipuApiKey || zhipuModel) {
      if (!zhipuApiKey) {
        throw new InternalServerErrorException('缺少 ZHIPU_API_KEY 配置');
      }

      const embeddings = new ZhipuAIEmbeddings({
        apiKey: zhipuApiKey,
        modelName: this.toSupportedZhipuEmbeddingModel(zhipuModel),
      });

      return embeddings;
    }

    const model = this.configService.get<string>('OPENAI_EMBEDDING_MODEL');

    if (!model) {
      throw new InternalServerErrorException('缺少 OPENAI_EMBEDDING_MODEL 配置');
    }

    const { apiKey, baseURL } = this.resolveModelConfig({
      primaryApiKeyKey: 'ZHIPU_API_KEY',
      fallbackApiKeyKey: 'OPENAI_EMBEDDING_API_KEY',
      primaryBaseUrlKey: 'ZHIPU_BASE_URL',
      fallbackBaseUrlKey: 'OPENAI_EMBEDDING_BASE_URL',
      model,
    });

    if (baseURL?.includes('deepseek.com') && !this.configService.get<string>('OPENAI_EMBEDDING_BASE_URL')) {
      throw new InternalServerErrorException(
        '当前聊天模型走的是 DeepSeek 兼容地址，请单独配置 OPENAI_EMBEDDING_BASE_URL 和 OPENAI_EMBEDDING_API_KEY',
      );
    }

    return new OpenAIEmbeddings({
      apiKey,
      model,
      configuration: this.buildConfiguration(baseURL),
    });
  }

  getRerankConfig(): ModelConfig | null {
    const model =
      this.configService.get<string>('ZHIPU_RERANK_MODEL') ||
      this.configService.get<string>('OPENAI_RERANK_MODEL');
    if (!model) {
      return null;
    }

    return this.resolveModelConfig({
      primaryApiKeyKey: 'ZHIPU_API_KEY',
      fallbackApiKeyKey: 'OPENAI_RERANK_API_KEY',
      primaryBaseUrlKey: 'ZHIPU_BASE_URL',
      fallbackBaseUrlKey: 'OPENAI_RERANK_BASE_URL',
      model,
    });
  }

  private getRequiredConfig(key: string) {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new InternalServerErrorException(`缺少 ${key} 配置`);
    }
    return value;
  }

  private buildConfiguration(baseURL?: string) {
    return baseURL ? { baseURL } : undefined;
  }

  private toSupportedZhipuEmbeddingModel(model?: string): 'embedding-2' | 'embedding-3' {
    if (model === 'embedding-2' || model === 'embedding-3') {
      return model;
    }

    return 'embedding-3';
  }

  private resolveModelConfig(options: {
    primaryApiKeyKey: string;
    fallbackApiKeyKey?: string;
    primaryBaseUrlKey?: string;
    fallbackBaseUrlKey?: string;
    model: string;
  }): ModelConfig {
    const apiKey =
      this.configService.get<string>(options.primaryApiKeyKey) ||
      (options.fallbackApiKeyKey
        ? this.configService.get<string>(options.fallbackApiKeyKey)
        : undefined);

    if (!apiKey) {
      throw new InternalServerErrorException(
        `缺少 ${options.primaryApiKeyKey}${options.fallbackApiKeyKey ? ` 或 ${options.fallbackApiKeyKey}` : ''} 配置`,
      );
    }

    const baseURL =
      (options.primaryBaseUrlKey
        ? this.configService.get<string>(options.primaryBaseUrlKey)
        : undefined) ||
      (options.fallbackBaseUrlKey
        ? this.configService.get<string>(options.fallbackBaseUrlKey)
        : undefined);

    return {
      apiKey,
      baseURL,
      model: options.model,
    };
  }
}

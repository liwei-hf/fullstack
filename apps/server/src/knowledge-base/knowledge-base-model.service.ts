import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ZhipuAIEmbeddings } from '@langchain/community/embeddings/zhipuai';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';

interface ModelConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
}

interface ResolvedModelInfo {
  provider: 'zhipu' | 'openai-compatible';
  model: string;
  baseURL?: string;
}

/**
 * 模型配置服务
 *
 * 把聊天、embedding、rerank 三类模型的配置入口统一收口，
 * 这样后续切供应商时不会把模型细节散落到问答、检索、上传等业务 service 里。
 */
@Injectable()
export class KnowledgeBaseModelService {
  constructor(private readonly configService: ConfigService) { }

  // 返回当前实际生效的聊天模型信息，主要用于日志和排查耗时。
  getChatModelInfo(model?: string): ResolvedModelInfo {
    const resolvedModel =
      model ||
      this.configService.get<string>('ZHIPU_CHAT_MODEL') ||
      this.configService.get<string>('OPENAI_CHAT_MODEL') ||
      this.configService.get<string>('OPENAI_ANSWER_MODEL') ||
      this.configService.get<string>('OPENAI_MODEL');

    if (!resolvedModel) {
      throw new InternalServerErrorException('缺少 OPENAI_CHAT_MODEL 配置');
    }

    const usingZhipu = Boolean(this.configService.get<string>('ZHIPU_CHAT_MODEL'));
    const baseURL = usingZhipu
      ? this.configService.get<string>('ZHIPU_BASE_URL')
      : this.configService.get<string>('OPENAI_BASE_URL');

    return {
      provider: usingZhipu ? 'zhipu' : 'openai-compatible',
      model: resolvedModel,
      baseURL,
    };
  }

  /**
   * 聊天模型用于最终组织答案，和 embedding 模型分开配置，
   * 这样后面切供应商时不会影响向量维度和索引策略。
   */
  createChatModel(model?: string) {
    const chatModelInfo = this.getChatModelInfo(model);

    const { apiKey, baseURL } = this.resolveModelConfig({
      primaryApiKeyKey: 'ZHIPU_API_KEY',
      fallbackApiKeyKey: 'OPENAI_API_KEY',
      primaryBaseUrlKey: 'ZHIPU_BASE_URL',
      fallbackBaseUrlKey: 'OPENAI_BASE_URL',
      model: chatModelInfo.model,
    });

    return new ChatOpenAI({
      apiKey,
      model: chatModelInfo.model,
      configuration: this.buildConfiguration(baseURL),
      temperature: 0.3,
    });
  }

  // embedding 模型也单独暴露一份元信息，方便检索日志明确“当前到底用的是谁”。
  getEmbeddingModelInfo(): ResolvedModelInfo {
    const zhipuApiKey = this.configService.get<string>('ZHIPU_API_KEY');
    const zhipuModel = this.configService.get<string>('ZHIPU_EMBEDDING_MODEL');

    if (zhipuApiKey || zhipuModel) {
      return {
        provider: 'zhipu',
        model: this.toSupportedZhipuEmbeddingModel(zhipuModel),
        baseURL: this.configService.get<string>('ZHIPU_BASE_URL'),
      };
    }

    const model = this.configService.get<string>('OPENAI_EMBEDDING_MODEL');
    if (!model) {
      throw new InternalServerErrorException('缺少 OPENAI_EMBEDDING_MODEL 配置');
    }

    return {
      provider: 'openai-compatible',
      model,
      baseURL: this.configService.get<string>('OPENAI_EMBEDDING_BASE_URL'),
    };
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

  // rerank 模型允许关闭，因此这里返回 null 而不是强制要求一定有配置。
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

  // 和聊天、embedding 一样，把 rerank 的实际模型信息显式暴露出来，便于日志定位。
  getRerankModelInfo(): ResolvedModelInfo | null {
    const model =
      this.configService.get<string>('ZHIPU_RERANK_MODEL') ||
      this.configService.get<string>('OPENAI_RERANK_MODEL');

    if (!model) {
      return null;
    }

    const usingZhipu = Boolean(this.configService.get<string>('ZHIPU_RERANK_MODEL'));

    return {
      provider: usingZhipu ? 'zhipu' : 'openai-compatible',
      model,
      baseURL: usingZhipu
        ? this.configService.get<string>('ZHIPU_BASE_URL')
        : this.configService.get<string>('OPENAI_RERANK_BASE_URL'),
    };
  }

  private buildConfiguration(baseURL?: string) {
    return baseURL ? { baseURL } : undefined;
  }

  // 当前智谱 embeddings 只支持固定枚举值，这里做一次保护，避免配置写错直接崩。
  private toSupportedZhipuEmbeddingModel(model?: string): 'embedding-2' | 'embedding-3' {
    if (model === 'embedding-2' || model === 'embedding-3') {
      return model;
    }

    return 'embedding-3';
  }

  // 统一处理“主供应商 + 兼容供应商”的配置优先级，减少多处重复读取环境变量。
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

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiSqlError } from './ai.errors';
import { ChatMessage } from './ai.types';

interface CompletionOptions {
  messages: ChatMessage[];
  temperature?: number;
  model?: string;
}

@Injectable()
export class OpenAiCompatibleProvider {
  constructor(private readonly configService: ConfigService) {}

  async generateText(options: CompletionOptions) {
    // 第一阶段用于“问题 -> SQL”，这里走非流式，便于先拿到完整 SQL 再做服务端校验。
    const response = await fetch(this.getEndpoint(), {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.getModel(options.model),
        temperature: options.temperature ?? 0.1,
        stream: false,
        messages: options.messages,
      }),
    });

    if (!response.ok) {
      throw new AiSqlError('AI_SQL_STREAM_FAILED', '模型服务调用失败');
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new AiSqlError('AI_SQL_STREAM_FAILED', '模型未返回有效内容');
    }

    return content;
  }

  async streamText(options: CompletionOptions, onDelta: (delta: string) => void) {
    // 第二阶段用于“查询结果 -> 自然语言答案”，这里走流式，把答案边生成边回给前端。
    const response = await fetch(this.getEndpoint(), {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.getModel(options.model),
        temperature: options.temperature ?? 0.3,
        stream: true,
        messages: options.messages,
      }),
    });

    if (!response.ok || !response.body) {
      throw new AiSqlError('AI_SQL_STREAM_FAILED', '模型流式输出失败');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        // OpenAI 兼容 SSE 每个事件块里可能有多行 data，这里统一提取后逐条解析。
        const dataLines = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim());

        for (const data of dataLines) {
          if (!data || data === '[DONE]') {
            continue;
          }

          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };

          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            onDelta(delta);
          }
        }
      }
    }
  }

  private getHeaders() {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new AiSqlError('AI_SQL_STREAM_FAILED', '缺少 OPENAI_API_KEY 配置');
    }

    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };
  }

  private getEndpoint() {
    // 通过 OPENAI_BASE_URL 做兼容层，既能接 OpenAI，也能接 DeepSeek 这类兼容接口。
    const baseUrl = this.configService.get<string>('OPENAI_BASE_URL') || 'https://api.openai.com/v1';
    return `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  }

  private getModel(modelOverride?: string) {
    const model = modelOverride || this.configService.get<string>('OPENAI_MODEL');
    if (!model) {
      throw new AiSqlError('AI_SQL_STREAM_FAILED', '缺少 OPENAI_MODEL 配置');
    }
    return model;
  }
}

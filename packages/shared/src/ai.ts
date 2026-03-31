/**
 * AI SQL 流式查询相关类型定义
 *
 * 用途说明：
 * - 描述自然语言查数接口的请求参数
 * - 统一前后端流式事件的数据结构
 * - 约束关键数字摘要的展示模型
 */

export interface AiSqlStreamRequest {
  question: string;
}

export interface AiSqlSummaryItem {
  label: string;
  value: string | number;
}

export type AiSqlSseEvent =
  | {
      type: 'meta';
      requestId: string;
      role: 'admin' | 'user';
      timestamp: string;
    }
  | {
      type: 'sql_generated';
      sql: string;
    }
  | {
      type: 'answer_delta';
      delta: string;
    }
  | {
      type: 'summary';
      items: AiSqlSummaryItem[];
    }
  | {
      type: 'done';
      durationMs: number;
      rowCount: number;
      truncated: boolean;
    }
  | {
      type: 'error';
      code: string;
      message: string;
    };

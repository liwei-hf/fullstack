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
  sessionId?: string;
}

export interface AiSqlSummaryItem {
  label: string;
  value: string | number;
}

export type AiSqlSseEvent =
  | {
      type: 'meta';
      requestId: string;
      sessionId: string;
      role: 'admin' | 'user';
      timestamp: string;
    }
  | {
      type: 'thinking_delta';
      delta: string;
    }
  | {
      type: 'thinking_done';
    }
  | {
      type: 'sql_generated';
      sql: string;
    }
  | {
      type: 'loading';
      stage: 'generating_sql' | 'executing_sql' | 'generating_answer';
      message: string;
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

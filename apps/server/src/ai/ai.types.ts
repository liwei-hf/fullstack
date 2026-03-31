export interface AiSqlUserContext {
  sub: string;
  role: 'admin' | 'user';
  status: string;
}

export interface SqlValidationContext {
  role: 'admin' | 'user';
  userId: string;
}

export interface SqlValidationResult {
  normalizedSql: string;
  truncated: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class AiSqlError extends Error {
  constructor(
    public readonly code:
      | 'AI_SQL_INVALID'
      | 'AI_SQL_UNSAFE'
      | 'AI_SQL_UNSUPPORTED'
      | 'AI_SQL_EXECUTION_FAILED'
      | 'AI_SQL_STREAM_FAILED',
    message: string,
  ) {
    super(message);
  }
}

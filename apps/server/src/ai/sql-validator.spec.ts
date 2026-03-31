import { SqlValidator } from './sql-validator';

describe('SqlValidator', () => {
  const validator = new SqlValidator();
  const userContext = { role: 'user' as const, userId: 'user-1' };
  const adminContext = { role: 'admin' as const, userId: 'admin-1' };

  it('should append limit when missing', () => {
    const result = validator.validate('SELECT "Todo"."status" FROM "Todo"', adminContext);
    expect(result.normalizedSql).toContain('LIMIT 50');
    expect(result.truncated).toBe(true);
  });

  it('should reject unsafe write statements', () => {
    expect(() =>
      validator.validate('DELETE FROM "Todo"', adminContext),
    ).toThrow('只允许生成 SELECT 查询');
  });

  it('should reject unsupported tables', () => {
    expect(() =>
      validator.validate('SELECT * FROM "Session"', adminContext),
    ).toThrow('SQL 访问了不支持的表');
  });

  it('should reject user detail query without current user filter', () => {
    expect(() =>
      validator.validate(
        'SELECT "User"."username" FROM "User" LIMIT 10',
        userContext,
      ),
    ).toThrow('普通用户只能查看自己的明细数据');
  });

  it('should allow user aggregate statistics query', () => {
    const result = validator.validate(
      'SELECT "Todo"."status", COUNT(*) AS "count" FROM "Todo" GROUP BY "Todo"."status"',
      userContext,
    );

    expect(result.normalizedSql).toContain('LIMIT 50');
  });

  it('should allow user self todo detail query', () => {
    const result = validator.validate(
      `SELECT "Todo"."title", "Todo"."status" FROM "Todo" WHERE "Todo"."userId" = 'user-1' LIMIT 20`,
      userContext,
    );

    expect(result.normalizedSql).toContain(`'user-1'`);
    expect(result.truncated).toBe(false);
  });
});

export type DbDialect = 'sqlite-node' | 'sqljs-browser' | 'd1';

export interface DbRunResult {
  lastInsertRowid: number;
  changes: number;
}

export interface DbClient {
  readonly dialect: DbDialect;
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<DbRunResult>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T>;
}

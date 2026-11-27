import type { DbClient, DbRunResult } from './dbClient.ts';

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<{ success: boolean; meta: { last_row_id?: number; changes?: number } }>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean }>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<unknown[]>;
  exec(query: string): Promise<unknown>;
}

function normalizeD1Params(params: unknown[] = []): unknown[] {
  return params.map((p) => {
    if (p === undefined || p === null) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });
}

export function createD1DbClient(d1: D1Database): DbClient {
  const client: DbClient = {
    dialect: 'd1',
    async get<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
      const bound = normalizeD1Params(params);
      const stmt = bound.length > 0 ? d1.prepare(sql).bind(...bound) : d1.prepare(sql);
      const row = await stmt.first<T>();
      return row ?? undefined;
    },
    async all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
      const bound = normalizeD1Params(params);
      const stmt = bound.length > 0 ? d1.prepare(sql).bind(...bound) : d1.prepare(sql);
      const res = await stmt.all<T>();
      return res.results ?? [];
    },
    async run(sql: string, params: unknown[] = []): Promise<DbRunResult> {
      const bound = normalizeD1Params(params);
      const stmt = bound.length > 0 ? d1.prepare(sql).bind(...bound) : d1.prepare(sql);
      const res = await stmt.run();
      return {
        lastInsertRowid: Number(res.meta?.last_row_id ?? 0),
        changes: Number(res.meta?.changes ?? 0),
      };
    },
    async exec(sql: string): Promise<void> {
      await d1.exec(sql);
    },
    async transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
      // D1 executes statements in implicit transactions and disallows manual BEGIN/COMMIT SQL
      return fn(client);
    },
  };
  return client;
}

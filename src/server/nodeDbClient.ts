import type Database from 'better-sqlite3';
import crypto from 'crypto';
import type { DbClient, DbRunResult } from './dbClient.ts';

function normalizeNodeParams(params: unknown[] = []): unknown[] {
  return params.map((p) => {
    if (p === undefined || p === null) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });
}

function wrapNodeSqlite(sqliteDb: Database.Database, isInsideTx: boolean, queueRef: { tail: Promise<unknown> }): DbClient {
  return {
    dialect: 'sqlite-node',
    async get<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
      return sqliteDb.prepare(sql).get(...normalizeNodeParams(params)) as T | undefined;
    },
    async all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
      return sqliteDb.prepare(sql).all(...normalizeNodeParams(params)) as T[];
    },
    async run(sql: string, params: unknown[] = []): Promise<DbRunResult> {
      const info = sqliteDb.prepare(sql).run(...normalizeNodeParams(params));
      return {
        lastInsertRowid: Number(info.lastInsertRowid),
        changes: Number(info.changes),
      };
    },
    async exec(sql: string): Promise<void> {
      sqliteDb.exec(sql);
    },
    async transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
      if (isInsideTx) {
        return fn(this);
      }
      const runSerialized = async (): Promise<T> => {
        sqliteDb.exec('BEGIN IMMEDIATE');
        try {
          const txClient = wrapNodeSqlite(sqliteDb, true, queueRef);
          const result = await fn(txClient);
          sqliteDb.exec('COMMIT');
          return result;
        } catch (err) {
          try {
            sqliteDb.exec('ROLLBACK');
          } catch {
            // ignore rollback error
          }
          throw err;
        }
      };
      const next = queueRef.tail.then(runSerialized, runSerialized);
      queueRef.tail = next.catch(() => undefined);
      return next;
    },
  };
}

export function createNodeDbClient(sqliteDb: Database.Database): DbClient {
  return wrapNodeSqlite(sqliteDb, false, { tail: Promise.resolve() });
}

export function verifyLegacyScryptPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

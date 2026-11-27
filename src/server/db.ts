import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { DbClient } from './dbClient.ts';
import { createNodeDbClient } from './nodeDbClient.ts';
import { initSchemaAsync, seedBaselineConfigAsync } from './schema.ts';

let dbInstance: Database.Database | null = null;
let nodeClientInstance: DbClient | null = null;

export function openRawSqlite(customPath?: string): Database.Database {
  const dbPath = customPath || path.resolve(process.cwd(), 'data', 'bepari.db');
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  return db;
}

export async function createInitializedNodeDbClient(customPath?: string): Promise<{
  rawDb: Database.Database;
  db: DbClient;
}> {
  if (!customPath && dbInstance && nodeClientInstance) {
    return { rawDb: dbInstance, db: nodeClientInstance };
  }
  const rawDb = openRawSqlite(customPath);
  const client = createNodeDbClient(rawDb);
  await initSchemaAsync(client);
  await seedBaselineConfigAsync(client);

  if (!customPath) {
    dbInstance = rawDb;
    nodeClientInstance = client;
  }
  return { rawDb, db: client };
}

export function getDb(customPath?: string): Database.Database {
  if (dbInstance && !customPath) {
    return dbInstance;
  }
  const db = openRawSqlite(customPath);
  if (!customPath) {
    dbInstance = db;
  }
  return db;
}

export { initSchemaAsync, seedBaselineConfigAsync };

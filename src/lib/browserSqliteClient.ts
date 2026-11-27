import initSqlJs, { type Database as SqlJsDatabase, type SqlValue } from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type { DbClient, DbRunResult } from '../server/dbClient.ts';
import { initSchemaAsync, seedBaselineConfigAsync } from '../server/schema.ts';

const IDB_NAME = 'bepari_device_sqlite_v1';
const IDB_STORE = 'snapshots';
const IDB_KEY = 'primary';

function normalizeParams(params: unknown[] = []): SqlValue[] {
  return params.map((p) => {
    if (p === undefined || p === null) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (typeof p === 'number' || typeof p === 'string' || p instanceof Uint8Array) return p;
    return String(p);
  });
}

function openSnapshotIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable in this browser environment.'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB.'));
  });
}

async function loadSnapshotBytes(): Promise<Uint8Array | null> {
  try {
    const idb = await openSnapshotIdb();
    return await new Promise((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_KEY);
      req.onsuccess = () => {
        const val = req.result;
        if (val instanceof Uint8Array) resolve(val);
        else if (val instanceof ArrayBuffer) resolve(new Uint8Array(val));
        else resolve(null);
      };
      req.onerror = () => reject(req.error || new Error('Failed to read database snapshot.'));
    });
  } catch {
    return null;
  }
}

async function saveSnapshotBytes(bytes: Uint8Array): Promise<void> {
  try {
    const idb = await openSnapshotIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(bytes, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to persist database snapshot.'));
    });
  } catch (err) {
    console.warn('IndexedDB persistence warning:', err);
  }
}

let sqlJsEnginePromise: Promise<Awaited<ReturnType<typeof initSqlJs>>> | null = null;
async function getSqlJsEngine() {
  if (!sqlJsEnginePromise) {
    sqlJsEnginePromise = initSqlJs({
      locateFile: () => sqlWasmUrl,
    });
  }
  return sqlJsEnginePromise;
}

interface Holder {
  sqlDb: SqlJsDatabase;
  queueTail: Promise<unknown>;
  client: DbClient;
}

let activeHolder: Holder | null = null;
let initPromise: Promise<DbClient> | null = null;

function createSqlJsWrapper(
  holder: Holder,
  isInsideTx: boolean
): DbClient {
  const persist = async () => {
    await saveSnapshotBytes(holder.sqlDb.export());
  };

  return {
    dialect: 'sqljs-browser',
    async get<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
      const stmt = holder.sqlDb.prepare(sql);
      try {
        if (params.length > 0) stmt.bind(normalizeParams(params));
        if (!stmt.step()) return undefined;
        return stmt.getAsObject() as T;
      } finally {
        stmt.free();
      }
    },
    async all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
      const stmt = holder.sqlDb.prepare(sql);
      try {
        if (params.length > 0) stmt.bind(normalizeParams(params));
        const rows: T[] = [];
        while (stmt.step()) {
          rows.push(stmt.getAsObject() as T);
        }
        return rows;
      } finally {
        stmt.free();
      }
    },
    async run(sql: string, params: unknown[] = []): Promise<DbRunResult> {
      const stmt = holder.sqlDb.prepare(sql);
      try {
        if (params.length > 0) stmt.bind(normalizeParams(params));
        stmt.step();
      } finally {
        stmt.free();
      }
      const idRes = holder.sqlDb.exec('SELECT last_insert_rowid() as id, changes() as ch');
      const row = idRes[0]?.values?.[0];
      const result: DbRunResult = {
        lastInsertRowid: Number(row?.[0] ?? 0),
        changes: Number(row?.[1] ?? 0),
      };
      if (!isInsideTx && !/^\s*(CREATE|PRAGMA)/i.test(sql)) {
        await persist();
      }
      return result;
    },
    async exec(sql: string): Promise<void> {
      holder.sqlDb.exec(sql);
      if (!isInsideTx) {
        await persist();
      }
    },
    async transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
      if (isInsideTx) {
        return fn(this);
      }
      const runSerialized = async (): Promise<T> => {
        holder.sqlDb.exec('BEGIN TRANSACTION');
        try {
          const txClient = createSqlJsWrapper(holder, true);
          const result = await fn(txClient);
          holder.sqlDb.exec('COMMIT');
          await persist();
          return result;
        } catch (err) {
          try {
            holder.sqlDb.exec('ROLLBACK');
          } catch {
            // ignore rollback error
          }
          throw err;
        }
      };
      const next = holder.queueTail.then(runSerialized, runSerialized);
      holder.queueTail = next.catch(() => undefined);
      return next;
    },
  };
}

export async function getBrowserSqliteClient(): Promise<DbClient> {
  if (activeHolder) return activeHolder.client;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const SQL = await getSqlJsEngine();
    const savedBytes = await loadSnapshotBytes();
    const sqlDb = savedBytes && savedBytes.length > 0 ? new SQL.Database(savedBytes) : new SQL.Database();
    sqlDb.exec('PRAGMA foreign_keys = ON;');

    const holder: Holder = {
      sqlDb,
      queueTail: Promise.resolve(),
      client: null as unknown as DbClient,
    };
    holder.client = createSqlJsWrapper(holder, false);

    await initSchemaAsync(holder.client);
    await seedBaselineConfigAsync(holder.client);
    await saveSnapshotBytes(holder.sqlDb.export());

    activeHolder = holder;
    return holder.client;
  })();

  return initPromise;
}

export async function persistBrowserSqliteSnapshot(): Promise<void> {
  if (!activeHolder) return;
  await saveSnapshotBytes(activeHolder.sqlDb.export());
}

export async function exportBrowserSqliteBytes(): Promise<Uint8Array> {
  await getBrowserSqliteClient();
  return activeHolder!.sqlDb.export();
}

export async function importBrowserSqliteBytes(bytes: Uint8Array): Promise<void> {
  const header = new TextDecoder().decode(bytes.slice(0, 15));
  if (header !== 'SQLite format 3') {
    throw new Error('Selected file is not a valid SQLite database (.sqlite / .db).');
  }
  const SQL = await getSqlJsEngine();
  const candidateDb = new SQL.Database(bytes);
  candidateDb.exec('PRAGMA foreign_keys = ON;');

  const tempHolder: Holder = {
    sqlDb: candidateDb,
    queueTail: Promise.resolve(),
    client: null as unknown as DbClient,
  };
  tempHolder.client = createSqlJsWrapper(tempHolder, false);
  await initSchemaAsync(tempHolder.client);
  await seedBaselineConfigAsync(tempHolder.client);
  const verifiedBytes = candidateDb.export();
  await saveSnapshotBytes(verifiedBytes);

  if (activeHolder) {
    activeHolder.sqlDb.close();
  }
  activeHolder = tempHolder;
  initPromise = Promise.resolve(tempHolder.client);
}

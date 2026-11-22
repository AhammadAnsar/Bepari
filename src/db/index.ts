import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { PgliteDatabase } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import * as schema from './schema.ts';
import {
  EnvironmentValidationReport,
  evaluateEnvironmentConfig,
} from '../server/shared/config.ts';

export type BepariDb = NodePgDatabase<typeof schema> | PgliteDatabase<typeof schema>;

export class BlockedDatabaseError extends Error {
  public readonly code = 'BLOCKED_DATABASE';
  public readonly statusCode = 503;
  public readonly details: {
    cloudSqlEligibility: string;
    requiredEnvVars: string[];
    messageBn: string;
    messageEn: string;
  };

  constructor(reason?: string) {
    const messageEn =
      reason ||
      'BLOCKED_DATABASE: PostgreSQL connection is not configured. Cloud SQL Developer Edition provisioning returned NO_VALID_PROJECT, and no external PostgreSQL credentials (SQL_HOST or PGHOST) are set. Refusing to fall back to Firestore, SQLite, localStorage, or mock in-memory data.';
    super(messageEn);
    this.name = 'BlockedDatabaseError';
    this.details = {
      cloudSqlEligibility: 'NO_VALID_PROJECT (No valid GCP project found with owner permissions and active billing)',
      requiredEnvVars: ['SQL_HOST', 'SQL_DB_NAME', 'SQL_USER', 'SQL_PASSWORD', 'PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'],
      messageBn:
        'ডাটাবেস সংযোগ স্থগিত (BLOCKED_DATABASE): PostgreSQL কনফিগার করা নেই। আর্থিক তথ্যের নিরাপত্তার জন্য Firestore বা localStorage-এ ফলব্যাক নিষিদ্ধ। অনুগ্রহ করে Cloud SQL বা এক্সটার্নাল PostgreSQL সংযোগ সেট করুন।',
      messageEn,
    };
  }
}

declare global {
  var _postgresPool: Pool | undefined;
  var _disposableTestDb: BepariDb | undefined;
}

export function isDatabaseConfigured(): boolean {
  if (global._disposableTestDb) {
    return true;
  }
  const host = process.env.SQL_HOST || process.env.PGHOST;
  const database = process.env.SQL_DB_NAME || process.env.PGDATABASE;
  const user = process.env.SQL_USER || process.env.PGUSER;
  return Boolean(host && database && user);
}

export function setDisposableTestDb(testDb: BepariDb | undefined): void {
  global._disposableTestDb = testDb;
}

export const createPool = (): Pool => {
  if (!isDatabaseConfigured()) {
    throw new BlockedDatabaseError();
  }
  if (!global._postgresPool) {
    const host = process.env.SQL_HOST || process.env.PGHOST;
    const user = process.env.SQL_USER || process.env.PGUSER;
    const password = process.env.SQL_PASSWORD || process.env.PGPASSWORD;
    const database = process.env.SQL_DB_NAME || process.env.PGDATABASE;
    const port = process.env.PGPORT ? Number(process.env.PGPORT) : 5432;

    global._postgresPool = new Pool({
      host,
      user,
      password,
      database,
      port,
      max: 10,
      connectionTimeoutMillis: 15000,
    });

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

export function getDb(): BepariDb {
  if (global._disposableTestDb) {
    return global._disposableTestDb;
  }
  const pool = createPool();
  return drizzle(pool, { schema });
}

/**
 * Executes a callback inside a PostgreSQL transaction with the tenant context
 * set via `SET LOCAL app.current_organization_id = '<orgId>'` for Row-Level Security (RLS).
 */
export async function withTenantTransaction<T>(
  organizationId: string,
  fn: (tx: BepariDb) => Promise<T>
): Promise<T> {
  const db = getDb();
  return await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.current_organization_id', ${organizationId}, true)`
    );
    return await fn(tx as unknown as BepariDb);
  });
}


export async function checkDatabaseReadiness(): Promise<{
  ready: boolean;
  status: 'ready' | 'blocked';
  code: 'READY' | 'BLOCKED_DATABASE' | 'BLOCKED_AUTH_CONFIG';
  engine: 'postgresql';
  adapter: 'cloudsql-or-external-pg' | 'disposable-pg-test';
  details: Record<string, unknown>;
  environmentReport: EnvironmentValidationReport;
}> {
  const envReport = evaluateEnvironmentConfig({
    hasDisposableTestDb: Boolean(global._disposableTestDb),
  });

  if (!isDatabaseConfigured()) {
    const err = new BlockedDatabaseError();
    return {
      ready: false,
      status: 'blocked',
      code: 'BLOCKED_DATABASE',
      engine: 'postgresql',
      adapter: 'cloudsql-or-external-pg',
      details: err.details,
      environmentReport: envReport,
    };
  }

  try {
    const db = getDb();
    await db.execute(sql`SELECT 1 AS ok`);

    if (!envReport.authSecretConfigured) {
      return {
        ready: false,
        status: 'blocked',
        code: 'BLOCKED_AUTH_CONFIG',
        engine: 'postgresql',
        adapter: global._disposableTestDb ? 'disposable-pg-test' : 'cloudsql-or-external-pg',
        details: {
          requiredEnvVars: ['SESSION_SECRET'],
          messageBn:
            'প্রমাণীকরণ স্থগিত (BLOCKED_AUTH_CONFIG): PostgreSQL সংযুক্ত থাকলেও SESSION_SECRET (কমপক্ষে ৩২ অক্ষর) কনফিগার করা নেই।',
          messageEn:
            'BLOCKED_AUTH_CONFIG: PostgreSQL is connected, but SESSION_SECRET (minimum 32 characters) is not configured. Refusing to start authenticated functionality with a fabricated secret.',
        },
        environmentReport: envReport,
      };
    }

    return {
      ready: true,
      status: 'ready',
      code: 'READY',
      engine: 'postgresql',
      adapter: global._disposableTestDb ? 'disposable-pg-test' : 'cloudsql-or-external-pg',
      details: {
        messageBn: 'PostgreSQL ডাটাবেস সংযোগ, স্কিমা ও SESSION_SECRET প্রস্তুত।',
        messageEn: 'PostgreSQL database connection, schema, and SESSION_SECRET are ready.',
      },
      environmentReport: envReport,
    };
  } catch (error) {
    console.error('Database readiness check failed:', error);
    const err = new BlockedDatabaseError(
      'BLOCKED_DATABASE: PostgreSQL connection probe failed. Verify SQL_HOST/PGHOST credentials and network reachability.'
    );
    return {
      ready: false,
      status: 'blocked',
      code: 'BLOCKED_DATABASE',
      engine: 'postgresql',
      adapter: 'cloudsql-or-external-pg',
      details: err.details,
      environmentReport: envReport,
    };
  }
}

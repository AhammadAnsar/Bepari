import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

export async function runMigrationsOnPool(pool: Pool): Promise<string[]> {
  const migrationPath = path.resolve(process.cwd(), 'drizzle/0000_phase0_foundation.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf-8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS _bepari_migrations (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    const existing = await client.query(
      `SELECT id FROM _bepari_migrations WHERE id = $1`,
      ['0000_phase0_foundation']
    );

    const applied: string[] = [];
    if (existing.rowCount === 0) {
      await client.query(migrationSql);
      await client.query(
        `INSERT INTO _bepari_migrations (id) VALUES ($1)`,
        ['0000_phase0_foundation']
      );
      applied.push('0000_phase0_foundation');
    }

    await client.query('COMMIT');
    return applied;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  const host = process.env.SQL_HOST || process.env.PGHOST;
  const user = process.env.SQL_ADMIN_USER || process.env.PGUSER || process.env.SQL_USER;
  const password =
    process.env.SQL_ADMIN_PASSWORD || process.env.PGPASSWORD || process.env.SQL_PASSWORD;
  const database = process.env.SQL_DB_NAME || process.env.PGDATABASE;
  const port = process.env.PGPORT ? Number(process.env.PGPORT) : 5432;

  if (!host || !user || !database) {
    console.error(
      'BLOCKED_DATABASE: Cannot apply migrations because PostgreSQL environment variables (SQL_HOST/PGHOST, SQL_DB_NAME/PGDATABASE, SQL_ADMIN_USER/PGUSER) are not configured.'
    );
    process.exit(1);
  }

  const pool = new Pool({ host, user, password, database, port });
  try {
    const applied = await runMigrationsOnPool(pool);
    console.log(
      applied.length > 0
        ? `Applied migrations: ${applied.join(', ')}`
        : 'All Phase 0 migrations are already up to date.'
    );
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

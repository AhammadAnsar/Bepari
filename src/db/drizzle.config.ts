import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

const sqlHost = process.env.SQL_HOST || process.env.PGHOST;
const sqlDbName = process.env.SQL_DB_NAME || process.env.PGDATABASE;
const user = process.env.SQL_ADMIN_USER || process.env.PGUSER;
const password = process.env.SQL_ADMIN_PASSWORD || process.env.PGPASSWORD;

if (!sqlHost || !sqlDbName || !user || !password) {
  throw new Error(
    'BLOCKED_DATABASE: SQL_HOST/PGHOST, SQL_DB_NAME/PGDATABASE, SQL_ADMIN_USER/PGUSER, and SQL_ADMIN_PASSWORD/PGPASSWORD must be set in environment variables to run Drizzle Kit migrations.'
  );
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['public'],
  dbCredentials: {
    host: sqlHost,
    user,
    password,
    database: sqlDbName,
    ssl: false,
  },
  verbose: true,
});

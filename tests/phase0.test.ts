import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../src/db/schema.ts';
import { setDisposableTestDb } from '../src/db/index.ts';
import { apiApp } from '../src/server/app.ts';
import {
  addMoney,
  compareMoney,
  isValidMoneyString,
  subtractMoney,
  verifyBalancedJournalLines,
} from '../src/server/shared/decimal.ts';
import {
  evaluateEnvironmentConfig,
  resolveLogLevel,
  resolveTrustedProxyHops,
} from '../src/server/shared/config.ts';

async function jsonReq(
  urlPath: string,
  options: {
    method?: string;
    token?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
) {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers || {}),
  };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const req = new Request(`http://localhost:3000${urlPath}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const res = await apiApp.fetch(req);
  const payload = await res.json();
  return { status: res.status, payload };
}

test('Unit: Decimal.js monetary precision and balanced journal line verification', () => {
  assert.equal(isValidMoneyString('11500.000000'), true);
  assert.equal(isValidMoneyString('11500.1234567'), false);
  assert.equal(isValidMoneyString(11500), false);

  assert.equal(addMoney('10000.000000', '1500.000000'), '11500.000000');
  assert.equal(subtractMoney('11500.000000', '5000.000000'), '6500.000000');
  assert.equal(compareMoney('6500.000000', '6500.00'), 0);

  const valid = verifyBalancedJournalLines([
    { debit: '11500.000000', credit: '0.000000' },
    { debit: '0.000000', credit: '10000.000000' },
    { debit: '0.000000', credit: '1500.000000' },
  ]);
  assert.equal(valid.balanced, true);
  assert.equal(valid.totalDebit, '11500.000000');
  assert.equal(valid.totalCredit, '11500.000000');

  const unbalanced = verifyBalancedJournalLines([
    { debit: '11500.000000', credit: '0.000000' },
    { debit: '0.000000', credit: '10000.000000' },
  ]);
  assert.equal(unbalanced.balanced, false);
});

test('Unit: Environment configuration validation, safe defaults, and optional feature flags', () => {
  const prevSecret = process.env.SESSION_SECRET;
  const prevLogLevel = process.env.LOG_LEVEL;
  const prevProxyHops = process.env.TRUSTED_PROXY_HOPS;
  try {
    delete process.env.SESSION_SECRET;
    delete process.env.LOG_LEVEL;
    delete process.env.TRUSTED_PROXY_HOPS;

    assert.equal(resolveLogLevel(), 'info');
    assert.equal(resolveTrustedProxyHops(), 0);

    const reportBlocked = evaluateEnvironmentConfig({
      hasDisposableTestDb: false,
    });
    assert.equal(reportBlocked.coreReady, false);
    assert.equal(reportBlocked.databaseConfigured, false);
    assert.equal(reportBlocked.authSecretConfigured, false);
    // Optional services remain disabled gracefully without blocking core readiness reporting
    assert.equal(reportBlocked.optionalServices.objectStorageEnabled, false);
    assert.equal(reportBlocked.optionalServices.emailNotificationsEnabled, false);

    process.env.SESSION_SECRET = 'ephemeral-unit-test-secret-with-at-least-32-chars';
    process.env.TRUSTED_PROXY_HOPS = '1';
    assert.equal(resolveTrustedProxyHops(), 1);

    const reportReady = evaluateEnvironmentConfig({
      hasDisposableTestDb: true,
    });
    assert.equal(reportReady.coreReady, true);
    assert.equal(reportReady.databaseConfigured, true);
    assert.equal(reportReady.authSecretConfigured, true);
    assert.equal(reportReady.optionalServices.objectStorageEnabled, false);
    assert.equal(reportReady.optionalServices.emailNotificationsEnabled, false);
  } finally {
    if (prevSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = prevSecret;
    if (prevLogLevel === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = prevLogLevel;
    if (prevProxyHops === undefined) delete process.env.TRUSTED_PROXY_HOPS;
    else process.env.TRUSTED_PROXY_HOPS = prevProxyHops;
  }
});

test('OPS-02: Missing PostgreSQL configuration fails closed with 503 BLOCKED_DATABASE (no fake fallback)', async () => {
  setDisposableTestDb(undefined);

  const health = await jsonReq('/api/v1/health');
  assert.equal(health.status, 200);
  assert.equal(health.payload.data.status, 'ok');

  const ready = await jsonReq('/api/v1/ready');
  assert.equal(ready.status, 503);
  assert.equal(ready.payload.error.code, 'BLOCKED_DATABASE');
  assert.ok(ready.payload.data.environmentReport, 'Expected environmentReport on /api/v1/ready');

  const registerAttempt = await jsonReq('/api/v1/auth/register', {
    method: 'POST',
    body: {
      email: 'test@example.com',
      displayName: 'Test User',
      password: 'Password123!',
    },
  });
  assert.equal(registerAttempt.status, 503);
  assert.equal(registerAttempt.payload.error.code, 'BLOCKED_DATABASE');
});

test('Integration: Disposable PostgreSQL migrations, Auth, RBAC, Tenant Isolation, RLS & GL Triggers', async () => {
  const pgClient = new PGlite();
  const migrationSql = fs.readFileSync(
    path.resolve(process.cwd(), 'drizzle/0000_phase0_foundation.sql'),
    'utf-8'
  );
  await pgClient.exec(migrationSql);

  const testDb = drizzle(pgClient, { schema });
  setDisposableTestDb(testDb);
  const previousSessionSecret = process.env.SESSION_SECRET;

  try {
    // 0. Verify missing SESSION_SECRET blocks auth and readiness with 503 BLOCKED_AUTH_CONFIG
    delete process.env.SESSION_SECRET;
    const readyWithoutSecret = await jsonReq('/api/v1/ready');
    assert.equal(readyWithoutSecret.status, 503);
    assert.equal(readyWithoutSecret.payload.error.code, 'BLOCKED_AUTH_CONFIG');

    const regWithoutSecret = await jsonReq('/api/v1/auth/register', {
      method: 'POST',
      body: {
        email: 'blocked@padmatraders.bd',
        displayName: 'Blocked User',
        password: 'SecurePasswordA123!',
      },
    });
    assert.equal(regWithoutSecret.status, 503);
    assert.equal(regWithoutSecret.payload.error.code, 'BLOCKED_AUTH_CONFIG');

    // Configure test-only SESSION_SECRET (>= 32 chars) for subsequent authenticated integration tests
    process.env.SESSION_SECRET = 'test-only-disposable-pg-session-secret-minimum-32-chars';

    // 1. Verify readiness endpoint passes with live PostgreSQL + valid SESSION_SECRET
    const ready = await jsonReq('/api/v1/ready');
    assert.equal(ready.status, 200);
    assert.equal(ready.payload.data.code, 'READY');
    assert.equal(ready.payload.data.environmentReport.coreReady, true);

    // 2. Verify schema tables, triggers, and RLS policies in PostgreSQL catalog
    const tablesRes = await pgClient.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    const tableNames = tablesRes.rows.map((r) => r.table_name);
    assert.ok(tableNames.includes('organizations'));
    assert.ok(tableNames.includes('journal_entries'));
    assert.ok(tableNames.includes('journal_lines'));
    assert.ok(tableNames.includes('idempotency_records'));

    const policiesRes = await pgClient.query<{ tablename: string; policyname: string }>(`
      SELECT tablename, policyname
      FROM pg_policies
      WHERE schemaname = 'public';
    `);
    assert.ok(policiesRes.rows.length >= 19, 'Expected RLS policies on all 19 tenant tables');

    // 3. AUTH-01: Unauthenticated GET party list returns 401
    const unauthParties = await jsonReq('/api/v1/parties');
    assert.equal(unauthParties.status, 401);
    assert.equal(unauthParties.payload.error.code, 'UNAUTHENTICATED');

    // 4. Register Owner A and Bootstrap Organization A
    const regA = await jsonReq('/api/v1/auth/register', {
      method: 'POST',
      body: {
        email: 'owner.a@padmatraders.bd',
        displayName: 'রহিম উদ্দিন (Owner A)',
        password: 'SecurePasswordA123!',
      },
    });
    assert.equal(regA.status, 201);
    const tokenA: string = regA.payload.data.token;
    assert.ok(tokenA.length >= 32);

    const orgA = await jsonReq('/api/v1/organizations', {
      method: 'POST',
      token: tokenA,
      body: {
        legalName: 'পদ্মা ট্রেডার্স লিমিটেড',
        tradeName: 'পদ্মা হার্ডওয়্যার',
        baseCurrency: 'BDT',
        timezone: 'Asia/Dhaka',
        reportingLanguage: 'bn',
        branchCode: 'DHK-HQ',
        branchName: 'ঢাকা প্রধান কার্যালয়',
        fiscalPeriodCode: 'FY-2026-27',
        fiscalStartsOn: '2026-07-01',
        fiscalEndsOn: '2027-06-30',
        taxRegistrationClass: 'pending_review',
      },
    });
    assert.equal(orgA.status, 201);
    const orgAId: string = orgA.payload.data.organization.id;
    const branchAId: string = orgA.payload.data.branch.id;
    const periodAId: string = orgA.payload.data.fiscalPeriod.id;

    // 5. Verify honest empty dashboard summary (zero fake KPIs)
    const summaryA = await jsonReq('/api/v1/dashboard/summary', { token: tokenA });
    assert.equal(summaryA.status, 200);
    assert.equal(summaryA.payload.data.hasPostedFinancialActivity, false);
    assert.equal(summaryA.payload.data.counts.postedJournals, 0);
    assert.equal(summaryA.payload.data.counts.parties, 0);
    assert.equal(summaryA.payload.data.counts.accounts, 12);

    // 6. Create Party A1 in Organization A
    const createPartyA = await jsonReq('/api/v1/parties', {
      method: 'POST',
      token: tokenA,
      body: {
        displayName: 'মেঘনা এন্টারপ্রাইজ',
        mobile: '01711000000',
        creditLimit: '50000.000000',
        paymentTermDays: 15,
        roles: ['customer', 'supplier'],
      },
    });
    assert.equal(createPartyA.status, 201);
    const partyA1Id: string = createPartyA.payload.data.id;

    // 7. Register Owner B and Bootstrap Organization B
    const regB = await jsonReq('/api/v1/auth/register', {
      method: 'POST',
      body: {
        email: 'owner.b@jamunastore.bd',
        displayName: 'করিম আহমেদ (Owner B)',
        password: 'SecurePasswordB123!',
      },
    });
    assert.equal(regB.status, 201);
    const tokenB: string = regB.payload.data.token;

    const orgB = await jsonReq('/api/v1/organizations', {
      method: 'POST',
      token: tokenB,
      body: {
        legalName: 'যমুনা স্টোর লিমিটেড',
        branchCode: 'CTG-HQ',
        branchName: 'চট্টগ্রাম প্রধান শাখা',
        fiscalPeriodCode: 'FY-2026-27',
        fiscalStartsOn: '2026-07-01',
        fiscalEndsOn: '2027-06-30',
        taxRegistrationClass: 'unregistered',
      },
    });
    assert.equal(orgB.status, 201);
    const orgBId: string = orgB.payload.data.organization.id;

    // 8. AUTH-02: User of Org B cannot read Party A1 of Org A
    const crossRead = await jsonReq(`/api/v1/parties/${partyA1Id}`, {
      token: tokenB,
    });
    assert.equal(crossRead.status, 404);

    const listPartiesB = await jsonReq('/api/v1/parties', { token: tokenB });
    assert.equal(listPartiesB.status, 200);
    assert.equal(listPartiesB.payload.data.length, 0);

    // 9. TEN-02: Changing selected org in header or body cannot impersonate Org A
    const headerImpersonation = await jsonReq('/api/v1/parties', {
      token: tokenB,
      headers: { 'x-organization-id': orgAId },
    });
    assert.equal(headerImpersonation.status, 403);
    assert.equal(
      headerImpersonation.payload.error.code,
      'FORBIDDEN_TENANT_IMPERSONATION'
    );

    const switchImpersonation = await jsonReq('/api/v1/context/switch', {
      method: 'POST',
      token: tokenB,
      body: { organizationId: orgAId },
    });
    assert.equal(switchImpersonation.status, 403);
    assert.equal(
      switchImpersonation.payload.error.code,
      'FORBIDDEN_ORGANIZATION_CONTEXT'
    );

    // 10. TEN-01: Database composite FK rejects linking Org B record to Org A branch/period
    await assert.rejects(
      async () => {
        await pgClient.query(
          `INSERT INTO warehouses (organization_id, branch_id, code, name)
           VALUES ($1, $2, 'ILLEGAL-WH', 'Cross Tenant Warehouse')`,
          [orgBId, branchAId]
        );
      },
      /fk_warehouses_branch/,
      'Composite FK must block linking Org B warehouse to Org A branch'
    );

    // 11. Test PostgreSQL Row-Level Security (RLS) directly with a non-superuser role
    await pgClient.exec(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bepari_runtime_user') THEN
          CREATE ROLE bepari_runtime_user NOLOGIN;
        END IF;
      END $$;
      GRANT USAGE ON SCHEMA public TO bepari_runtime_user;
      GRANT SELECT ON parties TO bepari_runtime_user;
    `);
    await pgClient.exec('BEGIN;');
    await pgClient.exec(`SET LOCAL ROLE bepari_runtime_user;`);
    await pgClient.query(
      `SELECT set_config('app.current_organization_id', $1, true)`,
      [orgBId]
    );
    const rlsRowsForB = await pgClient.query(`SELECT id FROM parties;`);
    await pgClient.exec('COMMIT;');
    assert.equal(
      rlsRowsForB.rows.length,
      0,
      'PostgreSQL RLS must filter out Org A parties when session context is Org B'
    );

    // 12. AUTH-03: Sales staff tries to close period -> 403 + recorded audit event
    const addSalesMember = await jsonReq('/api/v1/members', {
      method: 'POST',
      token: tokenA,
      body: {
        email: 'sales.staff@padmatraders.bd',
        displayName: 'সেলস কর্মী',
        password: 'SalesPassword123!',
        roleCode: 'sales',
      },
    });
    assert.equal(addSalesMember.status, 201);

    const salesLogin = await jsonReq('/api/v1/auth/login', {
      method: 'POST',
      body: {
        email: 'sales.staff@padmatraders.bd',
        password: 'SalesPassword123!',
      },
    });
    assert.equal(salesLogin.status, 200);
    const salesToken: string = salesLogin.payload.data.token;

    const closeAttemptBySales = await jsonReq(
      `/api/v1/periods/${periodAId}/close`,
      {
        method: 'POST',
        token: salesToken,
      }
    );
    assert.equal(closeAttemptBySales.status, 403);
    assert.equal(closeAttemptBySales.payload.error.code, 'FORBIDDEN_PERMISSION');

    const auditRes = await jsonReq('/api/v1/audit-events', { token: tokenA });
    assert.equal(auditRes.status, 200);
    const deniedAudit = auditRes.payload.data.find(
      (ev: { action: string }) => ev.action === 'permission.denied'
    );
    assert.ok(deniedAudit, 'Expected permission.denied audit event to be recorded');

    // 13. GL-01 & GL-04: Post balanced journal entry and verify idempotent retry
    const accountsRes = await jsonReq('/api/v1/accounts', { token: tokenA });
    assert.equal(accountsRes.status, 200);
    const cashAcc = accountsRes.payload.data.find(
      (a: { accountCode: string }) => a.accountCode === '1100'
    );
    const equityAcc = accountsRes.payload.data.find(
      (a: { accountCode: string }) => a.accountCode === '3100'
    );
    assert.ok(cashAcc && equityAcc);

    const sourceId = crypto.randomUUID();
    const idemKey = 'IDEM-OPENING-JE-001';
    const postJe1 = await jsonReq('/api/v1/journal-entries', {
      method: 'POST',
      token: tokenA,
      headers: { 'Idempotency-Key': idemKey },
      body: {
        fiscalPeriodId: periodAId,
        entryDate: '2026-07-02',
        sourceType: 'opening_balance',
        sourceId,
        description: 'প্রারম্ভিক মূলধন জমার জার্নাল',
        lines: [
          {
            accountId: cashAcc.id,
            debit: '250000.000000',
            credit: '0.000000',
            memo: 'নগদ মূলধন জমা',
          },
          {
            accountId: equityAcc.id,
            debit: '0.000000',
            credit: '250000.000000',
            memo: 'মালিকানা মূলধন খাত',
          },
        ],
      },
    });
    assert.equal(postJe1.status, 201);
    const postedJeId: string = postJe1.payload.data.entry.id;

    // Replay with the same Idempotency-Key -> returns 200 and does not duplicate
    const postJeReplay = await jsonReq('/api/v1/journal-entries', {
      method: 'POST',
      token: tokenA,
      headers: { 'Idempotency-Key': idemKey },
      body: {
        fiscalPeriodId: periodAId,
        entryDate: '2026-07-02',
        sourceType: 'opening_balance',
        sourceId,
        description: 'প্রারম্ভিক মূলধন জমার জার্নাল',
        lines: [
          {
            accountId: cashAcc.id,
            debit: '250000.000000',
            credit: '0.000000',
          },
          {
            accountId: equityAcc.id,
            debit: '0.000000',
            credit: '250000.000000',
          },
        ],
      },
    });
    assert.equal(postJeReplay.status, 200);
    assert.equal(postJeReplay.payload.data.idempotentReplay, true);
    assert.equal(postJeReplay.payload.data.entry.id, postedJeId);

    // 14. GL-02: Verify PostgreSQL triggers block mutating or deleting posted journal lines/headers
    await assert.rejects(
      async () => {
        await pgClient.query(
          `UPDATE journal_lines SET debit = 999999.000000 WHERE journal_entry_id = $1`,
          [postedJeId]
        );
      },
      /Cannot mutate lines of posted\/reversed journal/,
      'Trigger journal_lines_immutable must block updating posted journal lines'
    );

    await assert.rejects(
      async () => {
        await pgClient.query(
          `DELETE FROM journal_entries WHERE id = $1`,
          [postedJeId]
        );
      },
      /Cannot modify\/delete a posted journal/,
      'Trigger journal_header_immutable must block deleting posted journal header'
    );

    // 15. Verify PostgreSQL deferred constraint trigger blocks unbalanced posted journal at commit
    await assert.rejects(
      async () => {
        const badJeId = crypto.randomUUID();
        await pgClient.exec('BEGIN;');
        try {
          await pgClient.query(
            `INSERT INTO journal_entries (id, organization_id, fiscal_period_id, entry_date, source_type, source_id, description, status, idempotency_key)
             VALUES ($1, $2, $3, '2026-07-03', 'test_unbalanced', $4, 'Unbalanced test', 'draft', 'BAD-JE-1')`,
            [badJeId, orgAId, periodAId, crypto.randomUUID()]
          );
          await pgClient.query(
            `INSERT INTO journal_lines (organization_id, journal_entry_id, account_id, debit, credit)
             VALUES ($1, $2, $3, 500.000000, 0.000000)`,
            [orgAId, badJeId, cashAcc.id]
          );
          await pgClient.query(
            `UPDATE journal_entries SET status = 'posted' WHERE id = $1`,
            [badJeId]
          );
          await pgClient.exec('COMMIT;');
        } catch (err) {
          await pgClient.exec('ROLLBACK;');
          throw err;
        }
      },
      /unbalanced/,
      'Deferred trigger journal_balance_at_commit must reject unbalanced posted journal on commit'
    );
  } finally {
    if (previousSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = previousSessionSecret;
    }
    setDisposableTestDb(undefined);
    await pgClient.close();
  }
});

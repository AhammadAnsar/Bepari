import { Hono } from 'hono';
import { z } from 'zod';
import {
  BlockedDatabaseError,
  checkDatabaseReadiness,
  isDatabaseConfigured,
  withTenantTransaction,
} from '../db/index.ts';
import {
  AuthenticatedContext,
  loginWithEmailPassword,
  registerUserAccount,
  resolveAuthenticatedContext,
  revokeSessionToken,
  switchSessionContext,
} from './modules/identity/service.ts';
import {
  addOrganizationMember,
  bootstrapOrganization,
  createBranch,
} from './modules/organization/service.ts';
import {
  createParty,
  getPartyById,
  listParties,
} from './modules/parties/service.ts';
import {
  createCatalogItem,
  listCatalogItems,
} from './modules/catalog/service.ts';
import {
  closeFiscalPeriod,
  listAccounts,
  listFiscalPeriods,
  listJournalEntries,
  postBalancedJournalEntry,
} from './modules/finance/service.ts';
import { getHonestWorkspaceSummary } from './modules/reports/service.ts';
import { listAuditEvents, recordAuditInTx } from './modules/audit/service.ts';
import { AppError, handleApiError, okResponse } from './shared/errors.ts';
import { isValidMoneyString } from './shared/decimal.ts';
import { PermissionKey, ROLE_CODES } from './shared/permissions.ts';

type AppVariables = {
  requestId: string;
  authContext: AuthenticatedContext;
  rawToken: string;
};

export const apiApp = new Hono<{ Variables: AppVariables }>();

// Global request correlation ID & database gate middleware
apiApp.use('*', async (c, next) => {
  const incomingCorrelationId = c.req.header('x-correlation-id');
  const requestId =
    incomingCorrelationId && incomingCorrelationId.trim().length > 0
      ? incomingCorrelationId.trim()
      : crypto.randomUUID();
  c.set('requestId', requestId);
  c.header('x-request-id', requestId);
  await next();
});

// 1. Health & Readiness Endpoints
apiApp.get('/api/v1/health', (c) => {
  return okResponse(c, {
    status: 'ok',
    service: 'bepari-api',
    phase: 0,
    timezone: 'Asia/Dhaka',
  });
});

apiApp.get('/api/v1/ready', async (c) => {
  const readiness = await checkDatabaseReadiness();
  const isUiDiagnostic = c.req.query('mode') === 'ui';
  if (!readiness.ready && !isUiDiagnostic) {
    return c.json(
      {
        error: {
          code: readiness.code,
          message: String(readiness.details.messageBn || 'Database blocked'),
          messageEn: String(readiness.details.messageEn || 'Database blocked'),
          details: readiness.details,
          fieldErrors: {},
          requestId: c.get('requestId'),
        },
        data: readiness,
      },
      503
    );
  }
  return okResponse(c, readiness, 200);
});

// Helper to ensure DB is configured before running DB-backed routes
function assertDbReady() {
  if (!isDatabaseConfigured()) {
    throw new BlockedDatabaseError();
  }
}

// Authentication middleware
async function requireAuth(c: {
  req: { header: (name: string) => string | undefined };
  set: (key: 'authContext' | 'rawToken', value: never) => void;
  get: (key: 'authContext') => AuthenticatedContext;
}) {
  assertDbReady();
  const authHeader = c.req.header('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError(
      'UNAUTHENTICATED',
      'অনুগ্রহ করে প্রথমে আপনার অ্যাকাউন্টে সাইন ইন করুন।',
      401
    );
  }
  const rawToken = authHeader.slice('Bearer '.length).trim();
  if (!rawToken) {
    throw new AppError(
      'UNAUTHENTICATED',
      'বৈধ সেশন টোকেন পাওয়া যায়নি।',
      401
    );
  }
  const context = await resolveAuthenticatedContext(rawToken);

  // TEN-02 Guard: Reject any attempt to impersonate another organization via x-organization-id header
  const requestedHeaderOrg = c.req.header('x-organization-id');
  if (
    requestedHeaderOrg &&
    requestedHeaderOrg.trim() !== '' &&
    requestedHeaderOrg.trim() !== context.activeOrganizationId
  ) {
    throw new AppError(
      'FORBIDDEN_TENANT_IMPERSONATION',
      'হেডারের মাধ্যমে অন্য প্রতিষ্ঠানের তথ্য অ্যাক্সেস করা নিষিদ্ধ।',
      403
    );
  }

  c.set('rawToken', rawToken as never);
  c.set('authContext', context as never);
  return context;
}

// Permission & Tenant Context Guard (records audit trail on permission denial for AUTH-03)
async function requireTenantPermission(
  c: {
    req: { header: (name: string) => string | undefined; path: string; method: string };
    set: (key: 'authContext' | 'rawToken', value: never) => void;
    get: (key: 'authContext' | 'requestId') => unknown;
  },
  permission?: PermissionKey
): Promise<{ context: AuthenticatedContext; organizationId: string }> {
  const context = await requireAuth(c as never);
  if (!context.activeOrganizationId) {
    throw new AppError(
      'NO_ACTIVE_ORGANIZATION',
      'কোনো সক্রিয় প্রতিষ্ঠান নির্বাচন করা হয়নি। অনুগ্রহ করে প্রথমে প্রতিষ্ঠান অনবোর্ডিং সম্পন্ন করুন।',
      403
    );
  }

  if (permission && !context.permissions.includes(permission)) {
    const orgId = context.activeOrganizationId;
    const reqId = (c.get('requestId') as string) || crypto.randomUUID();
    await withTenantTransaction(orgId, async (tx) => {
      await recordAuditInTx(tx, {
        organizationId: orgId,
        actorUserId: context.user.id,
        action: 'permission.denied',
        entityType: 'permission_check',
        entityId: context.user.id,
        afterJson: {
          requiredPermission: permission,
          actorRole: context.activeRole,
          path: c.req.path,
          method: c.req.method,
        },
        correlationId: reqId,
      });
    });

    throw new AppError(
      'FORBIDDEN_PERMISSION',
      'এই কাজের অনুমতি নেই। প্রতিষ্ঠানের অ্যাডমিনের সঙ্গে যোগাযোগ করুন।',
      403
    );
  }

  return {
    context,
    organizationId: context.activeOrganizationId,
  };
}

function formatZodErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'root';
    fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

// 2. Authentication Endpoints
const registerSchema = z.object({
  email: z.string().email('সঠিক ইমেইল ঠিকানা দিন'),
  displayName: z.string().min(2, 'নাম কমপক্ষে ২ অক্ষরের হতে হবে').max(120),
  password: z.string().min(8, 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে').max(128),
});

apiApp.post('/api/v1/auth/register', async (c) => {
  try {
    assertDbReady();
    const body = await c.req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        'প্রদত্ত তথ্যে ত্রুটি রয়েছে। অনুগ্রহ করে যাচাই করুন।',
        422,
        formatZodErrors(parsed.error)
      );
    }
    const result = await registerUserAccount(parsed.data);
    return okResponse(c, result, 201);
  } catch (err) {
    return handleApiError(c, err);
  }
});

const loginSchema = z.object({
  email: z.string().email('সঠিক ইমেইল ঠিকানা দিন'),
  password: z.string().min(1, 'পাসওয়ার্ড প্রদান করুন'),
});

apiApp.post('/api/v1/auth/login', async (c) => {
  try {
    assertDbReady();
    const body = await c.req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        'ইমেইল ও পাসওয়ার্ড সঠিকভাবে প্রদান করুন।',
        422,
        formatZodErrors(parsed.error)
      );
    }
    const result = await loginWithEmailPassword(parsed.data);
    return okResponse(c, result, 200);
  } catch (err) {
    return handleApiError(c, err);
  }
});

apiApp.post('/api/v1/auth/logout', async (c) => {
  try {
    await requireAuth(c as never);
    const rawToken = c.get('rawToken');
    await revokeSessionToken(rawToken);
    return okResponse(c, { loggedOut: true });
  } catch (err) {
    return handleApiError(c, err);
  }
});

apiApp.get('/api/v1/me', async (c) => {
  try {
    const context = await requireAuth(c as never);
    return okResponse(c, context);
  } catch (err) {
    return handleApiError(c, err);
  }
});

// 3. Organization Bootstrap, Context Switch, Branches & Members
const bootstrapOrgSchema = z.object({
  legalName: z.string().min(2, 'প্রতিষ্ঠানের আইনি নাম আবশ্যক').max(160),
  tradeName: z.string().max(160).optional(),
  baseCurrency: z.literal('BDT').default('BDT'),
  timezone: z.literal('Asia/Dhaka').default('Asia/Dhaka'),
  reportingLanguage: z.enum(['bn', 'en']).default('bn'),
  branchCode: z.string().min(2, 'শাখা কোড কমপক্ষে ২ অক্ষরের হতে হবে').max(24),
  branchName: z.string().min(2, 'শাখার নাম আবশ্যক').max(120),
  fiscalPeriodCode: z.string().min(2, 'হিসাবকাল কোড আবশ্যক').max(32),
  fiscalStartsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD তারিখ দিন'),
  fiscalEndsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD তারিখ দিন'),
  taxRegistrationClass: z
    .enum(['registered', 'turnover_enlisted', 'unregistered', 'special', 'pending_review'])
    .default('pending_review'),
  bin: z.string().max(32).optional(),
  tin: z.string().max(32).optional(),
});

apiApp.post('/api/v1/organizations', async (c) => {
  try {
    const context = await requireAuth(c as never);
    const body = await c.req.json();
    const parsed = bootstrapOrgSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        'প্রতিষ্ঠানের তথ্যে ত্রুটি রয়েছে।',
        422,
        formatZodErrors(parsed.error)
      );
    }

    const created = await bootstrapOrganization({
      ...parsed.data,
      userId: context.user.id,
      sessionId: context.sessionId,
    });

    const updatedContext = await resolveAuthenticatedContext(c.get('rawToken'));
    return okResponse(
      c,
      {
        ...created,
        context: updatedContext,
      },
      201
    );
  } catch (err) {
    return handleApiError(c, err);
  }
});

const switchContextSchema = z.object({
  organizationId: z.string().uuid('সঠিক প্রতিষ্ঠানের আইডি দিন'),
  branchId: z.string().uuid('সঠিক শাখার আইডি দিন').nullable().optional(),
});

apiApp.post('/api/v1/context/switch', async (c) => {
  try {
    const context = await requireAuth(c as never);
    const body = await c.req.json();
    const parsed = switchContextSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        'প্রতিষ্ঠান বা শাখা নির্বাচনের তথ্যে ত্রুটি রয়েছে।',
        422,
        formatZodErrors(parsed.error)
      );
    }

    await switchSessionContext({
      sessionId: context.sessionId,
      userId: context.user.id,
      organizationId: parsed.data.organizationId,
      branchId: parsed.data.branchId,
    });

    const updatedContext = await resolveAuthenticatedContext(c.get('rawToken'));
    return okResponse(c, updatedContext);
  } catch (err) {
    return handleApiError(c, err);
  }
});

const createBranchSchema = z.object({
  code: z.string().min(2).max(24),
  name: z.string().min(2).max(120),
  addressJson: z.record(z.string(), z.unknown()).optional(),
});

apiApp.post('/api/v1/branches', async (c) => {
  try {
    const { context, organizationId } = await requireTenantPermission(
      c as never,
      'branch.manage'
    );
    const body = await c.req.json();
    const parsed = createBranchSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        'শাখার তথ্যে ত্রুটি রয়েছে।',
        422,
        formatZodErrors(parsed.error)
      );
    }

    const branch = await createBranch({
      organizationId,
      actorUserId: context.user.id,
      ...parsed.data,
    });

    return okResponse(c, branch, 201);
  } catch (err) {
    return handleApiError(c, err);
  }
});

const addMemberSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(2).max(120),
  password: z.string().min(8).max(128).optional(),
  roleCode: z.enum(ROLE_CODES),
});

apiApp.post('/api/v1/members', async (c) => {
  try {
    const { context, organizationId } = await requireTenantPermission(
      c as never,
      'member.manage'
    );
    const body = await c.req.json();
    const parsed = addMemberSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        'সদস্যের তথ্যে ত্রুটি রয়েছে।',
        422,
        formatZodErrors(parsed.error)
      );
    }

    const member = await addOrganizationMember({
      organizationId,
      actorUserId: context.user.id,
      ...parsed.data,
    });

    return okResponse(c, member, 201);
  } catch (err) {
    return handleApiError(c, err);
  }
});

// 4. Honest Empty Dashboard Summary (Connected to Real Backend, No Fake Financial KPIs)
apiApp.get('/api/v1/dashboard/summary', async (c) => {
  try {
    const { organizationId } = await requireTenantPermission(c as never);
    const summary = await getHonestWorkspaceSummary(organizationId);
    return okResponse(c, summary);
  } catch (err) {
    return handleApiError(c, err);
  }
});

// 5. Parties Endpoints
const createPartySchema = z
  .object({
    displayName: z.string().min(2, 'নাম কমপক্ষে ২ অক্ষরের হতে হবে').max(160),
    legalName: z.string().max(160).optional(),
    mobile: z.string().max(32).optional(),
    email: z.string().email().optional(),
    taxBin: z.string().max(32).optional(),
    taxTin: z.string().max(32).optional(),
    creditLimit: z
      .string()
      .refine((v) => isValidMoneyString(v), 'বৈধ দশমিক সংখ্যা দিন (যেমন 50000.000000)')
      .nullable()
      .optional(),
    paymentTermDays: z.number().int().min(0).max(365).default(0),
    roles: z.array(z.enum(['customer', 'supplier'])).min(1, 'কমপক্ষে একটি ভূমিকা নির্বাচন করুন'),
    organizationId: z.string().optional(),
  })
  .strict();

apiApp.get('/api/v1/parties', async (c) => {
  try {
    const { organizationId } = await requireTenantPermission(
      c as never,
      'party.read'
    );
    const rows = await listParties(organizationId);
    return okResponse(c, rows);
  } catch (err) {
    return handleApiError(c, err);
  }
});

apiApp.post('/api/v1/parties', async (c) => {
  try {
    const { context, organizationId } = await requireTenantPermission(
      c as never,
      'party.create'
    );
    const body = await c.req.json();
    const parsed = createPartySchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        'গ্রাহক বা সরবরাহকারীর তথ্যে ত্রুটি রয়েছে।',
        422,
        formatZodErrors(parsed.error)
      );
    }

    // TEN-02 Guard: Reject payload attempting to write to a different organizationId
    if (
      parsed.data.organizationId &&
      parsed.data.organizationId !== organizationId
    ) {
      throw new AppError(
        'FORBIDDEN_TENANT_IMPERSONATION',
        'অন্য প্রতিষ্ঠানের নামে তথ্য সংরক্ষণ করা নিষিদ্ধ।',
        403
      );
    }

    const created = await createParty({
      organizationId,
      actorUserId: context.user.id,
      ...parsed.data,
    });
    return okResponse(c, created, 201);
  } catch (err) {
    return handleApiError(c, err);
  }
});

apiApp.get('/api/v1/parties/:id', async (c) => {
  try {
    const { organizationId } = await requireTenantPermission(
      c as never,
      'party.read'
    );
    const partyId = c.req.param('id');
    const party = await getPartyById(organizationId, partyId);
    return okResponse(c, party);
  } catch (err) {
    return handleApiError(c, err);
  }
});

// 6. Catalog Items & Units Endpoints
const createItemSchema = z.object({
  sku: z.string().max(64).optional(),
  itemType: z.enum(['product', 'service']),
  nameBn: z.string().min(1, 'পণ্যের বাংলা নাম আবশ্যক').max(160),
  nameEn: z.string().max(160).optional(),
  baseUnitId: z.string().uuid().nullable().optional(),
  defaultPrice: z
    .string()
    .refine((v) => isValidMoneyString(v), 'মূল্য বৈধ দশমিক স্ট্রিং হতে হবে (যেমন 250.000000)')
    .default('0.000000'),
  taxCategoryCode: z.string().max(64).optional(),
});

apiApp.get('/api/v1/items', async (c) => {
  try {
    const { organizationId } = await requireTenantPermission(
      c as never,
      'catalog.read'
    );
    const catalog = await listCatalogItems(organizationId);
    return okResponse(c, catalog);
  } catch (err) {
    return handleApiError(c, err);
  }
});

apiApp.post('/api/v1/items', async (c) => {
  try {
    const { context, organizationId } = await requireTenantPermission(
      c as never,
      'catalog.write'
    );
    const body = await c.req.json();
    const parsed = createItemSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        'পণ্য বা সেবার তথ্যে ত্রুটি রয়েছে।',
        422,
        formatZodErrors(parsed.error)
      );
    }

    const created = await createCatalogItem({
      organizationId,
      actorUserId: context.user.id,
      ...parsed.data,
    });
    return okResponse(c, created, 201);
  } catch (err) {
    return handleApiError(c, err);
  }
});

// 7. Chart of Accounts, Fiscal Periods & Immutable Journals
apiApp.get('/api/v1/accounts', async (c) => {
  try {
    const { organizationId } = await requireTenantPermission(
      c as never,
      'accounting.read'
    );
    const rows = await listAccounts(organizationId);
    return okResponse(c, rows);
  } catch (err) {
    return handleApiError(c, err);
  }
});

apiApp.get('/api/v1/periods', async (c) => {
  try {
    const { organizationId } = await requireTenantPermission(
      c as never,
      'accounting.read'
    );
    const rows = await listFiscalPeriods(organizationId);
    return okResponse(c, rows);
  } catch (err) {
    return handleApiError(c, err);
  }
});

apiApp.post('/api/v1/periods/:id/close', async (c) => {
  try {
    const { context, organizationId } = await requireTenantPermission(
      c as never,
      'accounting.close'
    );
    const periodId = c.req.param('id');
    const closed = await closeFiscalPeriod({
      organizationId,
      periodId,
      actorUserId: context.user.id,
    });
    return okResponse(c, closed);
  } catch (err) {
    return handleApiError(c, err);
  }
});

apiApp.get('/api/v1/journal-entries', async (c) => {
  try {
    const { organizationId } = await requireTenantPermission(
      c as never,
      'accounting.read'
    );
    const entries = await listJournalEntries(organizationId);
    return okResponse(c, entries);
  } catch (err) {
    return handleApiError(c, err);
  }
});

const postJournalSchema = z.object({
  branchId: z.string().uuid().nullable().optional(),
  fiscalPeriodId: z.string().uuid(),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sourceType: z.string().min(1).max(64),
  sourceId: z.string().uuid(),
  description: z.string().min(2).max(240),
  idempotencyKey: z.string().min(4).max(128).optional(),
  lines: z
    .array(
      z.object({
        accountId: z.string().uuid(),
        partyId: z.string().uuid().nullable().optional(),
        debit: z.string().refine((v) => isValidMoneyString(v), 'Invalid debit decimal string'),
        credit: z.string().refine((v) => isValidMoneyString(v), 'Invalid credit decimal string'),
        memo: z.string().max(200).optional(),
      })
    )
    .min(2),
});

apiApp.post('/api/v1/journal-entries', async (c) => {
  try {
    const { context, organizationId } = await requireTenantPermission(
      c as never,
      'accounting.post'
    );
    const body = await c.req.json();
    const parsed = postJournalSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        'জার্নাল এন্ট্রির তথ্যে ত্রুটি রয়েছে।',
        422,
        formatZodErrors(parsed.error)
      );
    }

    const headerKey = c.req.header('idempotency-key');
    const idempotencyKey = (headerKey || parsed.data.idempotencyKey || '').trim();
    if (!idempotencyKey) {
      throw new AppError(
        'IDEMPOTENCY_KEY_REQUIRED',
        'আর্থিক লেনদেন পোস্ট করার জন্য Idempotency-Key প্রদান করা আবশ্যক।',
        422
      );
    }

    const result = await postBalancedJournalEntry({
      organizationId,
      branchId: parsed.data.branchId ?? context.activeBranchId,
      fiscalPeriodId: parsed.data.fiscalPeriodId,
      entryDate: parsed.data.entryDate,
      sourceType: parsed.data.sourceType,
      sourceId: parsed.data.sourceId,
      description: parsed.data.description,
      idempotencyKey,
      actorUserId: context.user.id,
      lines: parsed.data.lines,
    });

    return okResponse(c, result, result.idempotentReplay ? 200 : 201);
  } catch (err) {
    return handleApiError(c, err);
  }
});

// 8. Audit Events
apiApp.get('/api/v1/audit-events', async (c) => {
  try {
    const { organizationId } = await requireTenantPermission(
      c as never,
      'audit.read'
    );
    const events = await listAuditEvents(organizationId);
    return okResponse(c, events);
  } catch (err) {
    return handleApiError(c, err);
  }
});

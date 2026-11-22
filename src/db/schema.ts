import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  char,
  jsonb,
  date,
  numeric,
  integer,
  bigint,
  primaryKey,
  unique,
  foreignKey,
  index,
} from 'drizzle-orm/pg-core';

// 1. Identity & Sessions
export const appUsers = pgTable('app_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  authSubject: text('auth_subject').notNull().unique(),
  displayName: text('display_name').notNull(),
  email: text('email').unique(),
  passwordHash: text('password_hash'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  legalName: text('legal_name').notNull(),
  tradeName: text('trade_name'),
  legalCountry: char('legal_country', { length: 2 }).notNull().default('BD'),
  baseCurrency: char('base_currency', { length: 3 }).notNull().default('BDT'),
  timezone: text('timezone').notNull().default('Asia/Dhaka'),
  reportingLanguage: text('reporting_language').notNull().default('bn'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const branches = pgTable(
  'branches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    addressJson: jsonb('address_json').notNull().default({}),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_branches_org_id').on(t.organizationId, t.id),
    unique('uq_branches_org_code').on(t.organizationId, t.code),
  ]
);

export const userSessions = pgTable('user_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => appUsers.id),
  tokenHash: text('token_hash').notNull().unique(),
  activeOrganizationId: uuid('active_organization_id').references(() => organizations.id),
  activeBranchId: uuid('active_branch_id').references(() => branches.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const organizationMembers = pgTable(
  'organization_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUsers.id),
    roleCode: text('role_code').notNull(),
    status: text('status').notNull().default('invited'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_org_members_org_user').on(t.organizationId, t.userId),
    unique('uq_org_members_org_id').on(t.organizationId, t.id),
  ]
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    roleCode: text('role_code').notNull(),
    permissionKey: text('permission_key').notNull(),
    allowed: boolean('allowed').notNull().default(false),
  },
  (t) => [unique('uq_role_permissions').on(t.organizationId, t.roleCode, t.permissionKey)]
);

export const fiscalPeriods = pgTable(
  'fiscal_periods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    periodCode: text('period_code').notNull(),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),
    status: text('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_fiscal_periods_org_id').on(t.organizationId, t.id),
    unique('uq_fiscal_periods_org_code').on(t.organizationId, t.periodCode),
  ]
);

export const taxProfiles = pgTable(
  'tax_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    branchId: uuid('branch_id'),
    registrationClass: text('registration_class').notNull(),
    bin: text('bin'),
    tin: text('tin'),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),
    complianceStatus: text('compliance_status').notNull().default('needs_review'),
    approvedBy: uuid('approved_by').references(() => appUsers.id),
  },
  (t) => [
    unique('uq_tax_profiles_org_id').on(t.organizationId, t.id),
    foreignKey({
      columns: [t.organizationId, t.branchId],
      foreignColumns: [branches.organizationId, branches.id],
      name: 'fk_tax_profiles_branch',
    }),
  ]
);

// 2. Parties, Catalog & Locations
export const parties = pgTable(
  'parties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    displayName: text('display_name').notNull(),
    legalName: text('legal_name'),
    mobile: text('mobile'),
    email: text('email'),
    taxBin: text('tax_bin'),
    taxTin: text('tax_tin'),
    creditLimit: numeric('credit_limit', { precision: 20, scale: 6 }),
    paymentTermDays: integer('payment_term_days').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_parties_org_id').on(t.organizationId, t.id),
    index('idx_party_name').on(t.organizationId, t.displayName),
  ]
);

export const partyRoles = pgTable(
  'party_roles',
  {
    organizationId: uuid('organization_id').notNull(),
    partyId: uuid('party_id').notNull(),
    role: text('role').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.partyId, t.role] }),
    foreignKey({
      columns: [t.organizationId, t.partyId],
      foreignColumns: [parties.organizationId, parties.id],
      name: 'fk_party_roles_party',
    }),
  ]
);

export const partyAddresses = pgTable(
  'party_addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    partyId: uuid('party_id').notNull(),
    addressType: text('address_type').notNull(),
    addressJson: jsonb('address_json').notNull().default({}),
  },
  (t) => [
    unique('uq_party_addresses_org_id').on(t.organizationId, t.id),
    foreignKey({
      columns: [t.organizationId, t.partyId],
      foreignColumns: [parties.organizationId, parties.id],
      name: 'fk_party_addresses_party',
    }),
  ]
);

export const units = pgTable(
  'units',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    code: text('code').notNull(),
    nameBn: text('name_bn').notNull(),
    nameEn: text('name_en'),
  },
  (t) => [
    unique('uq_units_org_id').on(t.organizationId, t.id),
    unique('uq_units_org_code').on(t.organizationId, t.code),
  ]
);

export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    sku: text('sku'),
    itemType: text('item_type').notNull(),
    nameBn: text('name_bn').notNull(),
    nameEn: text('name_en'),
    baseUnitId: uuid('base_unit_id'),
    defaultPrice: numeric('default_price', { precision: 20, scale: 6 }).notNull().default('0.000000'),
    taxCategoryCode: text('tax_category_code'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_items_org_id').on(t.organizationId, t.id),
    unique('uq_items_org_sku').on(t.organizationId, t.sku),
    foreignKey({
      columns: [t.organizationId, t.baseUnitId],
      foreignColumns: [units.organizationId, units.id],
      name: 'fk_items_base_unit',
    }),
    index('idx_items_name').on(t.organizationId, t.nameBn),
  ]
);

export const warehouses = pgTable(
  'warehouses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    branchId: uuid('branch_id').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [
    unique('uq_warehouses_org_id').on(t.organizationId, t.id),
    unique('uq_warehouses_org_code').on(t.organizationId, t.code),
    foreignKey({
      columns: [t.organizationId, t.branchId],
      foreignColumns: [branches.organizationId, branches.id],
      name: 'fk_warehouses_branch',
    }),
  ]
);

// 3. Document Identity, Numbering & Idempotency
export const businessDocuments = pgTable(
  'business_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    branchId: uuid('branch_id'),
    documentType: text('document_type').notNull(),
    documentNumber: text('document_number'),
    lifecycleStatus: text('lifecycle_status').notNull().default('draft'),
    revision: integer('revision').notNull().default(1),
    currency: char('currency', { length: 3 }).notNull().default('BDT'),
    createdBy: uuid('created_by').references(() => appUsers.id),
    approvedBy: uuid('approved_by').references(() => appUsers.id),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_business_docs_org_id').on(t.organizationId, t.id),
    unique('uq_business_docs_number').on(
      t.organizationId,
      t.branchId,
      t.documentType,
      t.documentNumber
    ),
    foreignKey({
      columns: [t.organizationId, t.branchId],
      foreignColumns: [branches.organizationId, branches.id],
      name: 'fk_business_docs_branch',
    }),
  ]
);

export const documentSequences = pgTable(
  'document_sequences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    branchScope: text('branch_scope').notNull(),
    documentType: text('document_type').notNull(),
    fiscalKey: text('fiscal_key').notNull(),
    nextNumber: bigint('next_number', { mode: 'number' }).notNull().default(1),
  },
  (t) => [
    unique('uq_doc_sequences_scope').on(
      t.organizationId,
      t.branchScope,
      t.documentType,
      t.fiscalKey
    ),
  ]
);

export const idempotencyRecords = pgTable(
  'idempotency_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    operationKey: text('operation_key').notNull(),
    requestHash: text('request_hash').notNull(),
    resultReference: text('result_reference'),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('uq_idempotency_org_key').on(t.organizationId, t.operationKey)]
);

// 4. Chart of Accounts & Immutable General Ledger
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    accountCode: text('account_code').notNull(),
    accountName: text('account_name').notNull(),
    accountType: text('account_type').notNull(),
    parentAccountId: uuid('parent_account_id'),
    isControl: boolean('is_control').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [
    unique('uq_accounts_org_id').on(t.organizationId, t.id),
    unique('uq_accounts_org_code').on(t.organizationId, t.accountCode),
    foreignKey({
      columns: [t.organizationId, t.parentAccountId],
      foreignColumns: [t.organizationId, t.id],
      name: 'fk_accounts_parent',
    }),
  ]
);

export const journalEntries = pgTable(
  'journal_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    branchId: uuid('branch_id'),
    fiscalPeriodId: uuid('fiscal_period_id').notNull(),
    entryDate: date('entry_date').notNull(),
    sourceType: text('source_type').notNull(),
    sourceId: uuid('source_id').notNull(),
    description: text('description').notNull(),
    status: text('status').notNull().default('draft'),
    reversalOfId: uuid('reversal_of_id'),
    idempotencyKey: text('idempotency_key').notNull(),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => appUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_journal_entries_org_id').on(t.organizationId, t.id),
    unique('uq_journal_entries_idempotency').on(t.organizationId, t.idempotencyKey),
    foreignKey({
      columns: [t.organizationId, t.branchId],
      foreignColumns: [branches.organizationId, branches.id],
      name: 'fk_je_branch',
    }),
    foreignKey({
      columns: [t.organizationId, t.fiscalPeriodId],
      foreignColumns: [fiscalPeriods.organizationId, fiscalPeriods.id],
      name: 'fk_je_fiscal_period',
    }),
    foreignKey({
      columns: [t.organizationId, t.reversalOfId],
      foreignColumns: [t.organizationId, t.id],
      name: 'fk_je_reversal',
    }),
    index('idx_je_date').on(t.organizationId, t.entryDate, t.status),
  ]
);

export const journalLines = pgTable(
  'journal_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    journalEntryId: uuid('journal_entry_id').notNull(),
    accountId: uuid('account_id').notNull(),
    partyId: uuid('party_id'),
    debit: numeric('debit', { precision: 20, scale: 6 }).notNull().default('0.000000'),
    credit: numeric('credit', { precision: 20, scale: 6 }).notNull().default('0.000000'),
    memo: text('memo'),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.journalEntryId],
      foreignColumns: [journalEntries.organizationId, journalEntries.id],
      name: 'fk_jl_journal_entry',
    }),
    foreignKey({
      columns: [t.organizationId, t.accountId],
      foreignColumns: [accounts.organizationId, accounts.id],
      name: 'fk_jl_account',
    }),
    foreignKey({
      columns: [t.organizationId, t.partyId],
      foreignColumns: [parties.organizationId, parties.id],
      name: 'fk_jl_party',
    }),
    index('idx_jl_account').on(t.organizationId, t.accountId),
  ]
);

// 5. Audit & Transactional Outbox
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    actorUserId: uuid('actor_user_id').references(() => appUsers.id),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    beforeJson: jsonb('before_json'),
    afterJson: jsonb('after_json'),
    correlationId: text('correlation_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_audit_events_org_id').on(t.organizationId, t.id),
    index('idx_audit_entity').on(t.organizationId, t.entityType, t.entityId, t.createdAt),
  ]
);

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    eventType: text('event_type').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    payload: jsonb('payload').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('uq_outbox_events_org_id').on(t.organizationId, t.id)]
);

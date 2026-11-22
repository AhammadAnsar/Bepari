-- BEPARI — Phase 0 Canonical PostgreSQL Migration (0000_phase0_foundation.sql)
-- Includes: Identity, Tenant Core, RBAC, Branches, Fiscal Periods, Parties, Catalog,
-- Warehouses, Document Identity & Sequences, Idempotency, COA, Immutable Journals,
-- Audit/Outbox, PL/pgSQL Immutability & Deferred Balance Triggers, and Row-Level Security (RLS).

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION
  WHEN OTHERS THEN
    -- PostgreSQL 13+ provides gen_random_uuid() natively in core
    NULL;
END $$;

-- 1. Identity & Tenants
CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_subject text NOT NULL UNIQUE,
  display_name text NOT NULL,
  email text UNIQUE,
  password_hash text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name text NOT NULL,
  trade_name text,
  legal_country char(2) NOT NULL DEFAULT 'BD',
  base_currency char(3) NOT NULL DEFAULT 'BDT',
  timezone text NOT NULL DEFAULT 'Asia/Dhaka',
  reporting_language text NOT NULL DEFAULT 'bn' CHECK (reporting_language IN ('bn', 'en')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  code text NOT NULL,
  name text NOT NULL,
  address_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_branches_org_id UNIQUE (organization_id, id),
  CONSTRAINT uq_branches_org_code UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id),
  token_hash text NOT NULL UNIQUE,
  active_organization_id uuid REFERENCES organizations(id),
  active_branch_id uuid REFERENCES branches(id),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  user_id uuid NOT NULL REFERENCES app_users(id),
  role_code text NOT NULL CHECK (role_code IN ('owner', 'admin', 'accountant', 'sales', 'purchaser', 'storekeeper', 'auditor', 'custom')),
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'suspended', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_org_members_org_user UNIQUE (organization_id, user_id),
  CONSTRAINT uq_org_members_org_id UNIQUE (organization_id, id)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  role_code text NOT NULL,
  permission_key text NOT NULL,
  allowed boolean NOT NULL DEFAULT false,
  CONSTRAINT uq_role_permissions UNIQUE (organization_id, role_code, permission_key)
);

CREATE TABLE IF NOT EXISTS fiscal_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  period_code text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_on <= ends_on),
  CONSTRAINT uq_fiscal_periods_org_id UNIQUE (organization_id, id),
  CONSTRAINT uq_fiscal_periods_org_code UNIQUE (organization_id, period_code)
);

CREATE TABLE IF NOT EXISTS tax_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  branch_id uuid,
  registration_class text NOT NULL CHECK (registration_class IN ('registered', 'turnover_enlisted', 'unregistered', 'special', 'pending_review')),
  bin text,
  tin text,
  effective_from date NOT NULL,
  effective_to date,
  compliance_status text NOT NULL DEFAULT 'needs_review' CHECK (compliance_status IN ('needs_review', 'approved', 'inactive')),
  approved_by uuid REFERENCES app_users(id),
  CONSTRAINT uq_tax_profiles_org_id UNIQUE (organization_id, id),
  CONSTRAINT fk_tax_profiles_branch FOREIGN KEY (organization_id, branch_id) REFERENCES branches(organization_id, id),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

-- 2. Parties, Catalog & Locations
CREATE TABLE IF NOT EXISTS parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  display_name text NOT NULL,
  legal_name text,
  mobile text,
  email text,
  tax_bin text,
  tax_tin text,
  credit_limit numeric(20,6),
  payment_term_days integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_parties_org_id UNIQUE (organization_id, id),
  CHECK (credit_limit IS NULL OR credit_limit >= 0),
  CHECK (payment_term_days >= 0)
);

CREATE TABLE IF NOT EXISTS party_roles (
  organization_id uuid NOT NULL,
  party_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('customer', 'supplier')),
  PRIMARY KEY (organization_id, party_id, role),
  CONSTRAINT fk_party_roles_party FOREIGN KEY (organization_id, party_id) REFERENCES parties(organization_id, id)
);

CREATE TABLE IF NOT EXISTS party_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  party_id uuid NOT NULL,
  address_type text NOT NULL CHECK (address_type IN ('billing', 'shipping', 'registered', 'other')),
  address_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT uq_party_addresses_org_id UNIQUE (organization_id, id),
  CONSTRAINT fk_party_addresses_party FOREIGN KEY (organization_id, party_id) REFERENCES parties(organization_id, id)
);

CREATE TABLE IF NOT EXISTS units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  code text NOT NULL,
  name_bn text NOT NULL,
  name_en text,
  CONSTRAINT uq_units_org_id UNIQUE (organization_id, id),
  CONSTRAINT uq_units_org_code UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  sku text,
  item_type text NOT NULL CHECK (item_type IN ('product', 'service')),
  name_bn text NOT NULL,
  name_en text,
  base_unit_id uuid,
  default_price numeric(20,6) NOT NULL DEFAULT 0,
  tax_category_code text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_items_org_id UNIQUE (organization_id, id),
  CONSTRAINT uq_items_org_sku UNIQUE (organization_id, sku),
  CONSTRAINT fk_items_base_unit FOREIGN KEY (organization_id, base_unit_id) REFERENCES units(organization_id, id),
  CHECK (default_price >= 0)
);

CREATE TABLE IF NOT EXISTS warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  branch_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT uq_warehouses_org_id UNIQUE (organization_id, id),
  CONSTRAINT uq_warehouses_org_code UNIQUE (organization_id, code),
  CONSTRAINT fk_warehouses_branch FOREIGN KEY (organization_id, branch_id) REFERENCES branches(organization_id, id)
);

-- 3. Document Identity, Sequences & Idempotency
CREATE TABLE IF NOT EXISTS business_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  branch_id uuid,
  document_type text NOT NULL,
  document_number text,
  lifecycle_status text NOT NULL DEFAULT 'draft',
  revision integer NOT NULL DEFAULT 1,
  currency char(3) NOT NULL DEFAULT 'BDT',
  created_by uuid REFERENCES app_users(id),
  approved_by uuid REFERENCES app_users(id),
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_business_docs_org_id UNIQUE (organization_id, id),
  CONSTRAINT uq_business_docs_number UNIQUE (organization_id, branch_id, document_type, document_number),
  CONSTRAINT fk_business_docs_branch FOREIGN KEY (organization_id, branch_id) REFERENCES branches(organization_id, id),
  CHECK (revision > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_docs_legal_series_nonnull
ON business_documents(organization_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), document_type, document_number)
WHERE document_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS document_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  branch_scope text NOT NULL,
  document_type text NOT NULL,
  fiscal_key text NOT NULL,
  next_number bigint NOT NULL DEFAULT 1,
  CONSTRAINT uq_doc_sequences_scope UNIQUE (organization_id, branch_scope, document_type, fiscal_key),
  CHECK (next_number >= 1)
);

CREATE TABLE IF NOT EXISTS idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  operation_key text NOT NULL,
  request_hash text NOT NULL,
  result_reference text,
  status text NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_idempotency_org_key UNIQUE (organization_id, operation_key)
);

-- 4. Chart of Accounts & Immutable General Ledger
CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  account_code text NOT NULL,
  account_name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  parent_account_id uuid,
  is_control boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT uq_accounts_org_id UNIQUE (organization_id, id),
  CONSTRAINT uq_accounts_org_code UNIQUE (organization_id, account_code),
  CONSTRAINT fk_accounts_parent FOREIGN KEY (organization_id, parent_account_id) REFERENCES accounts(organization_id, id)
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  branch_id uuid,
  fiscal_period_id uuid NOT NULL,
  entry_date date NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'reversed')),
  reversal_of_id uuid,
  idempotency_key text NOT NULL,
  posted_at timestamptz,
  created_by uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_journal_entries_org_id UNIQUE (organization_id, id),
  CONSTRAINT uq_journal_entries_idempotency UNIQUE (organization_id, idempotency_key),
  CONSTRAINT fk_je_branch FOREIGN KEY (organization_id, branch_id) REFERENCES branches(organization_id, id),
  CONSTRAINT fk_je_fiscal_period FOREIGN KEY (organization_id, fiscal_period_id) REFERENCES fiscal_periods(organization_id, id),
  CONSTRAINT fk_je_reversal FOREIGN KEY (organization_id, reversal_of_id) REFERENCES journal_entries(organization_id, id)
);

CREATE TABLE IF NOT EXISTS journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  journal_entry_id uuid NOT NULL,
  account_id uuid NOT NULL,
  party_id uuid,
  debit numeric(20,6) NOT NULL DEFAULT 0,
  credit numeric(20,6) NOT NULL DEFAULT 0,
  memo text,
  CONSTRAINT fk_jl_journal_entry FOREIGN KEY (organization_id, journal_entry_id) REFERENCES journal_entries(organization_id, id),
  CONSTRAINT fk_jl_account FOREIGN KEY (organization_id, account_id) REFERENCES accounts(organization_id, id),
  CONSTRAINT fk_jl_party FOREIGN KEY (organization_id, party_id) REFERENCES parties(organization_id, id),
  CHECK (debit >= 0 AND credit >= 0),
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);

-- 5. Audit & Outbox
CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  actor_user_id uuid REFERENCES app_users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  before_json jsonb,
  after_json jsonb,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_audit_events_org_id UNIQUE (organization_id, id)
);

CREATE TABLE IF NOT EXISTS outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  payload jsonb NOT NULL,
  published_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_outbox_events_org_id UNIQUE (organization_id, id)
);

-- 6. Query Indexes
CREATE INDEX IF NOT EXISTS idx_party_name ON parties(organization_id, display_name);
CREATE INDEX IF NOT EXISTS idx_items_name ON items(organization_id, name_bn);
CREATE INDEX IF NOT EXISTS idx_je_date ON journal_entries(organization_id, entry_date, status);
CREATE INDEX IF NOT EXISTS idx_jl_account ON journal_lines(organization_id, account_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(organization_id, entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(created_at) WHERE published_at IS NULL;

-- 7. Financial Invariant Triggers (Deferred Balance Check & Immutability Guards)
CREATE OR REPLACE FUNCTION check_posted_journal_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d numeric(30,6); c numeric(30,6); s text;
BEGIN
  SELECT status INTO s FROM journal_entries WHERE id = NEW.id;
  IF s = 'posted' THEN
    SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
      INTO d, c FROM journal_lines WHERE journal_entry_id = NEW.id;
    IF d = 0 OR d <> c THEN
      RAISE EXCEPTION 'Posted journal % unbalanced: debit %, credit %', NEW.id, d, c;
    END IF;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS journal_balance_at_commit ON journal_entries;
CREATE CONSTRAINT TRIGGER journal_balance_at_commit
AFTER INSERT OR UPDATE ON journal_entries
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION check_posted_journal_balance();

CREATE OR REPLACE FUNCTION reject_posted_line_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE je_status text;
BEGIN
  SELECT status INTO je_status FROM journal_entries WHERE id = COALESCE(OLD.journal_entry_id, NEW.journal_entry_id);
  IF je_status IN ('posted', 'reversed') THEN
    RAISE EXCEPTION 'Cannot mutate lines of posted/reversed journal';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS journal_lines_immutable ON journal_lines;
CREATE TRIGGER journal_lines_immutable BEFORE UPDATE OR DELETE ON journal_lines
FOR EACH ROW EXECUTE FUNCTION reject_posted_line_mutation();

CREATE OR REPLACE FUNCTION protect_posted_journal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('posted', 'reversed') THEN
    RAISE EXCEPTION 'Cannot modify/delete a posted journal; create an audited reversal instead';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS journal_header_immutable ON journal_entries;
CREATE TRIGGER journal_header_immutable BEFORE UPDATE OR DELETE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION protect_posted_journal();

CREATE OR REPLACE FUNCTION reject_insert_into_posted_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE je_status text;
BEGIN
  SELECT status INTO je_status FROM journal_entries WHERE id = NEW.journal_entry_id;
  IF je_status IN ('posted', 'reversed') THEN
    RAISE EXCEPTION 'Cannot append line to posted journal';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS journal_lines_no_posted_insert ON journal_lines;
CREATE TRIGGER journal_lines_no_posted_insert BEFORE INSERT ON journal_lines
FOR EACH ROW EXECUTE FUNCTION reject_insert_into_posted_journal();

-- 8. Row-Level Security (RLS) Tenant Context Strategy
-- Helper function returning active session tenant UUID from `app.current_organization_id`
CREATE OR REPLACE FUNCTION current_app_organization_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_organization_id', true), '')::uuid;
$$;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'branches',
    'organization_members',
    'role_permissions',
    'fiscal_periods',
    'tax_profiles',
    'parties',
    'party_roles',
    'party_addresses',
    'units',
    'items',
    'warehouses',
    'business_documents',
    'document_sequences',
    'idempotency_records',
    'accounts',
    'journal_entries',
    'journal_lines',
    'audit_events',
    'outbox_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I;', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_policy ON %I FOR ALL USING (organization_id = current_app_organization_id()) WITH CHECK (organization_id = current_app_organization_id());',
      tbl
    );
  END LOOP;
END $$;

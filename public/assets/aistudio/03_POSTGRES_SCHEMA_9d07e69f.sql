-- BEPARI — PostgreSQL Reference Schema v1.0
-- IMPORTANT: reference baseline, not a completed production migration. Implement reviewed
-- versioned Drizzle migrations, PostgreSQL RLS/session context, API validation, trigger tests.
-- Never execute on an existing database without a backup, review and migration plan.
-- Tax/legal requirements must be independently approved.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Identity & tenants
CREATE TABLE app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_subject text NOT NULL UNIQUE,
  display_name text NOT NULL,
  email text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name text NOT NULL,
  trade_name text,
  legal_country char(2) NOT NULL DEFAULT 'BD',
  base_currency char(3) NOT NULL DEFAULT 'BDT',
  timezone text NOT NULL DEFAULT 'Asia/Dhaka',
  reporting_language text NOT NULL DEFAULT 'bn',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  user_id uuid NOT NULL REFERENCES app_users(id),
  role_code text NOT NULL CHECK (role_code IN ('owner','admin','accountant','sales','purchaser','storekeeper','auditor','custom')),
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','suspended','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,user_id), UNIQUE (organization_id,id)
);
CREATE TABLE role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  role_code text NOT NULL,
  permission_key text NOT NULL,
  allowed boolean NOT NULL DEFAULT false,
  UNIQUE (organization_id,role_code,permission_key)
);
CREATE TABLE branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  code text NOT NULL,
  name text NOT NULL,
  address_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (organization_id,id), UNIQUE (organization_id,code)
);
CREATE TABLE fiscal_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  period_code text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','locked','closed')),
  CHECK (starts_on <= ends_on),
  UNIQUE (organization_id,id), UNIQUE (organization_id,period_code)
);
CREATE TABLE tax_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  branch_id uuid,
  registration_class text NOT NULL CHECK (registration_class IN ('registered','turnover_enlisted','unregistered','special','pending_review')),
  bin text, tin text, effective_from date NOT NULL, effective_to date,
  compliance_status text NOT NULL DEFAULT 'needs_review' CHECK (compliance_status IN ('needs_review','approved','inactive')),
  approved_by uuid REFERENCES app_users(id),
  UNIQUE (organization_id,id),
  FOREIGN KEY (organization_id,branch_id) REFERENCES branches(organization_id,id),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

-- Parties, catalog and locations
CREATE TABLE parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  display_name text NOT NULL,
  legal_name text, mobile text, email text, tax_bin text, tax_tin text,
  credit_limit numeric(20,6), payment_term_days integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id), CHECK (credit_limit IS NULL OR credit_limit>=0), CHECK (payment_term_days>=0)
);
CREATE TABLE party_roles (
  organization_id uuid NOT NULL,
  party_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('customer','supplier')),
  PRIMARY KEY (organization_id,party_id,role),
  FOREIGN KEY (organization_id,party_id) REFERENCES parties(organization_id,id)
);
CREATE TABLE party_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  party_id uuid NOT NULL,
  address_type text NOT NULL CHECK (address_type IN ('billing','shipping','registered','other')),
  address_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  FOREIGN KEY (organization_id,party_id) REFERENCES parties(organization_id,id),
  UNIQUE (organization_id,id)
);
CREATE TABLE units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  code text NOT NULL, name_bn text NOT NULL, name_en text,
  UNIQUE (organization_id,id), UNIQUE (organization_id,code)
);
CREATE TABLE items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  sku text, item_type text NOT NULL CHECK (item_type IN ('product','service')),
  name_bn text NOT NULL, name_en text,
  base_unit_id uuid,
  default_price numeric(20,6) NOT NULL DEFAULT 0,
  tax_category_code text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id), UNIQUE (organization_id,sku),
  FOREIGN KEY (organization_id,base_unit_id) REFERENCES units(organization_id,id),
  CHECK (default_price>=0)
);
CREATE TABLE warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  branch_id uuid NOT NULL,
  code text NOT NULL, name text NOT NULL, is_active boolean NOT NULL DEFAULT true,
  UNIQUE (organization_id,id), UNIQUE (organization_id,code),
  FOREIGN KEY (organization_id,branch_id) REFERENCES branches(organization_id,id)
);
CREATE TABLE business_documents (
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
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,branch_id,document_type,document_number),
  FOREIGN KEY (organization_id,branch_id) REFERENCES branches(organization_id,id),
  CHECK (revision>0)
);
-- Practical note: PostgreSQL UNIQUE on nullable branch_id does not always prevent
-- same-org duplicates for null branch. Implement normalized branch scope or NULLS NOT DISTINCT
-- unique index in migrations, and a sequence allocation table protected by transaction locks.
CREATE TABLE document_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  branch_scope text NOT NULL, document_type text NOT NULL, fiscal_key text NOT NULL,
  next_number bigint NOT NULL DEFAULT 1,
  UNIQUE (organization_id,branch_scope,document_type,fiscal_key),
  CHECK (next_number>=1)
);
CREATE TABLE idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  operation_key text NOT NULL,
  request_hash text NOT NULL,
  result_reference text,
  status text NOT NULL CHECK (status IN ('processing','completed','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,operation_key)
);

-- Chart of accounts / ledger
CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  account_code text NOT NULL,
  account_name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
  parent_account_id uuid,
  is_control boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (organization_id,id), UNIQUE (organization_id,account_code),
  FOREIGN KEY (organization_id,parent_account_id) REFERENCES accounts(organization_id,id)
);
CREATE TABLE journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  branch_id uuid,
  fiscal_period_id uuid NOT NULL,
  entry_date date NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','reversed')),
  reversal_of_id uuid,
  idempotency_key text NOT NULL,
  posted_at timestamptz,
  created_by uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id), UNIQUE (organization_id,idempotency_key),
  FOREIGN KEY (organization_id,branch_id) REFERENCES branches(organization_id,id),
  FOREIGN KEY (organization_id,fiscal_period_id) REFERENCES fiscal_periods(organization_id,id),
  FOREIGN KEY (organization_id,reversal_of_id) REFERENCES journal_entries(organization_id,id)
);
CREATE TABLE journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  journal_entry_id uuid NOT NULL,
  account_id uuid NOT NULL,
  party_id uuid,
  debit numeric(20,6) NOT NULL DEFAULT 0,
  credit numeric(20,6) NOT NULL DEFAULT 0,
  memo text,
  FOREIGN KEY (organization_id,journal_entry_id) REFERENCES journal_entries(organization_id,id),
  FOREIGN KEY (organization_id,account_id) REFERENCES accounts(organization_id,id),
  FOREIGN KEY (organization_id,party_id) REFERENCES parties(organization_id,id),
  CHECK (debit >= 0 AND credit >= 0),
  CHECK ((debit>0 AND credit=0) OR (credit>0 AND debit=0))
);
-- Transaction-time validation must check posted journal balance and line immutability.
-- This deferred trigger demonstrates one invariant; domain code must also validate currency,
-- period state, account eligibility and source posting atomically.
CREATE OR REPLACE FUNCTION check_posted_journal_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d numeric(30,6); c numeric(30,6); s text;
BEGIN
  SELECT status INTO s FROM journal_entries WHERE id=NEW.id;
  IF s='posted' THEN
    SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
      INTO d,c FROM journal_lines WHERE journal_entry_id=NEW.id;
    IF d=0 OR d<>c THEN
      RAISE EXCEPTION 'Posted journal % unbalanced: debit %, credit %',NEW.id,d,c;
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER journal_balance_at_commit
AFTER INSERT OR UPDATE ON journal_entries
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION check_posted_journal_balance();
CREATE OR REPLACE FUNCTION reject_posted_line_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE je_status text;
BEGIN
  SELECT status INTO je_status FROM journal_entries WHERE id=COALESCE(OLD.journal_entry_id,NEW.journal_entry_id);
  IF je_status IN ('posted','reversed') THEN
    RAISE EXCEPTION 'Cannot mutate lines of posted/reversed journal';
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER journal_lines_immutable BEFORE UPDATE OR DELETE ON journal_lines
FOR EACH ROW EXECUTE FUNCTION reject_posted_line_mutation();
-- Prevent every mutation to an already-posted JE. Reverse by a NEW balanced JE linked to the original.
CREATE OR REPLACE FUNCTION protect_posted_journal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('posted','reversed') THEN
    RAISE EXCEPTION 'Cannot modify/delete a posted journal; create an audited reversal instead';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER journal_header_immutable BEFORE UPDATE OR DELETE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION protect_posted_journal();
CREATE OR REPLACE FUNCTION reject_insert_into_posted_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE je_status text;
BEGIN
  SELECT status INTO je_status FROM journal_entries WHERE id=NEW.journal_entry_id;
  IF je_status IN ('posted','reversed') THEN
    RAISE EXCEPTION 'Cannot append line to posted journal';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER journal_lines_no_posted_insert BEFORE INSERT ON journal_lines
FOR EACH ROW EXECUTE FUNCTION reject_insert_into_posted_journal();
-- DEFERRABLE balance trigger runs at commit even if lines are prepared before header status changes.

-- Tax rules (not populated until expert-reviewed)
CREATE TABLE tax_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  code text NOT NULL, treatment text NOT NULL,
  effective_from date NOT NULL, effective_to date,
  source_reference text NOT NULL,
  rule_json jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed','approved','retired')),
  approved_by uuid REFERENCES app_users(id), approved_at timestamptz,
  version_no integer NOT NULL,
  UNIQUE (organization_id,id), UNIQUE (organization_id,code,version_no),
  CHECK (effective_to IS NULL OR effective_to >= effective_from), CHECK(version_no>0)
);
CREATE TABLE tax_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  branch_id uuid,
  source_document_id uuid NOT NULL,
  tax_rule_id uuid,
  mushak_form text NOT NULL,
  serial_number text,
  tax_period text,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','reviewed','issued','voided')),
  issued_at timestamptz,
  payload_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,branch_id,mushak_form,serial_number),
  FOREIGN KEY (organization_id,source_document_id) REFERENCES business_documents(organization_id,id),
  FOREIGN KEY (organization_id,branch_id) REFERENCES branches(organization_id,id),
  FOREIGN KEY (organization_id,tax_rule_id) REFERENCES tax_rules(organization_id,id)
);
CREATE TABLE tax_register_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  tax_document_id uuid,
  source_document_id uuid NOT NULL,
  register_code text NOT NULL,
  tax_date date NOT NULL,
  taxable_base numeric(20,6) NOT NULL DEFAULT 0,
  tax_amount numeric(20,6) NOT NULL DEFAULT 0,
  input_credit_eligible boolean,
  FOREIGN KEY (organization_id,tax_document_id) REFERENCES tax_documents(organization_id,id),
  FOREIGN KEY (organization_id,source_document_id) REFERENCES business_documents(organization_id,id),
  UNIQUE (organization_id,id)
);

-- Sales
CREATE TABLE quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  document_id uuid NOT NULL,
  party_id uuid NOT NULL,
  valid_until date,
  currency char(3) NOT NULL DEFAULT 'BDT',
  total numeric(20,6) NOT NULL DEFAULT 0,
  UNIQUE (organization_id,id), UNIQUE (organization_id,document_id),
  FOREIGN KEY (organization_id,document_id) REFERENCES business_documents(organization_id,id),
  FOREIGN KEY (organization_id,party_id) REFERENCES parties(organization_id,id)
);
CREATE TABLE sales_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  document_id uuid NOT NULL, party_id uuid NOT NULL, quotation_id uuid,
  expected_date date,
  UNIQUE (organization_id,id), UNIQUE (organization_id,document_id),
  FOREIGN KEY (organization_id,document_id) REFERENCES business_documents(organization_id,id),
  FOREIGN KEY (organization_id,party_id) REFERENCES parties(organization_id,id),
  FOREIGN KEY (organization_id,quotation_id) REFERENCES quotations(organization_id,id)
);
CREATE TABLE sales_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  document_id uuid NOT NULL,
  party_id uuid NOT NULL,
  order_id uuid,
  invoice_date date NOT NULL,
  due_date date,
  subtotal numeric(20,6) NOT NULL,
  discount_total numeric(20,6) NOT NULL DEFAULT 0,
  vat_total numeric(20,6) NOT NULL DEFAULT 0,
  other_tax_total numeric(20,6) NOT NULL DEFAULT 0,
  grand_total numeric(20,6) NOT NULL,
  exchange_rate numeric(20,10) NOT NULL DEFAULT 1,
  pricing_mode text NOT NULL CHECK (pricing_mode IN ('tax_inclusive','tax_exclusive')),
  UNIQUE (organization_id,id), UNIQUE (organization_id,document_id),
  FOREIGN KEY (organization_id,document_id) REFERENCES business_documents(organization_id,id),
  FOREIGN KEY (organization_id,party_id) REFERENCES parties(organization_id,id),
  FOREIGN KEY (organization_id,order_id) REFERENCES sales_orders(organization_id,id),
  CHECK (grand_total>=0 AND subtotal>=0 AND discount_total>=0),
  CHECK (exchange_rate>0), CHECK (due_date IS NULL OR due_date>=invoice_date)
);
CREATE TABLE sales_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  line_no integer NOT NULL,
  item_id uuid,
  description_snapshot text NOT NULL,
  unit_snapshot text NOT NULL,
  quantity numeric(20,6) NOT NULL,
  unit_price numeric(20,6) NOT NULL,
  discount_amount numeric(20,6) NOT NULL DEFAULT 0,
  taxable_base numeric(20,6) NOT NULL DEFAULT 0,
  vat_amount numeric(20,6) NOT NULL DEFAULT 0,
  tax_rule_id uuid,
  tax_rule_version integer,
  line_total numeric(20,6) NOT NULL,
  FOREIGN KEY (organization_id,invoice_id) REFERENCES sales_invoices(organization_id,id),
  FOREIGN KEY (organization_id,item_id) REFERENCES items(organization_id,id),
  FOREIGN KEY (organization_id,tax_rule_id) REFERENCES tax_rules(organization_id,id),
  UNIQUE (organization_id,invoice_id,line_no),
  CHECK (line_no>0 AND quantity>0 AND unit_price>=0 AND discount_amount>=0)
);
CREATE TABLE delivery_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  document_id uuid NOT NULL,
  party_id uuid NOT NULL,
  order_id uuid,
  warehouse_id uuid NOT NULL,
  delivered_at timestamptz,
  UNIQUE (organization_id,id), UNIQUE (organization_id,document_id),
  FOREIGN KEY (organization_id,document_id) REFERENCES business_documents(organization_id,id),
  FOREIGN KEY (organization_id,party_id) REFERENCES parties(organization_id,id),
  FOREIGN KEY (organization_id,order_id) REFERENCES sales_orders(organization_id,id),
  FOREIGN KEY (organization_id,warehouse_id) REFERENCES warehouses(organization_id,id)
);
CREATE TABLE delivery_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  delivery_id uuid NOT NULL, item_id uuid NOT NULL,
  quantity numeric(20,6) NOT NULL,
  FOREIGN KEY (organization_id,delivery_id) REFERENCES delivery_notes(organization_id,id),
  FOREIGN KEY (organization_id,item_id) REFERENCES items(organization_id,id),
  CHECK (quantity>0)
);

-- Purchases and inventory
CREATE TABLE purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  document_id uuid NOT NULL, supplier_id uuid NOT NULL,
  expected_date date,
  UNIQUE (organization_id,id), UNIQUE (organization_id,document_id),
  FOREIGN KEY (organization_id,document_id) REFERENCES business_documents(organization_id,id),
  FOREIGN KEY (organization_id,supplier_id) REFERENCES parties(organization_id,id)
);
CREATE TABLE purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  purchase_order_id uuid NOT NULL,
  item_id uuid NOT NULL,
  quantity numeric(20,6) NOT NULL,
  unit_cost numeric(20,6) NOT NULL,
  FOREIGN KEY (organization_id,purchase_order_id) REFERENCES purchase_orders(organization_id,id),
  FOREIGN KEY (organization_id,item_id) REFERENCES items(organization_id,id),
  CHECK (quantity>0 AND unit_cost>=0)
);
CREATE TABLE goods_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  document_id uuid NOT NULL, supplier_id uuid NOT NULL,
  purchase_order_id uuid, warehouse_id uuid NOT NULL,
  received_at timestamptz,
  UNIQUE (organization_id,id), UNIQUE (organization_id,document_id),
  FOREIGN KEY (organization_id,document_id) REFERENCES business_documents(organization_id,id),
  FOREIGN KEY (organization_id,supplier_id) REFERENCES parties(organization_id,id),
  FOREIGN KEY (organization_id,purchase_order_id) REFERENCES purchase_orders(organization_id,id),
  FOREIGN KEY (organization_id,warehouse_id) REFERENCES warehouses(organization_id,id)
);
CREATE TABLE goods_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  goods_receipt_id uuid NOT NULL,
  item_id uuid NOT NULL,
  received_qty numeric(20,6) NOT NULL,
  accepted_qty numeric(20,6) NOT NULL,
  FOREIGN KEY (organization_id,goods_receipt_id) REFERENCES goods_receipts(organization_id,id),
  FOREIGN KEY (organization_id,item_id) REFERENCES items(organization_id,id),
  CHECK (received_qty>=0 AND accepted_qty>=0 AND accepted_qty<=received_qty)
);
CREATE TABLE supplier_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  document_id uuid NOT NULL, supplier_id uuid NOT NULL,
  purchase_order_id uuid, goods_receipt_id uuid,
  bill_date date NOT NULL, due_date date,
  subtotal numeric(20,6) NOT NULL, input_tax numeric(20,6) NOT NULL DEFAULT 0,
  grand_total numeric(20,6) NOT NULL,
  UNIQUE (organization_id,id), UNIQUE (organization_id,document_id),
  FOREIGN KEY (organization_id,document_id) REFERENCES business_documents(organization_id,id),
  FOREIGN KEY (organization_id,supplier_id) REFERENCES parties(organization_id,id),
  FOREIGN KEY (organization_id,purchase_order_id) REFERENCES purchase_orders(organization_id,id),
  FOREIGN KEY (organization_id,goods_receipt_id) REFERENCES goods_receipts(organization_id,id),
  CHECK (subtotal>=0 AND grand_total>=0)
);
CREATE TABLE supplier_bill_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  supplier_bill_id uuid NOT NULL,
  item_id uuid,
  description_snapshot text NOT NULL,
  quantity numeric(20,6) NOT NULL,
  cost numeric(20,6) NOT NULL,
  vat_amount numeric(20,6) NOT NULL DEFAULT 0,
  input_tax_eligible boolean NOT NULL DEFAULT false,
  FOREIGN KEY (organization_id,supplier_bill_id) REFERENCES supplier_bills(organization_id,id),
  FOREIGN KEY (organization_id,item_id) REFERENCES items(organization_id,id),
  CHECK(quantity>0 AND cost>=0)
);
CREATE TABLE stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  warehouse_id uuid NOT NULL,
  item_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('opening','receipt','delivery','transfer_in','transfer_out','adjustment','return_in','return_out')),
  source_type text NOT NULL, source_id uuid NOT NULL,
  quantity_delta numeric(20,6) NOT NULL,
  valuation_delta numeric(20,6) NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL,
  FOREIGN KEY (organization_id,warehouse_id) REFERENCES warehouses(organization_id,id),
  FOREIGN KEY (organization_id,item_id) REFERENCES items(organization_id,id),
  UNIQUE (organization_id,id), UNIQUE (organization_id,idempotency_key),
  CHECK (quantity_delta<>0)
);
CREATE TABLE inventory_cost_layers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  warehouse_id uuid NOT NULL, item_id uuid NOT NULL,
  source_movement_id uuid NOT NULL,
  original_qty numeric(20,6) NOT NULL,
  remaining_qty numeric(20,6) NOT NULL,
  unit_cost numeric(20,6) NOT NULL,
  FOREIGN KEY (organization_id,warehouse_id) REFERENCES warehouses(organization_id,id),
  FOREIGN KEY (organization_id,item_id) REFERENCES items(organization_id,id),
  FOREIGN KEY (organization_id,source_movement_id) REFERENCES stock_movements(organization_id,id),
  CHECK (original_qty>0 AND remaining_qty>=0 AND remaining_qty<=original_qty AND unit_cost>=0)
);

-- Payments, allocations and reconciliation
CREATE TABLE money_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  gl_account_id uuid NOT NULL,
  name text NOT NULL, account_kind text NOT NULL CHECK (account_kind IN ('cash','bank','mfs','clearing')),
  currency char(3) NOT NULL DEFAULT 'BDT',
  masked_account_ref text,
  UNIQUE (organization_id,id),
  FOREIGN KEY (organization_id,gl_account_id) REFERENCES accounts(organization_id,id)
);
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  document_id uuid NOT NULL,
  party_id uuid NOT NULL,
  money_account_id uuid NOT NULL,
  direction text NOT NULL CHECK(direction IN ('incoming','outgoing')),
  amount numeric(20,6) NOT NULL,
  currency char(3) NOT NULL DEFAULT 'BDT',
  occurred_at timestamptz NOT NULL,
  external_ref text,
  UNIQUE (organization_id,id), UNIQUE (organization_id,document_id),
  FOREIGN KEY (organization_id,document_id) REFERENCES business_documents(organization_id,id),
  FOREIGN KEY (organization_id,party_id) REFERENCES parties(organization_id,id),
  FOREIGN KEY (organization_id,money_account_id) REFERENCES money_accounts(organization_id,id),
  CHECK (amount>0)
);
CREATE TABLE payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  target_document_id uuid NOT NULL,
  amount numeric(20,6) NOT NULL,
  FOREIGN KEY (organization_id,payment_id) REFERENCES payments(organization_id,id),
  FOREIGN KEY (organization_id,target_document_id) REFERENCES business_documents(organization_id,id),
  CHECK (amount>0),
  UNIQUE (organization_id,payment_id,target_document_id)
);
-- Prevent total allocations exceeding payment and cross-party/cross-direction target links
-- in a SERIALIZABLE or properly locked service transaction, with integration tests.
CREATE TABLE bank_statement_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  money_account_id uuid NOT NULL,
  file_hash text NOT NULL, imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id), UNIQUE (organization_id,money_account_id,file_hash),
  FOREIGN KEY (organization_id,money_account_id) REFERENCES money_accounts(organization_id,id)
);
CREATE TABLE bank_statement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  import_id uuid NOT NULL,
  row_number integer NOT NULL,
  txn_date date NOT NULL,
  amount_signed numeric(20,6) NOT NULL,
  narration text,
  matched_payment_id uuid,
  FOREIGN KEY (organization_id,import_id) REFERENCES bank_statement_imports(organization_id,id),
  FOREIGN KEY (organization_id,matched_payment_id) REFERENCES payments(organization_id,id),
  UNIQUE (organization_id,import_id,row_number)
);

-- Recurring, documents, audit, asynchronous side effects
CREATE TABLE recurring_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  template_kind text NOT NULL CHECK(template_kind IN ('invoice','supplier_bill','expense')),
  timezone text NOT NULL DEFAULT 'Asia/Dhaka',
  schedule_rule text NOT NULL,
  starts_on date NOT NULL, ends_on date,
  next_run_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','ended')),
  template_payload jsonb NOT NULL,
  UNIQUE (organization_id,id), CHECK(ends_on IS NULL OR ends_on>=starts_on)
);
CREATE TABLE recurring_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  template_id uuid NOT NULL,
  occurrence_key text NOT NULL,
  generated_document_id uuid,
  status text NOT NULL CHECK(status IN ('pending','generated','failed','skipped')),
  attempts integer NOT NULL DEFAULT 0,
  error_code text,
  UNIQUE (organization_id,id), UNIQUE (organization_id,template_id,occurrence_key),
  FOREIGN KEY (organization_id,template_id) REFERENCES recurring_templates(organization_id,id),
  FOREIGN KEY (organization_id,generated_document_id) REFERENCES business_documents(organization_id,id)
);
CREATE TABLE attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  source_type text NOT NULL, source_id uuid NOT NULL,
  storage_key text NOT NULL, mime_type text NOT NULL,
  sha256 text NOT NULL, original_filename text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id), UNIQUE (organization_id,storage_key)
);
CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  actor_user_id uuid REFERENCES app_users(id),
  action text NOT NULL, entity_type text NOT NULL, entity_id uuid NOT NULL,
  before_json jsonb, after_json jsonb,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id)
);
CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  event_type text NOT NULL, aggregate_type text NOT NULL, aggregate_id uuid NOT NULL,
  payload jsonb NOT NULL,
  published_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id)
);

-- Query indexes
CREATE INDEX idx_party_name ON parties(organization_id,display_name);
CREATE INDEX idx_items_name ON items(organization_id,name_bn);
CREATE INDEX idx_je_date ON journal_entries(organization_id,entry_date,status);
CREATE INDEX idx_jl_account ON journal_lines(organization_id,account_id);
CREATE INDEX idx_invoices_due ON sales_invoices(organization_id,due_date);
CREATE INDEX idx_tax_reg ON tax_register_entries(organization_id,register_code,tax_date);
CREATE INDEX idx_stock_item_wh ON stock_movements(organization_id,item_id,warehouse_id,occurred_at);
CREATE INDEX idx_payments_party ON payments(organization_id,party_id,occurred_at);
CREATE INDEX idx_audit_entity ON audit_events(organization_id,entity_type,entity_id,created_at);
CREATE INDEX idx_outbox_pending ON outbox_events(created_at) WHERE published_at IS NULL;
CREATE INDEX idx_recurring_due ON recurring_templates(next_run_at) WHERE status='active';

-- PRODUCTION TODO (do not omit):
-- 1. Add PostgreSQL Row-Level Security policies and enforce tenant context per DB transaction.
--    Service roles and migrations must use separate DB credentials. Never accept org id from
--    client without verifying active membership and server-issued active organization context.
-- 2. Immutable GL guard: no insert/update/delete lines or metadata of posted/reversed journals;
--    block deletes; prohibit reversals outside open fiscal period; prove every entry balanced.
-- 3. Add document-type constraints, VAT form field-level constraints and legally reviewed templates.
-- 4. Validate reference UUID source_type/source_id through service and document registry.
-- 5. Implement detailed refund, FX gain/loss, cost-center dimensions, subscription billing
--    and advanced manufacturing tables with real composite tenant FKs in their phases.
-- 6. Add stricter domain constraints for role-specific party linkage, allocation sum,
--    approval segregation, product service-stock distinction, same currency and legal statuses.
-- 7. RLS, key rotation, backup encryption, PITR, database-level immutable audit policy,
--    integrity/restore tests and indexing review.
-- 8. Test all SQL with temporary PostgreSQL before enabling any production migrations.

-- Harden scoped legal numbering for nullable branch IDs and nullable serial numbers.
-- If PostgreSQL version supports NULLS NOT DISTINCT, a composite unique constraint is an alternative.
CREATE UNIQUE INDEX uq_docs_legal_series_nonnull
ON business_documents(organization_id, COALESCE(branch_id,'00000000-0000-0000-0000-000000000000'::uuid),document_type,document_number)
WHERE document_number IS NOT NULL;
CREATE UNIQUE INDEX uq_taxdocs_legal_series_nonnull
ON tax_documents(organization_id, COALESCE(branch_id,'00000000-0000-0000-0000-000000000000'::uuid),mushak_form,serial_number)
WHERE serial_number IS NOT NULL;

-- Additional production domain tables (constrained foundation; enhance with service validation).
CREATE TABLE price_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  currency char(3) NOT NULL DEFAULT 'BDT',
  valid_from date, valid_to date, is_active boolean NOT NULL DEFAULT true,
  UNIQUE(organization_id,id), UNIQUE(organization_id,name),
  CHECK(valid_from IS NULL OR valid_to IS NULL OR valid_to>=valid_from)
);
CREATE TABLE price_list_items (
  organization_id uuid NOT NULL, price_list_id uuid NOT NULL, item_id uuid NOT NULL,
  price numeric(20,6) NOT NULL,
  PRIMARY KEY (organization_id,price_list_id,item_id),
  FOREIGN KEY (organization_id,price_list_id) REFERENCES price_lists(organization_id,id),
  FOREIGN KEY (organization_id,item_id) REFERENCES items(organization_id,id),
  CHECK(price>=0)
);
CREATE TABLE expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL, expense_account_id uuid NOT NULL,
  UNIQUE(organization_id,id), UNIQUE(organization_id,name),
  FOREIGN KEY (organization_id,expense_account_id) REFERENCES accounts(organization_id,id)
);
CREATE TABLE expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  document_id uuid NOT NULL, branch_id uuid,
  paid_to_party_id uuid,
  expense_date date NOT NULL, description text,
  total_amount numeric(20,6) NOT NULL,
  approval_status text NOT NULL DEFAULT 'draft' CHECK(approval_status IN ('draft','submitted','approved','rejected','posted')),
  UNIQUE(organization_id,id), UNIQUE(organization_id,document_id),
  FOREIGN KEY (organization_id,document_id) REFERENCES business_documents(organization_id,id),
  FOREIGN KEY (organization_id,branch_id) REFERENCES branches(organization_id,id),
  FOREIGN KEY (organization_id,paid_to_party_id) REFERENCES parties(organization_id,id),
  CHECK(total_amount>=0)
);
CREATE TABLE expense_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  expense_id uuid NOT NULL,
  expense_category_id uuid NOT NULL,
  description text NOT NULL,
  net_amount numeric(20,6) NOT NULL,
  vat_amount numeric(20,6) NOT NULL DEFAULT 0,
  tax_rule_id uuid,
  FOREIGN KEY (organization_id,expense_id) REFERENCES expenses(organization_id,id),
  FOREIGN KEY (organization_id,expense_category_id) REFERENCES expense_categories(organization_id,id),
  FOREIGN KEY (organization_id,tax_rule_id) REFERENCES tax_rules(organization_id,id),
  CHECK(net_amount>=0)
);
CREATE TABLE inventory_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  document_id uuid NOT NULL, from_warehouse_id uuid NOT NULL, to_warehouse_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','dispatched','received','cancelled')),
  UNIQUE(organization_id,id), UNIQUE(organization_id,document_id),
  FOREIGN KEY (organization_id,document_id) REFERENCES business_documents(organization_id,id),
  FOREIGN KEY (organization_id,from_warehouse_id) REFERENCES warehouses(organization_id,id),
  FOREIGN KEY (organization_id,to_warehouse_id) REFERENCES warehouses(organization_id,id),
  CHECK(from_warehouse_id<>to_warehouse_id)
);
CREATE TABLE inventory_transfer_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
  transfer_id uuid NOT NULL, item_id uuid NOT NULL,
  quantity numeric(20,6) NOT NULL,
  FOREIGN KEY (organization_id,transfer_id) REFERENCES inventory_transfers(organization_id,id),
  FOREIGN KEY (organization_id,item_id) REFERENCES items(organization_id,id),
  CHECK(quantity>0)
);
CREATE TABLE stock_count_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  warehouse_id uuid NOT NULL, counted_on date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','submitted','approved','posted','cancelled')),
  created_by uuid REFERENCES app_users(id),
  UNIQUE(organization_id,id),
  FOREIGN KEY (organization_id,warehouse_id) REFERENCES warehouses(organization_id,id)
);
CREATE TABLE stock_count_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
  session_id uuid NOT NULL, item_id uuid NOT NULL,
  expected_qty numeric(20,6) NOT NULL, counted_qty numeric(20,6) NOT NULL,
  FOREIGN KEY (organization_id,session_id) REFERENCES stock_count_sessions(organization_id,id),
  FOREIGN KEY (organization_id,item_id) REFERENCES items(organization_id,id),
  UNIQUE(organization_id,session_id,item_id), CHECK(counted_qty>=0)
);
CREATE TABLE sales_credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  document_id uuid NOT NULL, original_invoice_id uuid NOT NULL,
  reason text NOT NULL, amount numeric(20,6) NOT NULL,
  UNIQUE(organization_id,id), UNIQUE(organization_id,document_id),
  FOREIGN KEY (organization_id,document_id) REFERENCES business_documents(organization_id,id),
  FOREIGN KEY (organization_id,original_invoice_id) REFERENCES sales_invoices(organization_id,id),
  CHECK(amount>0)
);
CREATE TABLE supplier_debit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  document_id uuid NOT NULL, original_bill_id uuid NOT NULL,
  reason text NOT NULL, amount numeric(20,6) NOT NULL,
  UNIQUE(organization_id,id), UNIQUE(organization_id,document_id),
  FOREIGN KEY (organization_id,document_id) REFERENCES business_documents(organization_id,id),
  FOREIGN KEY (organization_id,original_bill_id) REFERENCES supplier_bills(organization_id,id),
  CHECK(amount>0)
);
CREATE TABLE bank_reconciliation_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  statement_line_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  matched_amount numeric(20,6) NOT NULL,
  matched_by uuid NOT NULL REFERENCES app_users(id),
  matched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id),
  FOREIGN KEY (organization_id,statement_line_id) REFERENCES bank_statement_lines(organization_id,id),
  FOREIGN KEY (organization_id,payment_id) REFERENCES payments(organization_id,id),
  CHECK(matched_amount>0)
);
CREATE TABLE approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  document_id uuid NOT NULL,
  requested_by uuid NOT NULL REFERENCES app_users(id),
  decided_by uuid REFERENCES app_users(id),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz,
  UNIQUE(organization_id,id),
  FOREIGN KEY (organization_id,document_id) REFERENCES business_documents(organization_id,id)
);
CREATE TABLE vat_return_workpapers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  tax_profile_id uuid NOT NULL,
  period_code text NOT NULL,
  form_code text NOT NULL CHECK(form_code IN ('9.1','9.2')),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','reconciled','reviewed','exported','externally_confirmed')),
  amount_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by uuid REFERENCES app_users(id),
  filed_reference text,
  UNIQUE(organization_id,id), UNIQUE(organization_id,tax_profile_id,period_code,form_code),
  FOREIGN KEY (organization_id,tax_profile_id) REFERENCES tax_profiles(organization_id,id)
);
CREATE TABLE integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  provider text NOT NULL, purpose text NOT NULL,
  encrypted_secret_reference text,
  status text NOT NULL DEFAULT 'disabled' CHECK(status IN ('disabled','pending','active','revoked')),
  UNIQUE(organization_id,id)
);
CREATE TABLE notification_preferences (
  organization_id uuid NOT NULL REFERENCES organizations(id),
  user_id uuid NOT NULL REFERENCES app_users(id),
  event_code text NOT NULL, channel text NOT NULL CHECK(channel IN ('in_app','email','sms')),
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (organization_id,user_id,event_code,channel),
  FOREIGN KEY (organization_id,user_id) REFERENCES organization_members(organization_id,user_id)
);
CREATE INDEX idx_expenses_org_date ON expenses(organization_id,expense_date);
CREATE INDEX idx_vat_workpaper_period ON vat_return_workpapers(organization_id,period_code);
CREATE INDEX idx_stock_count_wh_date ON stock_count_sessions(organization_id,warehouse_id,counted_on);

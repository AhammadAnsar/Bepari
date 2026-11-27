-- Bepari Accounting & Inventory Schema for Cloudflare D1 (SQLite)
-- Optional: run via `wrangler d1 execute bepari-db --remote --file=d1/schema.sql`
-- (Note: Pages Functions also initialize & seed this schema automatically on first request.)

CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  name_bn TEXT NOT NULL,
  bin_number TEXT NOT NULL DEFAULT '',
  tin_number TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'BDT',
  currency_symbol TEXT NOT NULL DEFAULT '৳',
  default_language TEXT NOT NULL DEFAULT 'bn',
  inventory_method TEXT NOT NULL DEFAULT 'weighted_avg',
  vat_mode TEXT NOT NULL DEFAULT 'exclusive',
  fiscal_year_start_month INTEGER NOT NULL DEFAULT 7,
  invoice_prefix TEXT NOT NULL DEFAULT 'INV',
  mushak_prefix TEXT NOT NULL DEFAULT 'M63',
  admin_password_hash TEXT DEFAULT NULL,
  logo_url TEXT NOT NULL DEFAULT '',
  cash_memo_settings_json TEXT NOT NULL DEFAULT '',
  proprietor_name TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  business_description TEXT NOT NULL DEFAULT '',
  onboarding_completed INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_bn TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  is_main INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('owner','accountant','cashier','manager','auditor')),
  branch_id INTEGER REFERENCES branches(id),
  password_hash TEXT DEFAULT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_bn TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('asset','liability','equity','revenue','expense')),
  is_system INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS tax_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_bn TEXT NOT NULL,
  rate REAL NOT NULL CHECK (rate >= 0),
  sd_rate REAL NOT NULL DEFAULT 0 CHECK (sd_rate >= 0),
  mushak_category TEXT NOT NULL DEFAULT 'standard',
  effective_from TEXT NOT NULL,
  effective_to TEXT DEFAULT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  company_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  bin_number TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  opening_balance REAL NOT NULL DEFAULT 0,
  credit_limit REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  company_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  bin_number TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL UNIQUE,
  barcode TEXT NOT NULL DEFAULT '',
  brand TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  name_bn TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT 'pcs',
  category TEXT NOT NULL DEFAULT 'General',
  hs_code TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  track_inventory INTEGER NOT NULL DEFAULT 1,
  sale_price REAL NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
  cost_price REAL NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  tax_rule_id INTEGER REFERENCES tax_rules(id),
  reorder_level REAL NOT NULL DEFAULT 5,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS branch_stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity REAL NOT NULL DEFAULT 0,
  avg_cost REAL NOT NULL DEFAULT 0,
  fifo_lots_json TEXT NOT NULL DEFAULT '[]',
  UNIQUE(branch_id, product_id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('in','out','adjustment')),
  quantity REAL NOT NULL,
  unit_cost REAL NOT NULL DEFAULT 0,
  total_cost REAL NOT NULL DEFAULT 0,
  source_type TEXT NOT NULL,
  source_id INTEGER,
  movement_date TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_number TEXT NOT NULL UNIQUE,
  entry_date TEXT NOT NULL,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  source_type TEXT NOT NULL,
  source_id INTEGER,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','reversed')),
  reversal_of_id INTEGER REFERENCES journal_entries(id),
  created_by TEXT NOT NULL DEFAULT 'System',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS journal_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  debit REAL NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit REAL NOT NULL DEFAULT 0 CHECK (credit >= 0),
  memo TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT NOT NULL UNIQUE,
  mushak_challan_no TEXT NOT NULL UNIQUE,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','sent','partial','paid','overdue','void')),
  source TEXT NOT NULL DEFAULT 'invoice' CHECK (source IN ('invoice','pos','recurring')),
  subtotal REAL NOT NULL DEFAULT 0,
  discount_total REAL NOT NULL DEFAULT 0,
  sd_total REAL NOT NULL DEFAULT 0,
  vat_total REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  paid_amount REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  journal_entry_id INTEGER REFERENCES journal_entries(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  description TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  discount_amount REAL NOT NULL DEFAULT 0,
  tax_rule_id INTEGER REFERENCES tax_rules(id),
  tax_rate REAL NOT NULL DEFAULT 0,
  sd_rate REAL NOT NULL DEFAULT 0,
  taxable_value REAL NOT NULL DEFAULT 0,
  sd_amount REAL NOT NULL DEFAULT 0,
  vat_amount REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_number TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  payment_date TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN ('cash','bank','bkash','nagad','rocket','sslcommerz','card')),
  gateway_provider TEXT DEFAULT NULL,
  gateway_reference TEXT DEFAULT NULL,
  notes TEXT NOT NULL DEFAULT '',
  journal_entry_id INTEGER REFERENCES journal_entries(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payment_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount REAL NOT NULL CHECK (amount > 0)
);

CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_number TEXT NOT NULL UNIQUE,
  mushak_61_ref TEXT NOT NULL DEFAULT '',
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  purchase_date TEXT NOT NULL,
  subtotal REAL NOT NULL DEFAULT 0,
  vat_total REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  paid_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','partial','paid','void')),
  notes TEXT NOT NULL DEFAULT '',
  journal_entry_id INTEGER REFERENCES journal_entries(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity REAL NOT NULL,
  unit_cost REAL NOT NULL,
  vat_rate REAL NOT NULL DEFAULT 0,
  vat_amount REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_number TEXT NOT NULL UNIQUE,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  expense_date TEXT NOT NULL,
  category TEXT NOT NULL,
  account_code TEXT NOT NULL,
  vendor_name TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL CHECK (amount > 0),
  vat_amount REAL NOT NULL DEFAULT 0 CHECK (vat_amount >= 0),
  total_amount REAL NOT NULL CHECK (total_amount > 0),
  payment_method TEXT NOT NULL DEFAULT 'cash',
  reference TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  journal_entry_id INTEGER REFERENCES journal_entries(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recurring_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly','monthly','quarterly','yearly')),
  next_run_date TEXT NOT NULL,
  last_run_date TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  auto_send INTEGER NOT NULL DEFAULT 1,
  items_json TEXT NOT NULL,
  estimated_total REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('invoice','mushak_63','receipt','statement','purchase_bill')),
  reference_number TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  party_name TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  issued_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO organizations (
  id, name, name_bn, bin_number, tin_number, phone, email, address,
  currency, currency_symbol, default_language, inventory_method, vat_mode,
  fiscal_year_start_month, invoice_prefix, mushak_prefix, onboarding_completed
) VALUES (
  1, '', '', '', '', '', '', '',
  'BDT', '৳', 'bn', 'weighted_avg', 'exclusive', 7, 'INV', 'M63', 0
);

INSERT OR IGNORE INTO accounts (code, name, name_bn, type, is_system) VALUES
  ('1000', 'Cash in Hand', 'নগদ তহবিল', 'asset', 1),
  ('1010', 'Bank Account (Prime Bank)', 'ব্যাংক হিসাব', 'asset', 1),
  ('1020', 'MFS & Gateway (bKash / Nagad / SSL)', 'মোবাইল ব্যাংকিং ও গেটওয়ে', 'asset', 1),
  ('1100', 'Accounts Receivable', 'প্রাপ্য হিসাব (কাস্টমার)', 'asset', 1),
  ('1200', 'Inventory Asset', 'মজুদ পণ্য', 'asset', 1),
  ('1300', 'Input VAT Receivable (Mushak 6.1)', 'উপকরণ কর রেয়াত (মূসক ৬.১)', 'asset', 1),
  ('2000', 'Accounts Payable', 'প্রদেয় হিসাব (সরবরাহকারী)', 'liability', 1),
  ('2100', 'Output VAT Payable (Mushak 6.3)', 'প্রদেয় মূসক (মূসক ৬.৩)', 'liability', 1),
  ('2110', 'Supplementary Duty Payable (SD)', 'প্রদেয় সম্পূরক শুল্ক', 'liability', 1),
  ('3000', 'Owner Capital & Opening Equity', 'মালিকের মূলধন', 'equity', 1),
  ('4000', 'Sales Revenue', 'বিক্রয় আয়', 'revenue', 1),
  ('4100', 'Service & Retainer Revenue', 'সেবা ও সাবস্ক্রিপশন আয়', 'revenue', 1),
  ('5000', 'Cost of Goods Sold (COGS)', 'বিক্রীত পণ্যের ব্যয়', 'expense', 1),
  ('5100', 'Office & Warehouse Rent', 'অফিস ও গুদাম ভাড়া', 'expense', 1),
  ('5200', 'Utilities & Internet', 'বিদ্যুৎ, গ্যাস ও ইন্টারনেট', 'expense', 1),
  ('5300', 'Staff Salaries & Wages', 'কর্মচারী বেতন-ভাতা', 'expense', 1),
  ('5400', 'Logistics & Delivery', 'পরিবহন ও ডেলিভারি', 'expense', 1),
  ('5500', 'Office Supplies & Misc', 'অফিস ও বিবিধ খরচ', 'expense', 1);

INSERT OR IGNORE INTO tax_rules (code, name, name_bn, rate, sd_rate, mushak_category, effective_from, effective_to, is_default) VALUES
  ('VAT-15', 'Standard VAT 15%', 'আদর্শ মূসক ১৫%', 15, 0, 'standard', '2025-07-01', NULL, 1),
  ('VAT-7.5', 'Truncated VAT 7.5%', 'হ্রাসকৃত মূসক ৭.৫%', 7.5, 0, 'truncated', '2025-07-01', NULL, 0),
  ('VAT-5', 'Reduced VAT 5%', 'হ্রাসকৃত মূসক ৫%', 5, 0, 'truncated', '2025-07-01', NULL, 0),
  ('VAT-0', 'Zero-Rated Export 0%', 'শূন্য হার (রপ্তানি) ০%', 0, 0, 'zero_rated', '2025-07-01', NULL, 0),
  ('VAT-EX', 'VAT Exempt', 'মূসক অব্যাহতিপ্রাপ্ত', 0, 0, 'exempt', '2025-07-01', NULL, 0);

import type { CashMemoSettings } from '../lib/cashMemoTemplates';

export type Language = 'bn' | 'en';
export type UserRole = 'owner' | 'accountant' | 'cashier' | 'manager' | 'auditor';
export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type InvoiceStatus = 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'void';
export type PaymentMethod = 'cash' | 'bank' | 'bkash' | 'nagad' | 'rocket' | 'sslcommerz' | 'card';
export type InventoryMethod = 'weighted_avg' | 'fifo';
export type TaxMode = 'exclusive' | 'inclusive';
export type RecurringFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface Organization {
  id: number;
  name: string;
  nameBn: string;
  binNumber: string;
  tinNumber: string;
  phone: string;
  email: string;
  address: string;
  currency: string;
  currencySymbol: string;
  defaultLanguage: Language;
  documentLanguage?: Language;
  inventoryMethod: InventoryMethod;
  vatMode: TaxMode;
  fiscalYearStartMonth: number;
  invoicePrefix: string;
  mushakPrefix: string;
  quotationPrefix?: string;
  challanPrefix?: string;
  proprietorName?: string;
  tagline?: string;
  website?: string;
  businessDescription?: string;
  logoUrl?: string;
  cashMemoSettings?: CashMemoSettings;
  adminLockEnabled?: boolean;
}

export interface Branch {
  id: number;
  code: string;
  name: string;
  nameBn: string;
  address: string;
  phone: string;
  isMain: boolean;
  isActive: boolean;
}

export interface UserAccount {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  branchId: number | null;
  isActive: boolean;
  createdAt: string;
}

export interface TaxRule {
  id: number;
  code: string;
  name: string;
  nameBn: string;
  rate: number;
  sdRate: number;
  mushakCategory: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isDefault: boolean;
  isActive: boolean;
}

export interface Account {
  id: number;
  code: string;
  name: string;
  nameBn: string;
  type: AccountType;
  isSystem: boolean;
}

export interface Customer {
  id: number;
  code: string;
  name: string;
  companyName: string;
  phone: string;
  email: string;
  binNumber: string;
  address: string;
  openingBalance: number;
  creditLimit: number;
  receivableBalance?: number;
  totalInvoiced?: number;
  totalPaid?: number;
  createdAt: string;
}

export interface Vendor {
  id: number;
  code: string;
  name: string;
  companyName: string;
  phone: string;
  email: string;
  binNumber: string;
  address: string;
  payableBalance?: number;
  createdAt: string;
}

export interface ProductBranchStock {
  branchId: number;
  branchCode: string;
  branchName: string;
  branchNameBn: string;
  quantity: number;
  avgCost: number;
  stockValue: number;
}

export interface StockMovementRecord {
  id: number;
  branchId: number;
  branchName: string;
  branchNameBn: string;
  productId: number;
  movementType: 'in' | 'out' | 'adjustment';
  quantity: number;
  unitCost: number;
  totalCost: number;
  sourceType: string;
  sourceId: number | null;
  movementDate: string;
  notes: string;
  createdAt: string;
}

export interface Product {
  id: number;
  sku: string;
  barcode?: string;
  brand?: string;
  size?: string;
  color?: string;
  name: string;
  nameBn: string;
  unit: string;
  category: string;
  hsCode: string;
  description?: string;
  imageUrl?: string;
  isActive?: boolean;
  trackInventory: boolean;
  salePrice: number;
  costPrice: number;
  taxRuleId: number | null;
  taxRate?: number;
  reorderLevel: number;
  stockQty?: number;
  stockValue?: number;
  branchStocks?: ProductBranchStock[];
}

export interface InvoiceLineInput {
  productId: number | null;
  description: string;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  taxRuleId: number | null;
  taxRate: number;
  sdRate?: number;
  taxMode?: TaxMode;
}

export interface ComputedInvoiceLine {
  productId: number | null;
  productSku?: string;
  productUnit?: string;
  productBrand?: string;
  productSize?: string;
  productColor?: string;
  productDescription?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxRuleId: number | null;
  taxRate: number;
  sdRate: number;
  taxableValue: number;
  sdAmount: number;
  vatAmount: number;
  lineTotal: number;
}

export interface Invoice {
  id: number;
  invoiceNumber: string;
  mushakChallanNo: string;
  poNumber?: string;
  challanNumber?: string;
  challanDate?: string;
  quotationId?: number | null;
  branchId: number;
  branchName?: string;
  branchNameBn?: string;
  branchAddress?: string;
  branchPhone?: string;
  customerId: number;
  customerCode?: string;
  customerName?: string;
  customerCompanyName?: string;
  customerBin?: string;
  customerAddress?: string;
  customerPhone?: string;
  customerEmail?: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  source: 'invoice' | 'pos' | 'recurring';
  subtotal: number;
  discountTotal: number;
  sdTotal: number;
  vatTotal: number;
  grandTotal: number;
  paidAmount: number;
  balanceDue: number;
  notes: string;
  journalEntryId: number | null;
  items?: ComputedInvoiceLine[];
  createdAt: string;
}

export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'converted' | 'expired';

export interface Quotation {
  id: number;
  quotationNumber: string;
  branchId: number;
  branchName?: string;
  branchNameBn?: string;
  branchAddress?: string;
  branchPhone?: string;
  customerId: number;
  customerCode?: string;
  customerName?: string;
  customerCompanyName?: string;
  customerBin?: string;
  customerAddress?: string;
  customerPhone?: string;
  customerEmail?: string;
  issueDate: string;
  validUntil: string;
  poNumber?: string;
  status: QuotationStatus;
  subtotal: number;
  discountTotal: number;
  sdTotal: number;
  vatTotal: number;
  grandTotal: number;
  notes: string;
  convertedInvoiceId?: number | null;
  convertedInvoiceNumber?: string | null;
  items?: ComputedInvoiceLine[];
  createdAt: string;
}

export interface Payment {
  id: number;
  paymentNumber: string;
  customerId: number;
  customerName?: string;
  branchId: number;
  paymentDate: string;
  amount: number;
  method: PaymentMethod;
  gatewayProvider: string | null;
  gatewayReference: string | null;
  notes: string;
  journalEntryId: number | null;
  allocations?: { invoiceId: number; invoiceNumber: string; amount: number }[];
  createdAt: string;
}

export interface PurchaseLineItem {
  id?: number;
  productId: number;
  quantity: number;
  unitCost: number;
  vatRate: number;
  vatAmount: number;
  lineTotal: number;
}

export interface Purchase {
  id: number;
  billNumber: string;
  mushak61Ref: string;
  branchId: number;
  branchName?: string;
  vendorId: number;
  vendorName?: string;
  purchaseDate: string;
  subtotal: number;
  vatTotal: number;
  grandTotal: number;
  paidAmount: number;
  status: 'posted' | 'partial' | 'paid' | 'void';
  journalEntryId: number | null;
  notes: string;
  createdAt: string;
  items?: PurchaseLineItem[];
}

export interface Expense {
  id: number;
  expenseNumber: string;
  branchId: number;
  branchName?: string;
  expenseDate: string;
  category: string;
  accountCode: string;
  vendorName: string;
  amount: number;
  vatAmount: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  reference: string;
  notes: string;
  journalEntryId: number | null;
  createdAt: string;
}

export interface JournalLine {
  id?: number;
  accountId?: number;
  accountCode: string;
  accountName?: string;
  accountType?: AccountType;
  debit: number;
  credit: number;
  memo?: string;
}

export interface JournalEntry {
  id: number;
  entryNumber: string;
  entryDate: string;
  branchId: number;
  sourceType: string;
  sourceId: number | null;
  description: string;
  status: 'posted' | 'reversed';
  reversalOfId: number | null;
  reversedById?: number | null;
  createdBy: string;
  createdAt: string;
  lines: JournalLine[];
}

export interface RecurringProfile {
  id: number;
  title: string;
  customerId: number;
  customerName?: string;
  branchId: number;
  frequency: RecurringFrequency;
  nextRunDate: string;
  lastRunDate: string | null;
  status: 'active' | 'paused';
  autoSend: boolean;
  items: InvoiceLineInput[];
  estimatedTotal: number;
}

export interface DocumentRecord {
  id: number;
  docType: 'invoice' | 'mushak_63' | 'receipt' | 'statement' | 'purchase_bill';
  referenceNumber: string;
  entityType: string;
  entityId: number;
  title: string;
  partyName: string;
  amount: number;
  issuedAt: string;
}

export interface AlertItem {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  category: 'overdue' | 'low_stock' | 'recurring' | 'vat';
  title: string;
  titleBn: string;
  detail: string;
  detailBn: string;
  entityType: string;
  entityId?: number;
}

export interface AuditLog {
  id: number;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  createdAt: string;
}

export interface StatementRow {
  date: string;
  type: 'opening' | 'invoice' | 'payment';
  reference: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

export interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  accountNameBn: string;
  accountType: AccountType;
  debit: number;
  credit: number;
  netBalance: number;
}

export interface FinancialReportSummary {
  trialBalance: {
    rows: TrialBalanceRow[];
    totalDebit: number;
    totalCredit: number;
    isBalanced: boolean;
  };
  profitAndLoss: {
    revenue: { code: string; name: string; nameBn: string; amount: number }[];
    expenses: { code: string; name: string; nameBn: string; amount: number }[];
    totalRevenue: number;
    totalExpenses: number;
    grossProfit: number;
    netProfit: number;
  };
  balanceSheet: {
    assets: { code: string; name: string; nameBn: string; amount: number }[];
    liabilities: { code: string; name: string; nameBn: string; amount: number }[];
    equity: { code: string; name: string; nameBn: string; amount: number }[];
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    retainedEarnings: number;
    isBalanced: boolean;
  };
  cashFlow: {
    operatingInflows: number;
    operatingOutflows: number;
    netCashFlow: number;
    endingCashBalance: number;
  };
  vatReturn: {
    outputVat: number;
    inputVat: number;
    sdPayable: number;
    netVatPayable: number;
    taxableSales: number;
    taxablePurchases: number;
    challanCount: number;
  };
}

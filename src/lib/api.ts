import type {
  Account,
  AlertItem,
  AuditLog,
  Branch,
  Customer,
  DocumentRecord,
  Expense,
  FinancialReportSummary,
  Invoice,
  JournalEntry,
  Organization,
  Payment,
  Product,
  Purchase,
  RecurringProfile,
  StatementRow,
  StockMovementRecord,
  TaxRule,
  UserAccount,
  UserRole,
  Vendor,
} from '../engine/types';

export interface WorkspacePayload {
  organization: Organization;
  branches: Branch[];
  taxRules: TaxRule[];
  accounts: Account[];
  customers: Customer[];
  vendors: Vendor[];
  products: Product[];
  invoices: Invoice[];
  payments: Payment[];
  purchases: Purchase[];
  expenses: Expense[];
  journals: JournalEntry[];
  recurringProfiles: RecurringProfile[];
  documents: DocumentRecord[];
  auditLogs: AuditLog[];
  users: UserAccount[];
  reports: FinancialReportSummary;
  alerts: AlertItem[];
}

export interface SessionInfo {
  token: string;
  user: {
    id: number;
    name: string;
    email: string;
    role: UserRole;
    branchId: number | null;
  };
  permissions: string[];
  locked: boolean;
}

// Keep session token strictly in memory (never localStorage or sessionStorage)
let memoryToken: string | null = null;

export function setMemoryToken(token: string | null) {
  memoryToken = token;
}

export async function apiRequest<T>(
  url: string,
  options: { method?: string; body?: unknown; idempotencyKey?: string } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (memoryToken) {
    headers['Authorization'] = `Bearer ${memoryToken}`;
  }
  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error || `Request failed (${res.status})`);
  }
  return payload as T;
}

export interface OnboardingPayload {
  ownerName: string;
  ownerEmail: string;
  password: string;
  orgNameBn: string;
  orgNameEn: string;
  proprietorName?: string;
  phone: string;
  address: string;
  binNumber?: string;
  tinNumber?: string;
  tagline?: string;
  website?: string;
  businessDescription?: string;
  vatMode?: 'exclusive' | 'inclusive';
  defaultLanguage?: 'bn' | 'en';
  branchNameBn?: string;
  branchNameEn?: string;
  branchCode?: string;
}

export function fetchAuthStatus() {
  return apiRequest<{
    needsOnboarding: boolean;
    locked: boolean;
    users: { id: number; name: string; email: string; role: UserRole }[];
  }>('/api/auth/status');
}

export function completeOnboardingApi(body: OnboardingPayload) {
  return apiRequest<SessionInfo>('/api/auth/onboard', {
    method: 'POST',
    body,
  });
}

export function bootstrapSession(userId?: number) {
  return apiRequest<SessionInfo>('/api/auth/bootstrap-session', {
    method: 'POST',
    body: userId ? { userId } : {},
  });
}

export function loginWithPassword(email: string, password: string) {
  return apiRequest<SessionInfo>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export function switchRoleSession(userId: number) {
  return apiRequest<SessionInfo>('/api/auth/switch-role', {
    method: 'POST',
    body: { userId },
  });
}

export function logoutSession() {
  return apiRequest<{ ok: boolean }>('/api/auth/logout', {
    method: 'POST',
  });
}

export function fetchWorkspace(branchId?: number | null) {
  const query = branchId ? `?branchId=${branchId}` : '';
  return apiRequest<WorkspacePayload>(`/api/workspace${query}`);
}

export function fetchCustomerStatement(customerId: number) {
  return apiRequest<{ customer: Customer; rows: StatementRow[]; closingBalance: number }>(
    `/api/customers/${customerId}/statement`
  );
}

export interface ProductUpsertPayload {
  sku?: string;
  barcode?: string;
  brand?: string;
  name: string;
  nameBn?: string;
  unit?: string;
  category?: string;
  hsCode?: string;
  description?: string;
  imageUrl?: string;
  isActive?: boolean;
  trackInventory?: boolean;
  salePrice: number;
  costPrice: number;
  taxRuleId?: number | null;
  reorderLevel?: number;
  initialStock?: number;
  branchId?: number;
}

export function createProductApi(body: ProductUpsertPayload) {
  return apiRequest<{ id: number; sku: string }>('/api/products', {
    method: 'POST',
    body,
  });
}

export function updateProductApi(productId: number, body: ProductUpsertPayload) {
  return apiRequest<{ id: number; sku: string }>(`/api/products/${productId}`, {
    method: 'PUT',
    body,
  });
}

export function fetchProductMovements(productId: number) {
  return apiRequest<{ movements: StockMovementRecord[] }>(`/api/products/${productId}/movements`);
}

export function adjustProductStockApi(
  productId: number,
  body: {
    branchId: number;
    mode: 'add' | 'reduce' | 'set';
    quantity: number;
    unitCost?: number;
    reason: string;
    date?: string;
  }
) {
  return apiRequest<{ newQuantity: number; delta: number; journalEntryId: number | null }>(
    `/api/products/${productId}/adjust-stock`,
    { method: 'POST', body }
  );
}

export function transferProductStockApi(body: {
  productId: number;
  fromBranchId: number;
  toBranchId: number;
  quantity: number;
  notes?: string;
  date?: string;
}) {
  return apiRequest<{ transferredQty: number; unitCost: number }>('/api/products/transfer-stock', {
    method: 'POST',
    body,
  });
}

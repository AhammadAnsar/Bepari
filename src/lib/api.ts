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
import { handleApiRequest, type RuntimeEngine } from '../server/apiRouter';
import {
  exportBrowserSqliteBytes,
  getBrowserSqliteClient,
  importBrowserSqliteBytes,
  persistBrowserSqliteSnapshot,
} from './browserSqliteClient';

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
let detectedEngine: RuntimeEngine | null = null;
let detectPromise: Promise<RuntimeEngine> | null = null;

export function setMemoryToken(token: string | null) {
  memoryToken = token;
}

export function getActiveRuntimeEngine(): RuntimeEngine {
  return detectedEngine || 'on-device';
}

export async function detectRuntimeEngine(): Promise<RuntimeEngine> {
  if (detectedEngine) return detectedEngine;
  if (detectPromise) return detectPromise;

  detectPromise = (async (): Promise<RuntimeEngine> => {
    try {
      const res = await fetch('/api/runtime', {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        detectedEngine = 'on-device';
        return detectedEngine;
      }
      const data = (await res.json()) as { engine?: unknown };
      if (data?.engine === 'cloud-d1' || data?.engine === 'node-sqlite') {
        detectedEngine = data.engine;
      } else {
        detectedEngine = 'on-device';
      }
      return detectedEngine;
    } catch {
      detectedEngine = 'on-device';
      return detectedEngine;
    }
  })();

  return detectPromise;
}

export async function exportDeviceSqliteBackup(): Promise<void> {
  const bytes = await exportBrowserSqliteBytes();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: 'application/x-sqlite3' });
  const url = URL.createObjectURL(blob);
  const dateStr = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bepari-backup-${dateStr}.sqlite`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importDeviceSqliteBackup(file: File): Promise<void> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  await importBrowserSqliteBytes(bytes);
  memoryToken = null;
}

export async function apiRequest<T>(
  url: string,
  options: { method?: string; body?: unknown; idempotencyKey?: string } = {}
): Promise<T> {
  const engine = await detectRuntimeEngine();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (memoryToken) {
    headers['Authorization'] = `Bearer ${memoryToken}`;
  }
  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  const method = (options.method || 'GET').toUpperCase();
  const bodyStr = options.body !== undefined ? JSON.stringify(options.body) : undefined;

  if (engine === 'on-device') {
    const db = await getBrowserSqliteClient();
    const requestUrl = url.startsWith('http') ? url : `http://localhost${url.startsWith('/') ? '' : '/'}${url}`;
    const webReq = new Request(requestUrl, {
      method,
      headers,
      body: method !== 'GET' && method !== 'HEAD' ? bodyStr : undefined,
    });
    const res = await handleApiRequest(webReq, db, {
      runtimeEngine: 'on-device',
      onMutate: persistBrowserSqliteSnapshot,
    });
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      throw new Error(payload.error || `Request failed (${res.status})`);
    }
    return payload as T;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: method !== 'GET' && method !== 'HEAD' ? bodyStr : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? ((await res.json().catch(() => ({}))) as { error?: string })
    : {};
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

import { computeInvoiceTotals, computeNextRecurringDate } from '../engine/billing.ts';
import type { UserRole } from '../engine/types.ts';
import { sanitizeCashMemoSettings } from '../lib/cashMemoTemplates.ts';
import {
  authenticateBearerTokenAsync,
  createSessionAsync,
  getRolePermissions,
  hashPasswordAsync,
  hasPermission,
  isWorkspacePasswordLockedAsync,
  verifyPasswordAsync,
  verifyWorkspaceAdminPasscodeAsync,
  type AuthSessionUser,
  type LegacyPasswordVerifier,
  type Permission,
} from './authCore.ts';
import type { DbClient } from './dbClient.ts';
import {
  adjustProductStockTransaction,
  createExpenseTransaction,
  createInvoiceTransaction,
  createPurchaseTransaction,
  deleteBranchRecord,
  deleteCustomerRecord,
  deleteExpenseTransaction,
  deleteInvoiceTransaction,
  deletePaymentTransaction,
  deleteProductRecord,
  deletePurchaseTransaction,
  deleteRecurringProfile,
  deleteTaxRule,
  deleteUserRecord,
  deleteVendorRecord,
  getCustomerStatementData,
  getInvoiceById,
  listAllWorkspaceData,
  listProductStockMovements,
  onboardWorkspaceTransaction,
  recordPaymentTransaction,
  resetToCleanWorkspace,
  reverseJournalEntry,
  runRecurringProfileNow,
  sanitizeProductImageUrl,
  transferProductStockTransaction,
  updateBranchRecord,
  updateCustomerRecord,
  updateExpenseTransaction,
  updateInvoiceTransaction,
  updatePaymentTransaction,
  updateProductRecord,
  updatePurchaseTransaction,
  updateRecurringProfile,
  updateTaxRule,
  updateUserRecord,
  updateVendorRecord,
  writeAuditLog,
} from './services/engineService.ts';

export type RuntimeEngine = 'node-sqlite' | 'cloud-d1' | 'on-device';

export interface ApiRouterOptions {
  runtimeEngine: RuntimeEngine;
  envAdminPasscode?: string;
  legacyScryptVerifier?: LegacyPasswordVerifier;
  onMutate?: () => Promise<void>;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    throw new Error('Invalid JSON payload.');
  }
}

function parsePositiveId(raw: string): number | null {
  const num = Number(raw);
  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}

export async function handleApiRequest(
  request: Request,
  db: DbClient,
  opts: ApiRouterOptions
): Promise<Response> {
  const response = await routeApiRequest(request, db, opts);
  const method = request.method.toUpperCase();
  if (
    response.ok &&
    opts.onMutate &&
    (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE')
  ) {
    await opts.onMutate();
  }
  return response;
}

async function routeApiRequest(
  request: Request,
  db: DbClient,
  opts: ApiRouterOptions
): Promise<Response> {
  const url = new URL(request.url, 'http://localhost');
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();
  const envPassSet = Boolean(opts.envAdminPasscode && opts.envAdminPasscode.trim().length > 0);

  // Runtime engine capability discovery
  if (method === 'GET' && pathname === '/api/runtime') {
    return jsonResponse({
      engine: opts.runtimeEngine,
      cloudAvailable: opts.runtimeEngine === 'cloud-d1',
    });
  }

  // Auth helper
  const requireAuth = async (
    permission?: Permission
  ): Promise<{ user: AuthSessionUser; sessionToken: string } | Response> => {
    const auth = await authenticateBearerTokenAsync(db, request.headers.get('authorization'));
    if (!auth) {
      return jsonResponse({ error: 'Authentication required.' }, 401);
    }
    if (permission && !hasPermission(auth.user.role, permission)) {
      return jsonResponse(
        { error: `Access denied: role "${auth.user.role}" lacks "${permission}" permission.` },
        403
      );
    }
    return auth;
  };

  // ---------------- Auth, First-Run Onboarding & Session Routes ----------------

  if (method === 'GET' && pathname === '/api/auth/status') {
    const orgRow = await db.get<{ onboarding_completed?: number }>(
      'SELECT onboarding_completed FROM organizations WHERE id = 1'
    );
    const users = await db.all<{ id: number; name: string; email: string; role: UserRole; branchId: number | null }>(
      'SELECT id, name, email, role, branch_id as branchId FROM users WHERE is_active = 1 ORDER BY id ASC'
    );
    const needsOnboarding = !orgRow?.onboarding_completed || users.length === 0;
    const locked = needsOnboarding
      ? true
      : await isWorkspacePasswordLockedAsync(db, opts.envAdminPasscode);
    return jsonResponse({ needsOnboarding, locked, users });
  }

  if (method === 'POST' && pathname === '/api/auth/onboard') {
    try {
      const body = await readJsonBody(request);
      const {
        ownerName,
        ownerEmail,
        password,
        orgNameBn,
        orgNameEn,
        proprietorName,
        phone,
        address,
        binNumber,
        tinNumber,
        tagline,
        website,
        businessDescription,
        vatMode,
        defaultLanguage,
        branchNameBn,
        branchNameEn,
        branchCode,
      } = body;

      if (typeof password !== 'string' || password.length < 6) {
        return jsonResponse(
          { error: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে (Password must be at least 6 characters).' },
          400
        );
      }

      const passwordHash = await hashPasswordAsync(password);
      const result = await onboardWorkspaceTransaction(db, {
        ownerName: String(ownerName || ''),
        ownerEmail: String(ownerEmail || ''),
        passwordHash,
        orgNameBn: String(orgNameBn || ''),
        orgNameEn: String(orgNameEn || ''),
        proprietorName: String(proprietorName || ''),
        phone: String(phone || ''),
        address: String(address || ''),
        binNumber: String(binNumber || ''),
        tinNumber: String(tinNumber || ''),
        tagline: String(tagline || ''),
        website: String(website || ''),
        businessDescription: String(businessDescription || ''),
        vatMode: vatMode === 'inclusive' ? 'inclusive' : 'exclusive',
        defaultLanguage: defaultLanguage === 'en' ? 'en' : 'bn',
        branchNameBn: String(branchNameBn || ''),
        branchNameEn: String(branchNameEn || ''),
        branchCode: String(branchCode || ''),
      });

      const token = await createSessionAsync(db, result.user.id);
      return jsonResponse(
        {
          token,
          user: result.user,
          permissions: getRolePermissions(result.user.role),
          locked: true,
        },
        201
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to complete onboarding.';
      const status = message.includes('already been completed') ? 403 : 400;
      return jsonResponse({ error: message }, status);
    }
  }

  if (method === 'POST' && pathname === '/api/auth/bootstrap-session') {
    const body = await readJsonBody(request).catch(() => ({}));
    const orgRow = await db.get<{ onboarding_completed?: number }>(
      'SELECT onboarding_completed FROM organizations WHERE id = 1'
    );
    const activeUsersCount = Number(
      (await db.get<{ c: number }>('SELECT COUNT(*) as c FROM users WHERE is_active = 1'))?.c || 0
    );
    if (!orgRow?.onboarding_completed || activeUsersCount === 0) {
      return jsonResponse({ error: 'Workspace requires first-run onboarding.' }, 403);
    }
    if (await isWorkspacePasswordLockedAsync(db, opts.envAdminPasscode)) {
      return jsonResponse({ error: 'Workspace is password-protected. Please sign in.' }, 403);
    }
    const requestedUserId = Number((body as { userId?: unknown }).userId) || 1;
    const user = await db.get<{ id: number; name: string; email: string; role: UserRole; branchId: number | null }>(
      'SELECT id, name, email, role, branch_id as branchId FROM users WHERE id = ? AND is_active = 1',
      [requestedUserId]
    );
    const target =
      user ||
      (await db.get<{ id: number; name: string; email: string; role: UserRole; branchId: number | null }>(
        'SELECT id, name, email, role, branch_id as branchId FROM users WHERE is_active = 1 ORDER BY id ASC LIMIT 1'
      ));
    if (!target) {
      return jsonResponse({ error: 'Workspace requires first-run onboarding.' }, 403);
    }
    const token = await createSessionAsync(db, Number(target.id));
    return jsonResponse({
      token,
      user: {
        id: Number(target.id),
        name: target.name,
        email: target.email,
        role: target.role,
        branchId: target.branchId !== null ? Number(target.branchId) : null,
      },
      permissions: getRolePermissions(target.role),
      locked: false,
    });
  }

  if (method === 'POST' && pathname === '/api/auth/login') {
    const body = await readJsonBody(request).catch(() => ({}));
    const { email, password } = body as { email?: unknown; password?: unknown };
    if (typeof password !== 'string' || password.length < 4) {
      return jsonResponse({ error: 'Password is required.' }, 400);
    }

    const user = email
      ? await db.get<{
          id: number;
          name: string;
          email: string;
          role: UserRole;
          branch_id: number | null;
          password_hash: string | null;
        }>('SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND is_active = 1', [String(email).trim()])
      : await db.get<{
          id: number;
          name: string;
          email: string;
          role: UserRole;
          branch_id: number | null;
          password_hash: string | null;
        }>("SELECT * FROM users WHERE role = 'owner' AND is_active = 1 ORDER BY id ASC LIMIT 1");

    if (!user) {
      return jsonResponse({ error: 'Invalid credentials.' }, 401);
    }

    const valid = user.password_hash
      ? await verifyPasswordAsync(password, user.password_hash, opts.legacyScryptVerifier)
      : await verifyWorkspaceAdminPasscodeAsync(
          db,
          password,
          opts.envAdminPasscode,
          opts.legacyScryptVerifier
        );

    if (!valid) {
      return jsonResponse({ error: 'Invalid email or password.' }, 401);
    }

    const token = await createSessionAsync(db, Number(user.id));
    await writeAuditLog(
      db,
      { name: user.name, role: user.role },
      'USER_LOGIN',
      'user',
      Number(user.id),
      `Signed in as ${user.role}`
    );
    return jsonResponse({
      token,
      user: {
        id: Number(user.id),
        name: user.name,
        email: user.email,
        role: user.role,
        branchId: user.branch_id !== null ? Number(user.branch_id) : null,
      },
      permissions: getRolePermissions(user.role),
      locked: await isWorkspacePasswordLockedAsync(db, opts.envAdminPasscode),
    });
  }

  if (method === 'POST' && pathname === '/api/auth/logout') {
    const auth = await requireAuth();
    if (auth instanceof Response) return auth;
    await db.run('DELETE FROM sessions WHERE token = ?', [auth.sessionToken]);
    return jsonResponse({ ok: true });
  }

  if (method === 'POST' && pathname === '/api/auth/set-lock') {
    const auth = await requireAuth('users:manage');
    if (auth instanceof Response) return auth;
    const body = await readJsonBody(request);
    const { password } = body;
    if (typeof password !== 'string' || password.length < 6) {
      return jsonResponse({ error: 'Admin password must be at least 6 characters.' }, 400);
    }
    const hash = await hashPasswordAsync(password);
    await db.run('UPDATE organizations SET admin_password_hash = ? WHERE id = 1', [hash]);
    await writeAuditLog(
      db,
      { name: auth.user.name, role: auth.user.role },
      'ADMIN_LOCK_ENABLED',
      'organization',
      1,
      'Enabled PBKDF2-hashed workspace admin password lock'
    );
    return jsonResponse({ ok: true, locked: true });
  }

  if (method === 'POST' && pathname === '/api/auth/switch-role') {
    const auth = await requireAuth();
    if (auth instanceof Response) return auth;
    if (await isWorkspacePasswordLockedAsync(db, opts.envAdminPasscode)) {
      return jsonResponse({ error: 'Role quick-switch is disabled while password lock is active.' }, 403);
    }
    const body = await readJsonBody(request);
    const targetUserId = Number(body.userId);
    const target = await db.get<{ id: number; name: string; email: string; role: UserRole; branchId: number | null }>(
      'SELECT id, name, email, role, branch_id as branchId FROM users WHERE id = ? AND is_active = 1',
      [targetUserId]
    );
    if (!target) {
      return jsonResponse({ error: 'User not found.' }, 404);
    }
    const token = await createSessionAsync(db, Number(target.id));
    return jsonResponse({
      token,
      user: {
        id: Number(target.id),
        name: target.name,
        email: target.email,
        role: target.role,
        branchId: target.branchId !== null ? Number(target.branchId) : null,
      },
      permissions: getRolePermissions(target.role),
      locked: false,
    });
  }

  // ---------------- Workspace Snapshot ----------------

  if (method === 'GET' && pathname === '/api/workspace') {
    const auth = await requireAuth('read');
    if (auth instanceof Response) return auth;
    try {
      const bParam = url.searchParams.get('branchId');
      const branchNum = bParam ? Number(bParam) : undefined;
      const branchId = branchNum && Number.isFinite(branchNum) && branchNum > 0 ? branchNum : undefined;
      const data = await listAllWorkspaceData(db, branchId, envPassSet);
      return jsonResponse(data);
    } catch (err) {
      console.error('Failed to load workspace:', err);
      return jsonResponse({ error: 'Failed to load workspace data.' }, 500);
    }
  }

  // ---------------- Customers & Statements ----------------

  if (method === 'POST' && pathname === '/api/customers') {
    const auth = await requireAuth('invoice:write');
    if (auth instanceof Response) return auth;
    try {
      const body = await readJsonBody(request);
      const { name, companyName, phone, email, binNumber, address, openingBalance, creditLimit } = body;
      if (!name || !String(name).trim()) {
        return jsonResponse({ error: 'Customer name is required.' }, 400);
      }
      const nextId =
        Number((await db.get<{ m: number }>('SELECT COALESCE(MAX(id),0) as m FROM customers'))?.m || 0) + 1;
      const code = `CUST-${String(nextId).padStart(3, '0')}`;
      const info = await db.run(
        `INSERT INTO customers (code, name, company_name, phone, email, bin_number, address, opening_balance, credit_limit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          code,
          String(name).trim(),
          String(companyName || '').trim(),
          String(phone || '').trim(),
          String(email || '').trim(),
          String(binNumber || '').trim(),
          String(address || '').trim(),
          Number(openingBalance) || 0,
          Number(creditLimit) || 0,
        ]
      );
      await writeAuditLog(
        db,
        { name: auth.user.name, role: auth.user.role },
        'CUSTOMER_CREATED',
        'customer',
        Number(info.lastInsertRowid),
        `Created customer ${String(name).trim()} (${code})`
      );
      return jsonResponse({ id: Number(info.lastInsertRowid), code }, 201);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to create customer.' }, 400);
    }
  }

  const custStatementMatch = pathname.match(/^\/api\/customers\/([^/]+)\/statement$/);
  if (method === 'GET' && custStatementMatch) {
    const auth = await requireAuth('read');
    if (auth instanceof Response) return auth;
    try {
      const id = parsePositiveId(custStatementMatch[1]);
      if (!id) return jsonResponse({ error: 'Invalid customer ID.' }, 400);
      const statement = await getCustomerStatementData(db, id);
      return jsonResponse(statement);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Customer not found.' }, 404);
    }
  }

  const custIdMatch = pathname.match(/^\/api\/customers\/([^/]+)$/);
  if (custIdMatch && method === 'PUT') {
    const auth = await requireAuth('invoice:write');
    if (auth instanceof Response) return auth;
    try {
      const id = parsePositiveId(custIdMatch[1]);
      if (!id) return jsonResponse({ error: 'Invalid customer ID.' }, 400);
      const body = await readJsonBody(request);
      const result = await updateCustomerRecord(db, id, body, {
        name: auth.user.name,
        role: auth.user.role,
      });
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to update customer.' }, 400);
    }
  }

  if (custIdMatch && method === 'DELETE') {
    const auth = await requireAuth('invoice:write');
    if (auth instanceof Response) return auth;
    try {
      const id = parsePositiveId(custIdMatch[1]);
      if (!id) return jsonResponse({ error: 'Invalid customer ID.' }, 400);
      const result = await deleteCustomerRecord(db, id, {
        name: auth.user.name,
        role: auth.user.role,
      });
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to delete customer.' }, 400);
    }
  }

  // ---------------- Vendors ----------------

  if (method === 'POST' && pathname === '/api/vendors') {
    const auth = await requireAuth('purchase:write');
    if (auth instanceof Response) return auth;
    try {
      const body = await readJsonBody(request);
      const { name, companyName, phone, email, binNumber, address } = body;
      if (!name || !String(name).trim()) return jsonResponse({ error: 'Vendor name is required.' }, 400);
      const nextId =
        Number((await db.get<{ m: number }>('SELECT COALESCE(MAX(id),0) as m FROM vendors'))?.m || 0) + 1;
      const code = `VEND-${String(nextId).padStart(3, '0')}`;
      const info = await db.run(
        `INSERT INTO vendors (code, name, company_name, phone, email, bin_number, address)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          code,
          String(name).trim(),
          String(companyName || '').trim(),
          String(phone || '').trim(),
          String(email || '').trim(),
          String(binNumber || '').trim(),
          String(address || '').trim(),
        ]
      );
      await writeAuditLog(
        db,
        { name: auth.user.name, role: auth.user.role },
        'VENDOR_CREATED',
        'vendor',
        Number(info.lastInsertRowid),
        `Created vendor ${String(name).trim()}`
      );
      return jsonResponse({ id: Number(info.lastInsertRowid), code }, 201);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to create vendor.' }, 400);
    }
  }

  const vendIdMatch = pathname.match(/^\/api\/vendors\/([^/]+)$/);
  if (vendIdMatch && method === 'PUT') {
    const auth = await requireAuth('purchase:write');
    if (auth instanceof Response) return auth;
    try {
      const id = parsePositiveId(vendIdMatch[1]);
      if (!id) return jsonResponse({ error: 'Invalid vendor ID.' }, 400);
      const body = await readJsonBody(request);
      const result = await updateVendorRecord(db, id, body, {
        name: auth.user.name,
        role: auth.user.role,
      });
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to update vendor.' }, 400);
    }
  }

  if (vendIdMatch && method === 'DELETE') {
    const auth = await requireAuth('purchase:write');
    if (auth instanceof Response) return auth;
    try {
      const id = parsePositiveId(vendIdMatch[1]);
      if (!id) return jsonResponse({ error: 'Invalid vendor ID.' }, 400);
      const result = await deleteVendorRecord(db, id, {
        name: auth.user.name,
        role: auth.user.role,
      });
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to delete vendor.' }, 400);
    }
  }

  // ---------------- Products & Inventory ----------------

  if (method === 'POST' && pathname === '/api/products') {
    const auth = await requireAuth('inventory:write');
    if (auth instanceof Response) return auth;
    try {
      const body = await readJsonBody(request);
      const {
        sku,
        barcode,
        brand,
        name,
        nameBn,
        unit,
        category,
        hsCode,
        description,
        imageUrl,
        isActive,
        trackInventory,
        salePrice,
        costPrice,
        taxRuleId,
        reorderLevel,
        initialStock,
        branchId,
      } = body;
      if (!name || !String(name).trim()) return jsonResponse({ error: 'Product name is required.' }, 400);
      const maxId = Number(
        (await db.get<{ m: number }>('SELECT COALESCE(MAX(id),0) as m FROM products'))?.m || 0
      );
      const finalSku = String(sku || '').trim() || `PRD-${String(maxId + 101)}`;
      const finalBarcode = String(barcode || '').trim() || finalSku;
      const safeImageUrl = sanitizeProductImageUrl(imageUrl);

      const info = await db.run(
        `INSERT INTO products (sku, barcode, brand, name, name_bn, unit, category, hs_code, description, image_url, is_active, track_inventory, sale_price, cost_price, tax_rule_id, reorder_level)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          finalSku,
          finalBarcode,
          String(brand || '').trim(),
          String(name).trim(),
          String(nameBn || name).trim(),
          String(unit || 'pcs').trim(),
          String(category || 'General').trim(),
          String(hsCode || '').trim(),
          String(description || '').trim(),
          safeImageUrl,
          isActive === false ? 0 : 1,
          trackInventory === false ? 0 : 1,
          Math.max(0, Number(salePrice) || 0),
          Math.max(0, Number(costPrice) || 0),
          taxRuleId ? Number(taxRuleId) : 1,
          Math.max(0, Number(reorderLevel) || 5),
        ]
      );

      const productId = Number(info.lastInsertRowid);
      const qty = Math.max(0, Number(initialStock) || 0);
      if (qty > 0 && trackInventory !== false) {
        const bId = Number(branchId) || 1;
        const unitCost = Math.max(0, Number(costPrice) || 0);
        await db.run(
          `INSERT INTO branch_stock (branch_id, product_id, quantity, avg_cost, fifo_lots_json)
           VALUES (?, ?, ?, ?, ?)`,
          [bId, productId, qty, unitCost, JSON.stringify([{ qty, unitCost }])]
        );

        await db.run(
          `INSERT INTO stock_movements (branch_id, product_id, movement_type, quantity, unit_cost, total_cost, source_type, source_id, movement_date, notes)
           VALUES (?, ?, 'in', ?, ?, ?, 'opening', ?, ?, ?)`,
          [
            bId,
            productId,
            qty,
            unitCost,
            Math.round(qty * unitCost * 100) / 100,
            productId,
            new Date().toISOString().slice(0, 10),
            'Opening stock balance',
          ]
        );
      }

      await writeAuditLog(
        db,
        { name: auth.user.name, role: auth.user.role },
        'PRODUCT_CREATED',
        'product',
        productId,
        `Added product ${String(name).trim()} (${finalSku})`
      );
      return jsonResponse({ id: productId, sku: finalSku }, 201);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to create product.' }, 400);
    }
  }

  if (method === 'POST' && pathname === '/api/products/transfer-stock') {
    const auth = await requireAuth('inventory:write');
    if (auth instanceof Response) return auth;
    try {
      const body = await readJsonBody(request);
      const result = await transferProductStockTransaction(
        db,
        {
          productId: Number(body.productId),
          fromBranchId: Number(body.fromBranchId),
          toBranchId: Number(body.toBranchId),
          quantity: Number(body.quantity),
          notes: body.notes ? String(body.notes) : '',
          date: body.date ? String(body.date) : undefined,
        },
        { name: auth.user.name, role: auth.user.role }
      );
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to transfer stock.' }, 400);
    }
  }

  const prodMovementsMatch = pathname.match(/^\/api\/products\/([^/]+)\/movements$/);
  if (method === 'GET' && prodMovementsMatch) {
    const auth = await requireAuth();
    if (auth instanceof Response) return auth;
    try {
      const productId = parsePositiveId(prodMovementsMatch[1]);
      if (!productId) return jsonResponse({ error: 'Invalid product ID.' }, 400);
      const movements = await listProductStockMovements(db, productId);
      return jsonResponse({ movements });
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to load stock movements.' }, 400);
    }
  }

  const prodAdjustMatch = pathname.match(/^\/api\/products\/([^/]+)\/adjust-stock$/);
  if (method === 'POST' && prodAdjustMatch) {
    const auth = await requireAuth('inventory:write');
    if (auth instanceof Response) return auth;
    try {
      const productId = parsePositiveId(prodAdjustMatch[1]);
      if (!productId) return jsonResponse({ error: 'Invalid product ID.' }, 400);
      const body = await readJsonBody(request);
      const mode = body.mode;
      if (mode !== 'add' && mode !== 'reduce' && mode !== 'set') {
        return jsonResponse({ error: 'Invalid adjustment mode.' }, 400);
      }
      const result = await adjustProductStockTransaction(
        db,
        {
          productId,
          branchId: Number(body.branchId) || 1,
          mode,
          quantity: Number(body.quantity),
          unitCost:
            body.unitCost !== undefined && body.unitCost !== '' ? Number(body.unitCost) : undefined,
          reason: String(body.reason || 'Manual stock adjustment'),
          date: body.date ? String(body.date) : undefined,
        },
        { name: auth.user.name, role: auth.user.role }
      );
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to adjust stock.' }, 400);
    }
  }

  const prodIdMatch = pathname.match(/^\/api\/products\/([^/]+)$/);
  if (prodIdMatch && method === 'PUT') {
    const auth = await requireAuth('inventory:write');
    if (auth instanceof Response) return auth;
    try {
      const productId = parsePositiveId(prodIdMatch[1]);
      if (!productId) return jsonResponse({ error: 'Invalid product ID.' }, 400);
      const body = await readJsonBody(request);
      const result = await updateProductRecord(
        db,
        productId,
        body as unknown as Parameters<typeof updateProductRecord>[2],
        {
          name: auth.user.name,
          role: auth.user.role,
        }
      );
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to update product.' }, 400);
    }
  }

  if (prodIdMatch && method === 'DELETE') {
    const auth = await requireAuth('inventory:write');
    if (auth instanceof Response) return auth;
    try {
      const productId = parsePositiveId(prodIdMatch[1]);
      if (!productId) return jsonResponse({ error: 'Invalid product ID.' }, 400);
      const result = await deleteProductRecord(db, productId, {
        name: auth.user.name,
        role: auth.user.role,
      });
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to delete product.' }, 400);
    }
  }

  // ---------------- Invoices & POS ----------------

  if (method === 'POST' && pathname === '/api/invoices') {
    const auth = await requireAuth('invoice:write');
    if (auth instanceof Response) return auth;
    try {
      const body = await readJsonBody(request);
      const idempotencyKey = request.headers.get('idempotency-key')
        ? String(request.headers.get('idempotency-key'))
        : typeof body.idempotencyKey === 'string'
          ? body.idempotencyKey
          : undefined;

      const invoice = await createInvoiceTransaction(
        db,
        {
          branchId: Number(body.branchId) || 1,
          customerId: Number(body.customerId),
          issueDate: String(body.issueDate),
          dueDate: String(body.dueDate),
          notes: body.notes ? String(body.notes) : '',
          source: body.source === 'pos' ? 'pos' : 'invoice',
          items: body.items as Parameters<typeof createInvoiceTransaction>[1]['items'],
          idempotencyKey,
          immediatePayment: body.immediatePayment as Parameters<typeof createInvoiceTransaction>[1]['immediatePayment'],
        },
        { name: auth.user.name, role: auth.user.role }
      );
      return jsonResponse(invoice, 201);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to create invoice.' }, 400);
    }
  }

  const invIdMatch = pathname.match(/^\/api\/invoices\/([^/]+)$/);
  if (invIdMatch && method === 'GET') {
    const auth = await requireAuth('read');
    if (auth instanceof Response) return auth;
    const id = parsePositiveId(invIdMatch[1]);
    if (!id) return jsonResponse({ error: 'Invalid invoice ID.' }, 400);
    const inv = await getInvoiceById(db, id);
    if (!inv) return jsonResponse({ error: 'Invoice not found.' }, 404);
    return jsonResponse(inv);
  }

  if (invIdMatch && method === 'PUT') {
    const auth = await requireAuth('invoice:write');
    if (auth instanceof Response) return auth;
    try {
      const id = parsePositiveId(invIdMatch[1]);
      if (!id) return jsonResponse({ error: 'Invalid invoice ID.' }, 400);
      const body = await readJsonBody(request);
      const updated = await updateInvoiceTransaction(
        db,
        id,
        {
          branchId: Number(body.branchId) || 1,
          customerId: Number(body.customerId),
          issueDate: String(body.issueDate),
          dueDate: String(body.dueDate),
          notes: body.notes ? String(body.notes) : '',
          items: body.items as Parameters<typeof updateInvoiceTransaction>[2]['items'],
        },
        { name: auth.user.name, role: auth.user.role }
      );
      return jsonResponse(updated);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to update invoice.' }, 400);
    }
  }

  if (invIdMatch && method === 'DELETE') {
    const auth = await requireAuth('invoice:write');
    if (auth instanceof Response) return auth;
    try {
      const id = parsePositiveId(invIdMatch[1]);
      if (!id) return jsonResponse({ error: 'Invalid invoice ID.' }, 400);
      const result = await deleteInvoiceTransaction(db, id, {
        name: auth.user.name,
        role: auth.user.role,
      });
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to delete invoice.' }, 400);
    }
  }

  // ---------------- Payments ----------------

  if (method === 'POST' && pathname === '/api/payments') {
    const auth = await requireAuth('payment:write');
    if (auth instanceof Response) return auth;
    try {
      const body = await readJsonBody(request);
      const idempotencyKey = request.headers.get('idempotency-key')
        ? String(request.headers.get('idempotency-key'))
        : typeof body.idempotencyKey === 'string'
          ? body.idempotencyKey
          : undefined;

      const payment = await recordPaymentTransaction(
        db,
        {
          customerId: Number(body.customerId),
          branchId: Number(body.branchId) || 1,
          paymentDate: String(body.paymentDate),
          amount: Number(body.amount),
          method: body.method as Parameters<typeof recordPaymentTransaction>[1]['method'],
          gatewayProvider: body.gatewayProvider ? String(body.gatewayProvider) : null,
          gatewayReference: body.gatewayReference ? String(body.gatewayReference) : null,
          invoiceId: body.invoiceId ? Number(body.invoiceId) : null,
          notes: body.notes ? String(body.notes) : '',
          idempotencyKey,
        },
        { name: auth.user.name, role: auth.user.role }
      );
      return jsonResponse(payment, 201);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to record payment.' }, 400);
    }
  }

  const payIdMatch = pathname.match(/^\/api\/payments\/([^/]+)$/);
  if (payIdMatch && method === 'PUT') {
    const auth = await requireAuth('payment:write');
    if (auth instanceof Response) return auth;
    try {
      const id = parsePositiveId(payIdMatch[1]);
      if (!id) return jsonResponse({ error: 'Invalid payment ID.' }, 400);
      const body = await readJsonBody(request);
      const result = await updatePaymentTransaction(
        db,
        id,
        {
          branchId: body.branchId ? Number(body.branchId) : undefined,
          paymentDate: String(body.paymentDate),
          amount: Number(body.amount),
          method: body.method as Parameters<typeof updatePaymentTransaction>[2]['method'],
          gatewayProvider: body.gatewayProvider !== undefined ? (body.gatewayProvider as string | null) : null,
          gatewayReference: body.gatewayReference !== undefined ? (body.gatewayReference as string | null) : null,
          notes: body.notes !== undefined ? String(body.notes) : '',
        },
        { name: auth.user.name, role: auth.user.role }
      );
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to update payment.' }, 400);
    }
  }

  if (payIdMatch && method === 'DELETE') {
    const auth = await requireAuth('payment:write');
    if (auth instanceof Response) return auth;
    try {
      const id = parsePositiveId(payIdMatch[1]);
      if (!id) return jsonResponse({ error: 'Invalid payment ID.' }, 400);
      const result = await deletePaymentTransaction(db, id, {
        name: auth.user.name,
        role: auth.user.role,
      });
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to delete payment.' }, 400);
    }
  }

  // ---------------- Purchases ----------------

  if (method === 'POST' && pathname === '/api/purchases') {
    const auth = await requireAuth('purchase:write');
    if (auth instanceof Response) return auth;
    try {
      const body = await readJsonBody(request);
      const purchase = await createPurchaseTransaction(
        db,
        {
          branchId: Number(body.branchId) || 1,
          vendorId: Number(body.vendorId),
          purchaseDate: String(body.purchaseDate),
          mushak61Ref: body.mushak61Ref ? String(body.mushak61Ref) : undefined,
          notes: body.notes ? String(body.notes) : undefined,
          payImmediately: Boolean(body.payImmediately),
          paymentMethod: (body.paymentMethod || 'bank') as Parameters<typeof createPurchaseTransaction>[1]['paymentMethod'],
          items: body.items as Parameters<typeof createPurchaseTransaction>[1]['items'],
        },
        { name: auth.user.name, role: auth.user.role }
      );
      return jsonResponse(purchase, 201);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to record purchase.' }, 400);
    }
  }

  const purIdMatch = pathname.match(/^\/api\/purchases\/([^/]+)$/);
  if (purIdMatch && method === 'PUT') {
    const auth = await requireAuth('purchase:write');
    if (auth instanceof Response) return auth;
    try {
      const id = parsePositiveId(purIdMatch[1]);
      if (!id) return jsonResponse({ error: 'Invalid purchase ID.' }, 400);
      const body = await readJsonBody(request);
      const result = await updatePurchaseTransaction(
        db,
        id,
        {
          branchId: Number(body.branchId) || 1,
          vendorId: Number(body.vendorId),
          purchaseDate: String(body.purchaseDate),
          mushak61Ref: body.mushak61Ref ? String(body.mushak61Ref) : undefined,
          notes: body.notes ? String(body.notes) : undefined,
          payImmediately: Boolean(body.payImmediately),
          paymentMethod: (body.paymentMethod || 'bank') as Parameters<typeof updatePurchaseTransaction>[2]['paymentMethod'],
          items: body.items as Parameters<typeof updatePurchaseTransaction>[2]['items'],
        },
        { name: auth.user.name, role: auth.user.role }
      );
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to update purchase.' }, 400);
    }
  }

  if (purIdMatch && method === 'DELETE') {
    const auth = await requireAuth('purchase:write');
    if (auth instanceof Response) return auth;
    try {
      const id = parsePositiveId(purIdMatch[1]);
      if (!id) return jsonResponse({ error: 'Invalid purchase ID.' }, 400);
      const result = await deletePurchaseTransaction(db, id, {
        name: auth.user.name,
        role: auth.user.role,
      });
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to delete purchase.' }, 400);
    }
  }

  // ---------------- Expenses ----------------

  if (method === 'POST' && pathname === '/api/expenses') {
    const auth = await requireAuth('expense:write');
    if (auth instanceof Response) return auth;
    try {
      const body = await readJsonBody(request);
      const expense = await createExpenseTransaction(
        db,
        {
          branchId: Number(body.branchId) || 1,
          expenseDate: String(body.expenseDate),
          category: String(body.category),
          accountCode: String(body.accountCode || '5500'),
          vendorName: String(body.vendorName || ''),
          amount: Number(body.amount),
          vatAmount: Number(body.vatAmount || 0),
          paymentMethod: (body.paymentMethod || 'cash') as Parameters<typeof createExpenseTransaction>[1]['paymentMethod'],
          reference: String(body.reference || ''),
          notes: String(body.notes || ''),
        },
        { name: auth.user.name, role: auth.user.role }
      );
      return jsonResponse(expense, 201);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to record expense.' }, 400);
    }
  }

  const expIdMatch = pathname.match(/^\/api\/expenses\/([^/]+)$/);
  if (expIdMatch && method === 'PUT') {
    const auth = await requireAuth('expense:write');
    if (auth instanceof Response) return auth;
    try {
      const id = parsePositiveId(expIdMatch[1]);
      if (!id) return jsonResponse({ error: 'Invalid expense ID.' }, 400);
      const body = await readJsonBody(request);
      const result = await updateExpenseTransaction(
        db,
        id,
        {
          branchId: Number(body.branchId) || 1,
          expenseDate: String(body.expenseDate),
          category: String(body.category),
          accountCode: String(body.accountCode || '5500'),
          vendorName: String(body.vendorName || ''),
          amount: Number(body.amount),
          vatAmount: Number(body.vatAmount || 0),
          paymentMethod: (body.paymentMethod || 'cash') as Parameters<typeof updateExpenseTransaction>[2]['paymentMethod'],
          reference: String(body.reference || ''),
          notes: String(body.notes || ''),
        },
        { name: auth.user.name, role: auth.user.role }
      );
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to update expense.' }, 400);
    }
  }

  if (expIdMatch && method === 'DELETE') {
    const auth = await requireAuth('expense:write');
    if (auth instanceof Response) return auth;
    try {
      const id = parsePositiveId(expIdMatch[1]);
      if (!id) return jsonResponse({ error: 'Invalid expense ID.' }, 400);
      const result = await deleteExpenseTransaction(db, id, {
        name: auth.user.name,
        role: auth.user.role,
      });
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to delete expense.' }, 400);
    }
  }

  // ---------------- Recurring Billing ----------------

  if (method === 'POST' && pathname === '/api/recurring') {
    const auth = await requireAuth('recurring:write');
    if (auth instanceof Response) return auth;
    try {
      const body = await readJsonBody(request);
      const { title, customerId, branchId, frequency, nextRunDate, items } = body;
      if (!title || !customerId || !Array.isArray(items) || items.length === 0) {
        return jsonResponse({ error: 'Title, customer, and line items are required.' }, 400);
      }
      const computed = computeInvoiceTotals(items, 'exclusive');
      const start = String(
        nextRunDate || computeNextRecurringDate(new Date().toISOString().slice(0, 10), 'monthly')
      );
      const info = await db.run(
        `INSERT INTO recurring_profiles (title, customer_id, branch_id, frequency, next_run_date, status, auto_send, items_json, estimated_total)
         VALUES (?, ?, ?, ?, ?, 'active', 1, ?, ?)`,
        [
          String(title).trim(),
          Number(customerId),
          Number(branchId) || 1,
          String(frequency || 'monthly'),
          start,
          JSON.stringify(items),
          computed.grandTotal,
        ]
      );
      await writeAuditLog(
        db,
        { name: auth.user.name, role: auth.user.role },
        'RECURRING_CREATED',
        'recurring_profile',
        Number(info.lastInsertRowid),
        `Created recurring schedule "${String(title).trim()}" (${String(frequency || 'monthly')})`
      );
      return jsonResponse({ id: Number(info.lastInsertRowid) }, 201);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to create recurring profile.' }, 400);
    }
  }

  const recRunMatch = pathname.match(/^\/api\/recurring\/([^/]+)\/run$/);
  if (method === 'POST' && recRunMatch) {
    const auth = await requireAuth('recurring:write');
    if (auth instanceof Response) return auth;
    try {
      const id = parsePositiveId(recRunMatch[1]);
      if (!id) return jsonResponse({ error: 'Invalid schedule ID.' }, 400);
      const inv = await runRecurringProfileNow(db, id, {
        name: auth.user.name,
        role: auth.user.role,
      });
      return jsonResponse(inv, 201);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to generate recurring invoice.' }, 400);
    }
  }

  const recToggleMatch = pathname.match(/^\/api\/recurring\/([^/]+)\/toggle$/);
  if (method === 'PATCH' && recToggleMatch) {
    const auth = await requireAuth('recurring:write');
    if (auth instanceof Response) return auth;
    const id = parsePositiveId(recToggleMatch[1]);
    if (!id) return jsonResponse({ error: 'Invalid schedule ID.' }, 400);
    const row = await db.get<{ status: string }>('SELECT status FROM recurring_profiles WHERE id = ?', [id]);
    if (!row) return jsonResponse({ error: 'Profile not found.' }, 404);
    const nextStatus = row.status === 'active' ? 'paused' : 'active';
    await db.run('UPDATE recurring_profiles SET status = ? WHERE id = ?', [nextStatus, id]);
    return jsonResponse({ id, status: nextStatus });
  }

  const recIdMatch = pathname.match(/^\/api\/recurring\/([^/]+)$/);
  if (recIdMatch && method === 'PUT') {
    const auth = await requireAuth('recurring:write');
    if (auth instanceof Response) return auth;
    try {
      const id = parsePositiveId(recIdMatch[1]);
      if (!id) return jsonResponse({ error: 'Invalid schedule ID.' }, 400);
      const body = await readJsonBody(request);
      const { title, customerId, branchId, frequency, nextRunDate, items } = body;
      const result = await updateRecurringProfile(
        db,
        id,
        {
          title: String(title || ''),
          customerId: Number(customerId),
          branchId: branchId ? Number(branchId) : undefined,
          frequency: (frequency || 'monthly') as Parameters<typeof updateRecurringProfile>[2]['frequency'],
          nextRunDate: String(nextRunDate || new Date().toISOString().slice(0, 10)),
          items: items as Parameters<typeof updateRecurringProfile>[2]['items'],
        },
        { name: auth.user.name, role: auth.user.role }
      );
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to update schedule.' }, 400);
    }
  }

  if (recIdMatch && method === 'DELETE') {
    const auth = await requireAuth('recurring:write');
    if (auth instanceof Response) return auth;
    try {
      const id = parsePositiveId(recIdMatch[1]);
      if (!id) return jsonResponse({ error: 'Invalid schedule ID.' }, 400);
      const result = await deleteRecurringProfile(db, id, {
        name: auth.user.name,
        role: auth.user.role,
      });
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to delete schedule.' }, 400);
    }
  }

  // ---------------- Immutable Ledger Reversal ----------------

  const journalRevMatch = pathname.match(/^\/api\/journals\/([^/]+)\/reverse$/);
  if (method === 'POST' && journalRevMatch) {
    const auth = await requireAuth('journal:reverse');
    if (auth instanceof Response) return auth;
    try {
      const id = parsePositiveId(journalRevMatch[1]);
      if (!id) return jsonResponse({ error: 'Invalid journal ID.' }, 400);
      const body = await readJsonBody(request);
      const result = await reverseJournalEntry(
        db,
        id,
        String(body.reason || 'Accounting adjustment'),
        { name: auth.user.name, role: auth.user.role }
      );
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to reverse journal entry.' }, 400);
    }
  }

  // ---------------- Tax Rules, Branches, Users & Settings ----------------

  if (method === 'POST' && pathname === '/api/tax-rules') {
    const auth = await requireAuth('vat:manage');
    if (auth instanceof Response) return auth;
    try {
      const body = await readJsonBody(request);
      const { code, name, nameBn, rate, sdRate, mushakCategory, effectiveFrom } = body;
      if (!code || !name) return jsonResponse({ error: 'Code and name are required.' }, 400);
      const info = await db.run(
        `INSERT INTO tax_rules (code, name, name_bn, rate, sd_rate, mushak_category, effective_from, is_default, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1)`,
        [
          String(code).trim().toUpperCase(),
          String(name).trim(),
          String(nameBn || name).trim(),
          Math.max(0, Number(rate) || 0),
          Math.max(0, Number(sdRate) || 0),
          String(mushakCategory || 'standard'),
          String(effectiveFrom || new Date().toISOString().slice(0, 10)),
        ]
      );
      await writeAuditLog(
        db,
        { name: auth.user.name, role: auth.user.role },
        'TAX_RULE_CREATED',
        'tax_rule',
        Number(info.lastInsertRowid),
        `Added versioned VAT rule ${String(code)} (${Number(rate)}%) effective ${String(effectiveFrom || '')}`
      );
      return jsonResponse({ id: Number(info.lastInsertRowid) }, 201);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to create tax rule.' }, 400);
    }
  }

  const taxIdMatch = pathname.match(/^\/api\/tax-rules\/([^/]+)$/);
  if (taxIdMatch && method === 'PUT') {
    const auth = await requireAuth('vat:manage');
    if (auth instanceof Response) return auth;
    try {
      const id = parsePositiveId(taxIdMatch[1]);
      if (!id) return jsonResponse({ error: 'Invalid tax rule ID.' }, 400);
      const body = await readJsonBody(request);
      const result = await updateTaxRule(
        db,
        id,
        body as unknown as Parameters<typeof updateTaxRule>[2],
        { name: auth.user.name, role: auth.user.role }
      );
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to update tax rule.' }, 400);
    }
  }

  if (taxIdMatch && method === 'DELETE') {
    const auth = await requireAuth('vat:manage');
    if (auth instanceof Response) return auth;
    try {
      const id = parsePositiveId(taxIdMatch[1]);
      if (!id) return jsonResponse({ error: 'Invalid tax rule ID.' }, 400);
      const result = await deleteTaxRule(db, id, {
        name: auth.user.name,
        role: auth.user.role,
      });
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to delete tax rule.' }, 400);
    }
  }

  if (method === 'POST' && pathname === '/api/branches') {
    const auth = await requireAuth('settings:manage');
    if (auth instanceof Response) return auth;
    try {
      const body = await readJsonBody(request);
      const { code, name, nameBn, address, phone } = body;
      if (!code || !name) return jsonResponse({ error: 'Branch code and name are required.' }, 400);
      const info = await db.run(
        'INSERT INTO branches (code, name, name_bn, address, phone, is_main) VALUES (?, ?, ?, ?, ?, 0)',
        [
          String(code).trim().toUpperCase().slice(0, 6),
          String(name).trim(),
          String(nameBn || name).trim(),
          String(address || '').trim(),
          String(phone || '').trim(),
        ]
      );
      await writeAuditLog(
        db,
        { name: auth.user.name, role: auth.user.role },
        'BRANCH_CREATED',
        'branch',
        Number(info.lastInsertRowid),
        `Added branch ${String(name).trim()} (${String(code).toUpperCase()})`
      );
      return jsonResponse({ id: Number(info.lastInsertRowid) }, 201);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to create branch.' }, 400);
    }
  }

  const branchIdMatch = pathname.match(/^\/api\/branches\/([^/]+)$/);
  if (branchIdMatch && method === 'PUT') {
    const auth = await requireAuth('settings:manage');
    if (auth instanceof Response) return auth;
    try {
      const id = parsePositiveId(branchIdMatch[1]);
      if (!id) return jsonResponse({ error: 'Invalid branch ID.' }, 400);
      const body = await readJsonBody(request);
      const result = await updateBranchRecord(
        db,
        id,
        body as unknown as Parameters<typeof updateBranchRecord>[2],
        { name: auth.user.name, role: auth.user.role }
      );
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to update branch.' }, 400);
    }
  }

  if (branchIdMatch && method === 'DELETE') {
    const auth = await requireAuth('settings:manage');
    if (auth instanceof Response) return auth;
    try {
      const id = parsePositiveId(branchIdMatch[1]);
      if (!id) return jsonResponse({ error: 'Invalid branch ID.' }, 400);
      const result = await deleteBranchRecord(db, id, {
        name: auth.user.name,
        role: auth.user.role,
      });
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to delete branch.' }, 400);
    }
  }

  if (method === 'POST' && pathname === '/api/users') {
    const auth = await requireAuth('users:manage');
    if (auth instanceof Response) return auth;
    try {
      const body = await readJsonBody(request);
      const { name, email, role, branchId, password } = body;
      if (!name || !email || !role) {
        return jsonResponse({ error: 'Name, email, and role are required.' }, 400);
      }
      const passHash =
        password && String(password).length >= 6 ? await hashPasswordAsync(String(password)) : null;
      const info = await db.run(
        'INSERT INTO users (name, email, role, branch_id, password_hash) VALUES (?, ?, ?, ?, ?)',
        [
          String(name).trim(),
          String(email).trim().toLowerCase(),
          String(role),
          branchId ? Number(branchId) : null,
          passHash,
        ]
      );
      await writeAuditLog(
        db,
        { name: auth.user.name, role: auth.user.role },
        'USER_CREATED',
        'user',
        Number(info.lastInsertRowid),
        `Added team member ${String(name).trim()} with role ${String(role)}`
      );
      return jsonResponse({ id: Number(info.lastInsertRowid) }, 201);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to add user.' }, 400);
    }
  }

  const userIdMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
  if (userIdMatch && method === 'PUT') {
    const auth = await requireAuth('users:manage');
    if (auth instanceof Response) return auth;
    try {
      const id = parsePositiveId(userIdMatch[1]);
      if (!id) return jsonResponse({ error: 'Invalid user ID.' }, 400);
      const body = await readJsonBody(request);
      const { name, email, role, branchId, password } = body;
      let passwordHash: string | null = null;
      if (password && String(password).trim().length > 0) {
        if (String(password).length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }
        passwordHash = await hashPasswordAsync(String(password));
      }
      const result = await updateUserRecord(
        db,
        id,
        {
          name: String(name || ''),
          email: String(email || ''),
          role: String(role || ''),
          branchId: branchId ? Number(branchId) : null,
          passwordHash,
        },
        { name: auth.user.name, role: auth.user.role }
      );
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to update user.' }, 400);
    }
  }

  if (userIdMatch && method === 'DELETE') {
    const auth = await requireAuth('users:manage');
    if (auth instanceof Response) return auth;
    try {
      const id = parsePositiveId(userIdMatch[1]);
      if (!id) return jsonResponse({ error: 'Invalid user ID.' }, 400);
      const result = await deleteUserRecord(db, id, auth.user.id, {
        name: auth.user.name,
        role: auth.user.role,
      });
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to delete user.' }, 400);
    }
  }

  if (method === 'PATCH' && pathname === '/api/organization') {
    const auth = await requireAuth('settings:manage');
    if (auth instanceof Response) return auth;
    try {
      const body = await readJsonBody(request);
      const {
        name,
        nameBn,
        binNumber,
        tinNumber,
        phone,
        email,
        address,
        currency,
        currencySymbol,
        defaultLanguage,
        inventoryMethod,
        vatMode,
        invoicePrefix,
        mushakPrefix,
        proprietorName,
        tagline,
        website,
        businessDescription,
        logoUrl,
        cashMemoSettings,
      } = body;
      const clampOpt = (val: unknown, maxLen: number): string | null =>
        typeof val === 'string' ? val.trim().slice(0, maxLen) : null;
      const safeLogoUrl = logoUrl !== undefined ? sanitizeProductImageUrl(logoUrl) : null;
      const safeCashMemoJson =
        cashMemoSettings !== undefined
          ? JSON.stringify(sanitizeCashMemoSettings(cashMemoSettings))
          : null;
      await db.run(
        `UPDATE organizations SET
          name = COALESCE(?, name),
          name_bn = COALESCE(?, name_bn),
          bin_number = COALESCE(?, bin_number),
          tin_number = COALESCE(?, tin_number),
          phone = COALESCE(?, phone),
          email = COALESCE(?, email),
          address = COALESCE(?, address),
          currency = COALESCE(?, currency),
          currency_symbol = COALESCE(?, currency_symbol),
          default_language = COALESCE(?, default_language),
          inventory_method = COALESCE(?, inventory_method),
          vat_mode = COALESCE(?, vat_mode),
          invoice_prefix = COALESCE(?, invoice_prefix),
          mushak_prefix = COALESCE(?, mushak_prefix),
          proprietor_name = COALESCE(?, proprietor_name),
          tagline = COALESCE(?, tagline),
          website = COALESCE(?, website),
          business_description = COALESCE(?, business_description),
          logo_url = COALESCE(?, logo_url),
          cash_memo_settings_json = COALESCE(?, cash_memo_settings_json),
          updated_at = datetime('now')
         WHERE id = 1`,
        [
          clampOpt(name, 160),
          clampOpt(nameBn, 160),
          clampOpt(binNumber, 60),
          clampOpt(tinNumber, 60),
          clampOpt(phone, 80),
          clampOpt(email, 120),
          clampOpt(address, 260),
          clampOpt(currency, 16),
          clampOpt(currencySymbol, 8),
          typeof defaultLanguage === 'string' ? defaultLanguage : null,
          typeof inventoryMethod === 'string' ? inventoryMethod : null,
          typeof vatMode === 'string' ? vatMode : null,
          clampOpt(invoicePrefix, 24),
          clampOpt(mushakPrefix, 24),
          clampOpt(proprietorName, 120),
          clampOpt(tagline, 160),
          clampOpt(website, 120),
          clampOpt(businessDescription, 320),
          safeLogoUrl,
          safeCashMemoJson,
        ]
      );
      await writeAuditLog(
        db,
        { name: auth.user.name, role: auth.user.role },
        'SETTINGS_UPDATED',
        'organization',
        1,
        'Updated organization configuration & VAT/inventory settings'
      );
      return jsonResponse({ ok: true });
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to update settings.' }, 400);
    }
  }

  if (method === 'POST' && pathname === '/api/workspace/reset') {
    const auth = await requireAuth('settings:manage');
    if (auth instanceof Response) return auth;
    await resetToCleanWorkspace(db, { name: auth.user.name, role: auth.user.role });
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: `API route not found: ${method} ${pathname}` }, 404);
}

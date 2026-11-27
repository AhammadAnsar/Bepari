import 'dotenv/config';
import express from 'express';
import { sanitizeCashMemoSettings } from './src/lib/cashMemoTemplates.ts';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  createAuthMiddleware,
  createSession,
  getRolePermissions,
  hashPassword,
  isWorkspacePasswordLocked,
  requirePermission,
  verifyPassword,
  verifyWorkspaceAdminPasscode,
  type AuthenticatedRequest,
} from './src/server/auth.ts';
import { getDb } from './src/server/db.ts';
import {
  computeInvoiceTotals,
  computeNextRecurringDate,
} from './src/engine/billing.ts';
import type { UserRole } from './src/engine/types.ts';
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
} from './src/server/services/engineService.ts';

const PORT = 3000;

async function startServer() {
  const db = getDb();

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  const requireAuth = createAuthMiddleware(db);

  // ---------------- Auth, First-Run Onboarding & Session Routes ----------------

  app.get('/api/auth/status', (_req, res) => {
    const orgRow = db
      .prepare('SELECT onboarding_completed FROM organizations WHERE id = 1')
      .get() as { onboarding_completed?: number } | undefined;
    const users = db
      .prepare('SELECT id, name, email, role, branch_id as branchId FROM users WHERE is_active = 1 ORDER BY id ASC')
      .all();
    const needsOnboarding = !orgRow?.onboarding_completed || users.length === 0;
    const locked = needsOnboarding ? true : isWorkspacePasswordLocked(db);
    res.json({ needsOnboarding, locked, users });
  });

  app.post('/api/auth/onboard', (req, res) => {
    try {
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
      } = req.body || {};

      if (typeof password !== 'string' || password.length < 6) {
        return res
          .status(400)
          .json({ error: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে (Password must be at least 6 characters).' });
      }

      const passwordHash = hashPassword(password);
      const result = onboardWorkspaceTransaction(db, {
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

      const token = createSession(db, result.user.id);
      res.status(201).json({
        token,
        user: result.user,
        permissions: getRolePermissions(result.user.role),
        locked: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to complete onboarding.';
      const status = message.includes('already been completed') ? 403 : 400;
      res.status(status).json({ error: message });
    }
  });

  // Preview-friendly session bootstrap when workspace password lock is not yet claimed
  app.post('/api/auth/bootstrap-session', (req, res) => {
    const orgRow = db
      .prepare('SELECT onboarding_completed FROM organizations WHERE id = 1')
      .get() as { onboarding_completed?: number } | undefined;
    const activeUsersCount = (
      db.prepare('SELECT COUNT(*) as c FROM users WHERE is_active = 1').get() as { c: number }
    ).c;
    if (!orgRow?.onboarding_completed || activeUsersCount === 0) {
      return res.status(403).json({ error: 'Workspace requires first-run onboarding.' });
    }
    if (isWorkspacePasswordLocked(db)) {
      return res.status(403).json({ error: 'Workspace is password-protected. Please sign in.' });
    }
    const requestedUserId = Number(req.body?.userId) || 1;
    const user = db
      .prepare('SELECT id, name, email, role, branch_id as branchId FROM users WHERE id = ? AND is_active = 1')
      .get(requestedUserId) as
      | { id: number; name: string; email: string; role: UserRole; branchId: number | null }
      | undefined;

    const target =
      user ||
      (db
        .prepare('SELECT id, name, email, role, branch_id as branchId FROM users WHERE is_active = 1 ORDER BY id ASC LIMIT 1')
        .get() as { id: number; name: string; email: string; role: UserRole; branchId: number | null });

    const token = createSession(db, target.id);
    res.json({
      token,
      user: target,
      permissions: getRolePermissions(target.role),
      locked: false,
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    if (typeof password !== 'string' || password.length < 4) {
      return res.status(400).json({ error: 'Password is required.' });
    }

    const user = (email
      ? db
          .prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND is_active = 1')
          .get(String(email).trim())
      : db
          .prepare("SELECT * FROM users WHERE role = 'owner' AND is_active = 1 ORDER BY id ASC LIMIT 1")
          .get()) as
      | {
          id: number;
          name: string;
          email: string;
          role: UserRole;
          branch_id: number | null;
          password_hash: string | null;
        }
      | undefined;

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const valid = user.password_hash
      ? verifyPassword(password, user.password_hash)
      : verifyWorkspaceAdminPasscode(db, password);

    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = createSession(db, user.id);
    writeAuditLog(db, { name: user.name, role: user.role }, 'USER_LOGIN', 'user', user.id, `Signed in as ${user.role}`);
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        branchId: user.branch_id,
      },
      permissions: getRolePermissions(user.role),
      locked: isWorkspacePasswordLocked(db),
    });
  });

  app.post('/api/auth/logout', requireAuth, (req: AuthenticatedRequest, res) => {
    if (req.sessionToken) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(req.sessionToken);
    }
    res.json({ ok: true });
  });

  app.post('/api/auth/set-lock', requireAuth, requirePermission('users:manage'), (req: AuthenticatedRequest, res) => {
    const { password } = req.body || {};
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Admin password must be at least 6 characters.' });
    }
    const hash = hashPassword(password);
    db.prepare('UPDATE organizations SET admin_password_hash = ? WHERE id = 1').run(hash);
    writeAuditLog(
      db,
      { name: req.authUser!.name, role: req.authUser!.role },
      'ADMIN_LOCK_ENABLED',
      'organization',
      1,
      'Enabled scrypt-hashed workspace admin password lock'
    );
    res.json({ ok: true, locked: true });
  });

  app.post('/api/auth/switch-role', requireAuth, (req: AuthenticatedRequest, res) => {
    if (isWorkspacePasswordLocked(db)) {
      return res.status(403).json({ error: 'Role quick-switch is disabled while password lock is active.' });
    }
    const targetUserId = Number(req.body?.userId);
    const target = db
      .prepare('SELECT id, name, email, role, branch_id as branchId FROM users WHERE id = ? AND is_active = 1')
      .get(targetUserId) as
      | { id: number; name: string; email: string; role: UserRole; branchId: number | null }
      | undefined;

    if (!target) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const token = createSession(db, target.id);
    res.json({
      token,
      user: target,
      permissions: getRolePermissions(target.role),
      locked: false,
    });
  });

  // ---------------- Workspace Snapshot ----------------

  app.get('/api/workspace', requireAuth, requirePermission('read'), (req: AuthenticatedRequest, res) => {
    try {
      const branchParam = req.query.branchId ? Number(req.query.branchId) : undefined;
      const branchId = branchParam && Number.isFinite(branchParam) && branchParam > 0 ? branchParam : undefined;
      const data = listAllWorkspaceData(db, branchId);
      res.json(data);
    } catch (err) {
      console.error('Failed to load workspace:', err);
      res.status(500).json({ error: 'Failed to load workspace data.' });
    }
  });

  // ---------------- Customers & Statements ----------------

  app.post('/api/customers', requireAuth, requirePermission('invoice:write'), (req: AuthenticatedRequest, res) => {
    try {
      const { name, companyName, phone, email, binNumber, address, openingBalance, creditLimit } = req.body || {};
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'Customer name is required.' });
      }
      const nextId = ((db.prepare('SELECT COALESCE(MAX(id),0) as m FROM customers').get() as { m: number }).m || 0) + 1;
      const code = `CUST-${String(nextId).padStart(3, '0')}`;
      const info = db
        .prepare(
          `INSERT INTO customers (code, name, company_name, phone, email, bin_number, address, opening_balance, credit_limit)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          code,
          String(name).trim(),
          String(companyName || '').trim(),
          String(phone || '').trim(),
          String(email || '').trim(),
          String(binNumber || '').trim(),
          String(address || '').trim(),
          Number(openingBalance) || 0,
          Number(creditLimit) || 0
        );

      writeAuditLog(
        db,
        { name: req.authUser!.name, role: req.authUser!.role },
        'CUSTOMER_CREATED',
        'customer',
        Number(info.lastInsertRowid),
        `Created customer ${String(name).trim()} (${code})`
      );
      res.status(201).json({ id: Number(info.lastInsertRowid), code });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create customer.' });
    }
  });

  app.get('/api/customers/:id/statement', requireAuth, requirePermission('read'), (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid customer ID.' });
      const statement = getCustomerStatementData(db, id);
      res.json(statement);
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Customer not found.' });
    }
  });

  app.put('/api/customers/:id', requireAuth, requirePermission('invoice:write'), (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid customer ID.' });
      const result = updateCustomerRecord(db, id, req.body || {}, {
        name: req.authUser!.name,
        role: req.authUser!.role,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update customer.' });
    }
  });

  app.delete('/api/customers/:id', requireAuth, requirePermission('invoice:write'), (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid customer ID.' });
      const result = deleteCustomerRecord(db, id, {
        name: req.authUser!.name,
        role: req.authUser!.role,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to delete customer.' });
    }
  });

  // ---------------- Vendors & Products ----------------

  app.post('/api/vendors', requireAuth, requirePermission('purchase:write'), (req: AuthenticatedRequest, res) => {
    try {
      const { name, companyName, phone, email, binNumber, address } = req.body || {};
      if (!name || !String(name).trim()) return res.status(400).json({ error: 'Vendor name is required.' });
      const nextId = ((db.prepare('SELECT COALESCE(MAX(id),0) as m FROM vendors').get() as { m: number }).m || 0) + 1;
      const code = `VEND-${String(nextId).padStart(3, '0')}`;
      const info = db
        .prepare(
          `INSERT INTO vendors (code, name, company_name, phone, email, bin_number, address)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          code,
          String(name).trim(),
          String(companyName || '').trim(),
          String(phone || '').trim(),
          String(email || '').trim(),
          String(binNumber || '').trim(),
          String(address || '').trim()
        );

      writeAuditLog(
        db,
        { name: req.authUser!.name, role: req.authUser!.role },
        'VENDOR_CREATED',
        'vendor',
        Number(info.lastInsertRowid),
        `Created vendor ${String(name).trim()}`
      );
      res.status(201).json({ id: Number(info.lastInsertRowid), code });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create vendor.' });
    }
  });

  app.put('/api/vendors/:id', requireAuth, requirePermission('purchase:write'), (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid vendor ID.' });
      const result = updateVendorRecord(db, id, req.body || {}, {
        name: req.authUser!.name,
        role: req.authUser!.role,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update vendor.' });
    }
  });

  app.delete('/api/vendors/:id', requireAuth, requirePermission('purchase:write'), (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid vendor ID.' });
      const result = deleteVendorRecord(db, id, {
        name: req.authUser!.name,
        role: req.authUser!.role,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to delete vendor.' });
    }
  });

  app.post('/api/products', requireAuth, requirePermission('inventory:write'), (req: AuthenticatedRequest, res) => {
    try {
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
      } = req.body || {};
      if (!name || !String(name).trim()) return res.status(400).json({ error: 'Product name is required.' });
      const finalSku =
        String(sku || '').trim() ||
        `PRD-${String(((db.prepare('SELECT COALESCE(MAX(id),0) as m FROM products').get() as { m: number }).m || 0) + 101)}`;
      const finalBarcode = String(barcode || '').trim() || finalSku;
      const safeImageUrl = sanitizeProductImageUrl(imageUrl);

      const info = db
        .prepare(
          `INSERT INTO products (sku, barcode, brand, name, name_bn, unit, category, hs_code, description, image_url, is_active, track_inventory, sale_price, cost_price, tax_rule_id, reorder_level)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
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
          Math.max(0, Number(reorderLevel) || 5)
        );

      const productId = Number(info.lastInsertRowid);
      const qty = Math.max(0, Number(initialStock) || 0);
      if (qty > 0 && trackInventory !== false) {
        const bId = Number(branchId) || 1;
        const unitCost = Math.max(0, Number(costPrice) || 0);
        db.prepare(
          `INSERT INTO branch_stock (branch_id, product_id, quantity, avg_cost, fifo_lots_json)
           VALUES (?, ?, ?, ?, ?)`
        ).run(bId, productId, qty, unitCost, JSON.stringify([{ qty, unitCost }]));

        db.prepare(
          `INSERT INTO stock_movements (branch_id, product_id, movement_type, quantity, unit_cost, total_cost, source_type, source_id, movement_date, notes)
           VALUES (?, ?, 'in', ?, ?, ?, 'opening', ?, ?, ?)`
        ).run(
          bId,
          productId,
          qty,
          unitCost,
          Math.round(qty * unitCost * 100) / 100,
          productId,
          new Date().toISOString().slice(0, 10),
          'Opening stock balance'
        );
      }

      writeAuditLog(
        db,
        { name: req.authUser!.name, role: req.authUser!.role },
        'PRODUCT_CREATED',
        'product',
        productId,
        `Added product ${String(name).trim()} (${finalSku})`
      );
      res.status(201).json({ id: productId, sku: finalSku });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create product.' });
    }
  });

  app.put('/api/products/:id', requireAuth, requirePermission('inventory:write'), (req: AuthenticatedRequest, res) => {
    try {
      const productId = Number(req.params.id);
      if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({ error: 'Invalid product ID.' });
      }
      const result = updateProductRecord(db, productId, req.body || {}, {
        name: req.authUser!.name,
        role: req.authUser!.role,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update product.' });
    }
  });

  app.delete('/api/products/:id', requireAuth, requirePermission('inventory:write'), (req: AuthenticatedRequest, res) => {
    try {
      const productId = Number(req.params.id);
      if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({ error: 'Invalid product ID.' });
      }
      const result = deleteProductRecord(db, productId, {
        name: req.authUser!.name,
        role: req.authUser!.role,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to delete product.' });
    }
  });

  app.get('/api/products/:id/movements', requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      const productId = Number(req.params.id);
      if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({ error: 'Invalid product ID.' });
      }
      const movements = listProductStockMovements(db, productId);
      res.json({ movements });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to load stock movements.' });
    }
  });

  app.post('/api/products/:id/adjust-stock', requireAuth, requirePermission('inventory:write'), (req: AuthenticatedRequest, res) => {
    try {
      const productId = Number(req.params.id);
      if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({ error: 'Invalid product ID.' });
      }
      const mode = req.body?.mode;
      if (mode !== 'add' && mode !== 'reduce' && mode !== 'set') {
        return res.status(400).json({ error: 'Invalid adjustment mode.' });
      }
      const result = adjustProductStockTransaction(
        db,
        {
          productId,
          branchId: Number(req.body.branchId) || 1,
          mode,
          quantity: Number(req.body.quantity),
          unitCost: req.body.unitCost !== undefined && req.body.unitCost !== '' ? Number(req.body.unitCost) : undefined,
          reason: String(req.body.reason || 'Manual stock adjustment'),
          date: req.body.date ? String(req.body.date) : undefined,
        },
        { name: req.authUser!.name, role: req.authUser!.role }
      );
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to adjust stock.' });
    }
  });

  app.post('/api/products/transfer-stock', requireAuth, requirePermission('inventory:write'), (req: AuthenticatedRequest, res) => {
    try {
      const result = transferProductStockTransaction(
        db,
        {
          productId: Number(req.body?.productId),
          fromBranchId: Number(req.body?.fromBranchId),
          toBranchId: Number(req.body?.toBranchId),
          quantity: Number(req.body?.quantity),
          notes: req.body?.notes ? String(req.body.notes) : '',
          date: req.body?.date ? String(req.body.date) : undefined,
        },
        { name: req.authUser!.name, role: req.authUser!.role }
      );
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to transfer stock.' });
    }
  });

  // ---------------- Invoices & POS ----------------

  app.post('/api/invoices', requireAuth, requirePermission('invoice:write'), (req: AuthenticatedRequest, res) => {
    try {
      const idempotencyKey = req.headers['idempotency-key']
        ? String(req.headers['idempotency-key'])
        : req.body?.idempotencyKey;

      const invoice = createInvoiceTransaction(
        db,
        {
          branchId: Number(req.body.branchId) || 1,
          customerId: Number(req.body.customerId),
          issueDate: String(req.body.issueDate),
          dueDate: String(req.body.dueDate),
          notes: req.body.notes ? String(req.body.notes) : '',
          source: req.body.source === 'pos' ? 'pos' : 'invoice',
          items: req.body.items,
          idempotencyKey,
          immediatePayment: req.body.immediatePayment,
        },
        { name: req.authUser!.name, role: req.authUser!.role }
      );

      res.status(201).json(invoice);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create invoice.' });
    }
  });

  app.get('/api/invoices/:id', requireAuth, requirePermission('read'), (req, res) => {
    const inv = getInvoiceById(db, Number(req.params.id));
    if (!inv) return res.status(404).json({ error: 'Invoice not found.' });
    res.json(inv);
  });

  app.put('/api/invoices/:id', requireAuth, requirePermission('invoice:write'), (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid invoice ID.' });
      const updated = updateInvoiceTransaction(
        db,
        id,
        {
          branchId: Number(req.body.branchId) || 1,
          customerId: Number(req.body.customerId),
          issueDate: String(req.body.issueDate),
          dueDate: String(req.body.dueDate),
          notes: req.body.notes ? String(req.body.notes) : '',
          items: req.body.items,
        },
        { name: req.authUser!.name, role: req.authUser!.role }
      );
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update invoice.' });
    }
  });

  app.delete('/api/invoices/:id', requireAuth, requirePermission('invoice:write'), (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid invoice ID.' });
      const result = deleteInvoiceTransaction(db, id, {
        name: req.authUser!.name,
        role: req.authUser!.role,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to delete invoice.' });
    }
  });

  // ---------------- Payments & Gateway Settlement ----------------

  app.post('/api/payments', requireAuth, requirePermission('payment:write'), (req: AuthenticatedRequest, res) => {
    try {
      const idempotencyKey = req.headers['idempotency-key']
        ? String(req.headers['idempotency-key'])
        : req.body?.idempotencyKey;

      const payment = recordPaymentTransaction(
        db,
        {
          customerId: Number(req.body.customerId),
          branchId: Number(req.body.branchId) || 1,
          paymentDate: String(req.body.paymentDate),
          amount: Number(req.body.amount),
          method: req.body.method,
          gatewayProvider: req.body.gatewayProvider || null,
          gatewayReference: req.body.gatewayReference || null,
          invoiceId: req.body.invoiceId ? Number(req.body.invoiceId) : null,
          notes: req.body.notes || '',
          idempotencyKey,
        },
        { name: req.authUser!.name, role: req.authUser!.role }
      );
      res.status(201).json(payment);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to record payment.' });
    }
  });

  app.put('/api/payments/:id', requireAuth, requirePermission('payment:write'), (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid payment ID.' });
      const result = updatePaymentTransaction(
        db,
        id,
        {
          branchId: req.body.branchId ? Number(req.body.branchId) : undefined,
          paymentDate: String(req.body.paymentDate),
          amount: Number(req.body.amount),
          method: req.body.method,
          gatewayProvider: req.body.gatewayProvider ?? null,
          gatewayReference: req.body.gatewayReference ?? null,
          notes: req.body.notes ?? '',
        },
        { name: req.authUser!.name, role: req.authUser!.role }
      );
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update payment.' });
    }
  });

  app.delete('/api/payments/:id', requireAuth, requirePermission('payment:write'), (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid payment ID.' });
      const result = deletePaymentTransaction(db, id, {
        name: req.authUser!.name,
        role: req.authUser!.role,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to delete payment.' });
    }
  });

  // ---------------- Purchases & Expenses ----------------

  app.post('/api/purchases', requireAuth, requirePermission('purchase:write'), (req: AuthenticatedRequest, res) => {
    try {
      const purchase = createPurchaseTransaction(
        db,
        {
          branchId: Number(req.body.branchId) || 1,
          vendorId: Number(req.body.vendorId),
          purchaseDate: String(req.body.purchaseDate),
          mushak61Ref: req.body.mushak61Ref,
          notes: req.body.notes,
          payImmediately: Boolean(req.body.payImmediately),
          paymentMethod: req.body.paymentMethod || 'bank',
          items: req.body.items,
        },
        { name: req.authUser!.name, role: req.authUser!.role }
      );
      res.status(201).json(purchase);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to record purchase.' });
    }
  });

  app.put('/api/purchases/:id', requireAuth, requirePermission('purchase:write'), (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid purchase ID.' });
      const result = updatePurchaseTransaction(
        db,
        id,
        {
          branchId: Number(req.body.branchId) || 1,
          vendorId: Number(req.body.vendorId),
          purchaseDate: String(req.body.purchaseDate),
          mushak61Ref: req.body.mushak61Ref,
          notes: req.body.notes,
          payImmediately: Boolean(req.body.payImmediately),
          paymentMethod: req.body.paymentMethod || 'bank',
          items: req.body.items,
        },
        { name: req.authUser!.name, role: req.authUser!.role }
      );
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update purchase.' });
    }
  });

  app.delete('/api/purchases/:id', requireAuth, requirePermission('purchase:write'), (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid purchase ID.' });
      const result = deletePurchaseTransaction(db, id, {
        name: req.authUser!.name,
        role: req.authUser!.role,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to delete purchase.' });
    }
  });

  app.post('/api/expenses', requireAuth, requirePermission('expense:write'), (req: AuthenticatedRequest, res) => {
    try {
      const expense = createExpenseTransaction(
        db,
        {
          branchId: Number(req.body.branchId) || 1,
          expenseDate: String(req.body.expenseDate),
          category: String(req.body.category),
          accountCode: String(req.body.accountCode || '5500'),
          vendorName: String(req.body.vendorName || ''),
          amount: Number(req.body.amount),
          vatAmount: Number(req.body.vatAmount || 0),
          paymentMethod: req.body.paymentMethod || 'cash',
          reference: String(req.body.reference || ''),
          notes: String(req.body.notes || ''),
        },
        { name: req.authUser!.name, role: req.authUser!.role }
      );
      res.status(201).json(expense);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to record expense.' });
    }
  });

  app.put('/api/expenses/:id', requireAuth, requirePermission('expense:write'), (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid expense ID.' });
      const result = updateExpenseTransaction(
        db,
        id,
        {
          branchId: Number(req.body.branchId) || 1,
          expenseDate: String(req.body.expenseDate),
          category: String(req.body.category),
          accountCode: String(req.body.accountCode || '5500'),
          vendorName: String(req.body.vendorName || ''),
          amount: Number(req.body.amount),
          vatAmount: Number(req.body.vatAmount || 0),
          paymentMethod: req.body.paymentMethod || 'cash',
          reference: String(req.body.reference || ''),
          notes: String(req.body.notes || ''),
        },
        { name: req.authUser!.name, role: req.authUser!.role }
      );
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update expense.' });
    }
  });

  app.delete('/api/expenses/:id', requireAuth, requirePermission('expense:write'), (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid expense ID.' });
      const result = deleteExpenseTransaction(db, id, {
        name: req.authUser!.name,
        role: req.authUser!.role,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to delete expense.' });
    }
  });

  // ---------------- Recurring Billing ----------------

  app.post('/api/recurring', requireAuth, requirePermission('recurring:write'), (req: AuthenticatedRequest, res) => {
    try {
      const { title, customerId, branchId, frequency, nextRunDate, items } = req.body || {};
      if (!title || !customerId || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Title, customer, and line items are required.' });
      }
      const computed = computeInvoiceTotals(items, 'exclusive');
      const start = String(nextRunDate || computeNextRecurringDate(new Date().toISOString().slice(0, 10), 'monthly'));
      const info = db
        .prepare(
          `INSERT INTO recurring_profiles (title, customer_id, branch_id, frequency, next_run_date, status, auto_send, items_json, estimated_total)
           VALUES (?, ?, ?, ?, ?, 'active', 1, ?, ?)`
        )
        .run(
          String(title).trim(),
          Number(customerId),
          Number(branchId) || 1,
          frequency || 'monthly',
          start,
          JSON.stringify(items),
          computed.grandTotal
        );

      writeAuditLog(
        db,
        { name: req.authUser!.name, role: req.authUser!.role },
        'RECURRING_CREATED',
        'recurring_profile',
        Number(info.lastInsertRowid),
        `Created recurring schedule "${String(title).trim()}" (${frequency})`
      );
      res.status(201).json({ id: Number(info.lastInsertRowid) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create recurring profile.' });
    }
  });

  app.post('/api/recurring/:id/run', requireAuth, requirePermission('recurring:write'), (req: AuthenticatedRequest, res) => {
    try {
      const inv = runRecurringProfileNow(db, Number(req.params.id), {
        name: req.authUser!.name,
        role: req.authUser!.role,
      });
      res.status(201).json(inv);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to generate recurring invoice.' });
    }
  });

  app.patch('/api/recurring/:id/toggle', requireAuth, requirePermission('recurring:write'), (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT status FROM recurring_profiles WHERE id = ?').get(id) as
      | { status: string }
      | undefined;
    if (!row) return res.status(404).json({ error: 'Profile not found.' });
    const nextStatus = row.status === 'active' ? 'paused' : 'active';
    db.prepare('UPDATE recurring_profiles SET status = ? WHERE id = ?').run(nextStatus, id);
    res.json({ id, status: nextStatus });
  });

  app.put('/api/recurring/:id', requireAuth, requirePermission('recurring:write'), (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid schedule ID.' });
      const { title, customerId, branchId, frequency, nextRunDate, items } = req.body || {};
      const result = updateRecurringProfile(
        db,
        id,
        {
          title: String(title || ''),
          customerId: Number(customerId),
          branchId: branchId ? Number(branchId) : undefined,
          frequency: frequency || 'monthly',
          nextRunDate: String(nextRunDate || new Date().toISOString().slice(0, 10)),
          items,
        },
        { name: req.authUser!.name, role: req.authUser!.role }
      );
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update schedule.' });
    }
  });

  app.delete('/api/recurring/:id', requireAuth, requirePermission('recurring:write'), (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid schedule ID.' });
      const result = deleteRecurringProfile(db, id, {
        name: req.authUser!.name,
        role: req.authUser!.role,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to delete schedule.' });
    }
  });

  // ---------------- Immutable Ledger Reversal ----------------

  app.post('/api/journals/:id/reverse', requireAuth, requirePermission('journal:reverse'), (req: AuthenticatedRequest, res) => {
    try {
      const result = reverseJournalEntry(
        db,
        Number(req.params.id),
        String(req.body?.reason || 'Accounting adjustment'),
        { name: req.authUser!.name, role: req.authUser!.role }
      );
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to reverse journal entry.' });
    }
  });

  // ---------------- Tax Rules, Branches, Users & Settings ----------------

  app.post('/api/tax-rules', requireAuth, requirePermission('vat:manage'), (req: AuthenticatedRequest, res) => {
    try {
      const { code, name, nameBn, rate, sdRate, mushakCategory, effectiveFrom } = req.body || {};
      if (!code || !name) return res.status(400).json({ error: 'Code and name are required.' });
      const info = db
        .prepare(
          `INSERT INTO tax_rules (code, name, name_bn, rate, sd_rate, mushak_category, effective_from, is_default, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1)`
        )
        .run(
          String(code).trim().toUpperCase(),
          String(name).trim(),
          String(nameBn || name).trim(),
          Math.max(0, Number(rate) || 0),
          Math.max(0, Number(sdRate) || 0),
          String(mushakCategory || 'standard'),
          String(effectiveFrom || new Date().toISOString().slice(0, 10))
        );

      writeAuditLog(
        db,
        { name: req.authUser!.name, role: req.authUser!.role },
        'TAX_RULE_CREATED',
        'tax_rule',
        Number(info.lastInsertRowid),
        `Added versioned VAT rule ${code} (${rate}%) effective ${effectiveFrom}`
      );
      res.status(201).json({ id: Number(info.lastInsertRowid) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create tax rule.' });
    }
  });

  app.put('/api/tax-rules/:id', requireAuth, requirePermission('vat:manage'), (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid tax rule ID.' });
      const result = updateTaxRule(db, id, req.body || {}, {
        name: req.authUser!.name,
        role: req.authUser!.role,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update tax rule.' });
    }
  });

  app.delete('/api/tax-rules/:id', requireAuth, requirePermission('vat:manage'), (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid tax rule ID.' });
      const result = deleteTaxRule(db, id, {
        name: req.authUser!.name,
        role: req.authUser!.role,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to delete tax rule.' });
    }
  });

  app.post('/api/branches', requireAuth, requirePermission('settings:manage'), (req: AuthenticatedRequest, res) => {
    try {
      const { code, name, nameBn, address, phone } = req.body || {};
      if (!code || !name) return res.status(400).json({ error: 'Branch code and name are required.' });
      const info = db
        .prepare('INSERT INTO branches (code, name, name_bn, address, phone, is_main) VALUES (?, ?, ?, ?, ?, 0)')
        .run(
          String(code).trim().toUpperCase().slice(0, 6),
          String(name).trim(),
          String(nameBn || name).trim(),
          String(address || '').trim(),
          String(phone || '').trim()
        );
      writeAuditLog(
        db,
        { name: req.authUser!.name, role: req.authUser!.role },
        'BRANCH_CREATED',
        'branch',
        Number(info.lastInsertRowid),
        `Added branch ${String(name).trim()} (${String(code).toUpperCase()})`
      );
      res.status(201).json({ id: Number(info.lastInsertRowid) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create branch.' });
    }
  });

  app.put('/api/branches/:id', requireAuth, requirePermission('settings:manage'), (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid branch ID.' });
      const result = updateBranchRecord(db, id, req.body || {}, {
        name: req.authUser!.name,
        role: req.authUser!.role,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update branch.' });
    }
  });

  app.delete('/api/branches/:id', requireAuth, requirePermission('settings:manage'), (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid branch ID.' });
      const result = deleteBranchRecord(db, id, {
        name: req.authUser!.name,
        role: req.authUser!.role,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to delete branch.' });
    }
  });

  app.post('/api/users', requireAuth, requirePermission('users:manage'), (req: AuthenticatedRequest, res) => {
    try {
      const { name, email, role, branchId, password } = req.body || {};
      if (!name || !email || !role) return res.status(400).json({ error: 'Name, email, and role are required.' });
      const passHash = password && String(password).length >= 6 ? hashPassword(String(password)) : null;
      const info = db
        .prepare('INSERT INTO users (name, email, role, branch_id, password_hash) VALUES (?, ?, ?, ?, ?)')
        .run(
          String(name).trim(),
          String(email).trim().toLowerCase(),
          String(role),
          branchId ? Number(branchId) : null,
          passHash
        );
      writeAuditLog(
        db,
        { name: req.authUser!.name, role: req.authUser!.role },
        'USER_CREATED',
        'user',
        Number(info.lastInsertRowid),
        `Added team member ${String(name).trim()} with role ${role}`
      );
      res.status(201).json({ id: Number(info.lastInsertRowid) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to add user.' });
    }
  });

  app.put('/api/users/:id', requireAuth, requirePermission('users:manage'), (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid user ID.' });
      const { name, email, role, branchId, password } = req.body || {};
      const passwordHash =
        password && String(password).trim().length > 0
          ? String(password).length >= 6
            ? hashPassword(String(password))
            : (() => {
                throw new Error('Password must be at least 6 characters.');
              })()
          : null;
      const result = updateUserRecord(
        db,
        id,
        {
          name: String(name || ''),
          email: String(email || ''),
          role: String(role || ''),
          branchId: branchId ? Number(branchId) : null,
          passwordHash,
        },
        { name: req.authUser!.name, role: req.authUser!.role }
      );
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update user.' });
    }
  });

  app.delete('/api/users/:id', requireAuth, requirePermission('users:manage'), (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid user ID.' });
      const result = deleteUserRecord(db, id, req.authUser!.id, {
        name: req.authUser!.name,
        role: req.authUser!.role,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to delete user.' });
    }
  });

  app.patch('/api/organization', requireAuth, requirePermission('settings:manage'), (req: AuthenticatedRequest, res) => {
    try {
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
      } = req.body || {};
      const clampOpt = (val: unknown, maxLen: number): string | null =>
        typeof val === 'string' ? val.trim().slice(0, maxLen) : null;
      const safeLogoUrl = logoUrl !== undefined ? sanitizeProductImageUrl(logoUrl) : null;
      const safeCashMemoJson =
        cashMemoSettings !== undefined ? JSON.stringify(sanitizeCashMemoSettings(cashMemoSettings)) : null;
      db.prepare(
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
         WHERE id = 1`
      ).run(
        clampOpt(name, 160),
        clampOpt(nameBn, 160),
        clampOpt(binNumber, 60),
        clampOpt(tinNumber, 60),
        clampOpt(phone, 80),
        clampOpt(email, 120),
        clampOpt(address, 260),
        clampOpt(currency, 16),
        clampOpt(currencySymbol, 8),
        defaultLanguage ?? null,
        inventoryMethod ?? null,
        vatMode ?? null,
        clampOpt(invoicePrefix, 24),
        clampOpt(mushakPrefix, 24),
        clampOpt(proprietorName, 120),
        clampOpt(tagline, 160),
        clampOpt(website, 120),
        clampOpt(businessDescription, 320),
        safeLogoUrl,
        safeCashMemoJson
      );
      writeAuditLog(
        db,
        { name: req.authUser!.name, role: req.authUser!.role },
        'SETTINGS_UPDATED',
        'organization',
        1,
        'Updated organization configuration & VAT/inventory settings'
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update settings.' });
    }
  });

  app.post('/api/workspace/reset', requireAuth, requirePermission('settings:manage'), (req: AuthenticatedRequest, res) => {
    resetToCleanWorkspace(db, { name: req.authUser!.name, role: req.authUser!.role });
    res.json({ ok: true });
  });

  // ---------------- Frontend Serving (Vite Dev / Production Dist) ----------------

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Bepari server running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Bepari server:', err);
  process.exit(1);
});

import { roundMoney } from '../../engine/accounting.ts';
import { computeInvoiceTotals } from '../../engine/billing.ts';
import { todayISO } from '../../engine/format.ts';
import { computeStockOutCOGS, computeWeightedAvgStockIn, type StockLot } from '../../engine/inventory.ts';
import type {
  InvoiceLineInput,
  JournalLine,
  StockMovementRecord,
  TaxMode,
} from '../../engine/types.ts';
import type { DbClient } from '../dbClient.ts';
import {
  createExpenseTransaction,
  createInvoiceTransaction,
  createPurchaseTransaction,
  recordPaymentTransaction,
} from './salesPurchaseService.ts';
import {
  getOrganization,
  postJournalEntry,
  sanitizeProductImageUrl,
  writeAuditLog,
  type ActorContext,
} from './sharedService.ts';

export async function updateProductRecord(
  db: DbClient,
  productId: number,
  input: {
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
  },
  actor: ActorContext
): Promise<{ id: number; sku: string }> {
  return db.transaction(async (tx) => {
    const existing = await tx.get<{ id: number; sku: string }>(
      'SELECT id, sku FROM products WHERE id = ?',
      [productId]
    );
    if (!existing) throw new Error('Product not found.');

    const name = String(input.name || '').trim();
    if (!name) throw new Error('Product name is required.');

    const finalSku = String(input.sku || existing.sku).trim() || existing.sku;
    const safeImageUrl = sanitizeProductImageUrl(input.imageUrl);

    await tx.run(
      `UPDATE products
       SET sku = ?, barcode = ?, brand = ?, name = ?, name_bn = ?, unit = ?, category = ?,
           hs_code = ?, description = ?, image_url = ?, is_active = ?, track_inventory = ?,
           sale_price = ?, cost_price = ?, tax_rule_id = ?, reorder_level = ?
       WHERE id = ?`,
      [
        finalSku,
        String(input.barcode || finalSku).trim(),
        String(input.brand || '').trim(),
        name,
        String(input.nameBn || name).trim(),
        String(input.unit || 'pcs').trim(),
        String(input.category || 'General').trim(),
        String(input.hsCode || '').trim(),
        String(input.description || '').trim(),
        safeImageUrl,
        input.isActive === false ? 0 : 1,
        input.trackInventory === false ? 0 : 1,
        Math.max(0, Number(input.salePrice) || 0),
        Math.max(0, Number(input.costPrice) || 0),
        input.taxRuleId ? Number(input.taxRuleId) : 1,
        Math.max(0, Number(input.reorderLevel) || 0),
        productId,
      ]
    );

    await writeAuditLog(
      tx,
      actor,
      'PRODUCT_UPDATED',
      'product',
      productId,
      `Updated product ${name} (${finalSku})`
    );

    return { id: productId, sku: finalSku };
  });
}

export async function listProductStockMovements(
  db: DbClient,
  productId: number
): Promise<StockMovementRecord[]> {
  const rows = await db.all<Record<string, unknown>>(
    `SELECT sm.*, b.name as branch_name, b.name_bn as branch_name_bn
     FROM stock_movements sm
     INNER JOIN branches b ON b.id = sm.branch_id
     WHERE sm.product_id = ?
     ORDER BY sm.movement_date DESC, sm.id DESC
     LIMIT 100`,
    [productId]
  );

  return rows.map((r) => ({
    id: Number(r.id),
    branchId: Number(r.branch_id),
    branchName: String(r.branch_name),
    branchNameBn: String(r.branch_name_bn),
    productId: Number(r.product_id),
    movementType: r.movement_type as StockMovementRecord['movementType'],
    quantity: roundMoney(Number(r.quantity)),
    unitCost: roundMoney(Number(r.unit_cost)),
    totalCost: roundMoney(Number(r.total_cost)),
    sourceType: String(r.source_type),
    sourceId: r.source_id ? Number(r.source_id) : null,
    movementDate: String(r.movement_date),
    notes: String(r.notes || ''),
    createdAt: String(r.created_at),
  }));
}

export async function adjustProductStockTransaction(
  db: DbClient,
  input: {
    productId: number;
    branchId: number;
    mode: 'add' | 'reduce' | 'set';
    quantity: number;
    unitCost?: number;
    reason: string;
    date?: string;
  },
  actor: ActorContext
): Promise<{ newQuantity: number; delta: number; journalEntryId: number | null }> {
  return db.transaction(async (tx) => {
    const prod = await tx.get<{
      id: number;
      sku: string;
      name: string;
      cost_price: number;
      track_inventory: number;
    }>('SELECT id, sku, name, cost_price, track_inventory FROM products WHERE id = ?', [input.productId]);
    if (!prod) throw new Error('Product not found.');
    if (!prod.track_inventory) throw new Error('Cannot adjust stock for a non-inventory service.');

    const branch = await tx.get<{ id: number; name: string }>('SELECT id, name FROM branches WHERE id = ?', [
      input.branchId,
    ]);
    if (!branch) throw new Error('Branch not found.');

    const rawQty = Number(input.quantity);
    if (!Number.isFinite(rawQty) || rawQty < 0) {
      throw new Error('Quantity must be a valid non-negative number.');
    }
    if (input.mode !== 'set' && rawQty <= 0) {
      throw new Error('Adjustment quantity must be greater than zero.');
    }

    const org = await getOrganization(tx);
    const stockRow = await tx.get<{
      id: number;
      quantity: number;
      avg_cost: number;
      fifo_lots_json: string;
    }>('SELECT id, quantity, avg_cost, fifo_lots_json FROM branch_stock WHERE branch_id = ? AND product_id = ?', [
      input.branchId,
      input.productId,
    ]);

    const currentQty = stockRow ? Number(stockRow.quantity) : 0;
    const currentAvg = stockRow ? Number(stockRow.avg_cost) : Number(prod.cost_price);
    const currentLots: StockLot[] = stockRow ? JSON.parse(stockRow.fifo_lots_json || '[]') : [];

    let delta = 0;
    if (input.mode === 'add') delta = rawQty;
    else if (input.mode === 'reduce') delta = -rawQty;
    else delta = roundMoney(rawQty - currentQty);

    if (Math.abs(delta) < 0.0001) {
      throw new Error('New stock count matches current branch stock (no change required).');
    }
    const newQuantity = roundMoney(currentQty + delta);
    if (newQuantity < 0) {
      throw new Error(`Insufficient stock in ${branch.name}. Available: ${currentQty}.`);
    }

    const effectiveUnitCost = Math.max(
      0,
      input.unitCost !== undefined && Number.isFinite(Number(input.unitCost))
        ? Number(input.unitCost)
        : currentAvg || Number(prod.cost_price)
    );
    const movementDate = input.date || todayISO();
    const reasonText = String(input.reason || 'Manual stock adjustment').trim();
    let totalCostDelta = 0;
    let nextAvg = currentAvg || effectiveUnitCost;
    let nextLots = currentLots;

    if (delta > 0) {
      const updated = computeWeightedAvgStockIn(currentQty, currentAvg, delta, effectiveUnitCost);
      nextAvg = updated.newAvgCost;
      nextLots = [...currentLots, { qty: delta, unitCost: effectiveUnitCost }];
      totalCostDelta = roundMoney(delta * effectiveUnitCost);
    } else {
      const outRes = computeStockOutCOGS({
        method: org.inventoryMethod,
        currentQty,
        currentAvgCost: currentAvg || effectiveUnitCost,
        soldQty: Math.abs(delta),
        fifoLots: currentLots,
      });
      nextLots = outRes.remainingLots ?? currentLots;
      totalCostDelta = roundMoney(outRes.cogsTotal);
    }

    if (stockRow) {
      await tx.run('UPDATE branch_stock SET quantity = ?, avg_cost = ?, fifo_lots_json = ? WHERE id = ?', [
        newQuantity,
        nextAvg,
        JSON.stringify(nextLots),
        stockRow.id,
      ]);
    } else {
      await tx.run(
        'INSERT INTO branch_stock (branch_id, product_id, quantity, avg_cost, fifo_lots_json) VALUES (?, ?, ?, ?, ?)',
        [input.branchId, input.productId, newQuantity, nextAvg, JSON.stringify(nextLots)]
      );
    }

    const mvInfo = await tx.run(
      `INSERT INTO stock_movements (branch_id, product_id, movement_type, quantity, unit_cost, total_cost, source_type, source_id, movement_date, notes)
       VALUES (?, ?, 'adjustment', ?, ?, ?, 'adjustment', NULL, ?, ?)`,
      [
        input.branchId,
        input.productId,
        delta,
        delta > 0 ? effectiveUnitCost : roundMoney(totalCostDelta / Math.abs(delta)),
        totalCostDelta,
        movementDate,
        reasonText,
      ]
    );

    let journalEntryId: number | null = null;
    if (totalCostDelta > 0) {
      const lines: JournalLine[] =
        delta > 0
          ? [
              { accountCode: '1200', debit: totalCostDelta, credit: 0, memo: `Stock increase: ${prod.sku} (+${delta})` },
              { accountCode: '5000', debit: 0, credit: totalCostDelta, memo: reasonText },
            ]
          : [
              { accountCode: '5000', debit: totalCostDelta, credit: 0, memo: reasonText },
              { accountCode: '1200', debit: 0, credit: totalCostDelta, memo: `Stock reduction: ${prod.sku} (${delta})` },
            ];
      journalEntryId = await postJournalEntry(tx, {
        entryDate: movementDate,
        branchId: input.branchId,
        sourceType: 'stock_adjustment',
        sourceId: Number(mvInfo.lastInsertRowid),
        description: `Stock Adjustment · ${prod.name} (${delta > 0 ? '+' : ''}${delta}) — ${reasonText}`,
        lines,
        actor,
      });
    }

    await writeAuditLog(
      tx,
      actor,
      'STOCK_ADJUSTED',
      'product',
      input.productId,
      `Adjusted ${prod.sku} in ${branch.name}: ${currentQty} -> ${newQuantity} (${reasonText})`
    );

    return { newQuantity, delta, journalEntryId };
  });
}

export async function transferProductStockTransaction(
  db: DbClient,
  input: {
    productId: number;
    fromBranchId: number;
    toBranchId: number;
    quantity: number;
    notes?: string;
    date?: string;
  },
  actor: ActorContext
): Promise<{ transferredQty: number; unitCost: number }> {
  return db.transaction(async (tx) => {
    if (input.fromBranchId === input.toBranchId) {
      throw new Error('Source and destination branches must be different.');
    }
    const qty = Number(input.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error('Transfer quantity must be greater than zero.');
    }

    const prod = await tx.get<{
      id: number;
      sku: string;
      name: string;
      cost_price: number;
      track_inventory: number;
    }>('SELECT id, sku, name, cost_price, track_inventory FROM products WHERE id = ?', [input.productId]);
    if (!prod) throw new Error('Product not found.');
    if (!prod.track_inventory) throw new Error('Cannot transfer stock for a service item.');

    const fromBranch = await tx.get<{ id: number; name: string }>('SELECT id, name FROM branches WHERE id = ?', [
      input.fromBranchId,
    ]);
    const toBranch = await tx.get<{ id: number; name: string }>('SELECT id, name FROM branches WHERE id = ?', [
      input.toBranchId,
    ]);
    if (!fromBranch || !toBranch) throw new Error('Invalid source or destination branch.');

    const srcRow = await tx.get<{
      id: number;
      quantity: number;
      avg_cost: number;
      fifo_lots_json: string;
    }>('SELECT id, quantity, avg_cost, fifo_lots_json FROM branch_stock WHERE branch_id = ? AND product_id = ?', [
      input.fromBranchId,
      input.productId,
    ]);

    const available = srcRow ? Number(srcRow.quantity) : 0;
    if (!srcRow || available < qty) {
      throw new Error(`Insufficient stock in ${fromBranch.name}. Available: ${available}.`);
    }

    const org = await getOrganization(tx);
    const srcLots: StockLot[] = JSON.parse(srcRow.fifo_lots_json || '[]');
    const outRes = computeStockOutCOGS({
      method: org.inventoryMethod,
      currentQty: available,
      currentAvgCost: Number(srcRow.avg_cost) || Number(prod.cost_price),
      soldQty: qty,
      fifoLots: srcLots,
    });
    const transferUnitCost = roundMoney(qty > 0 ? outRes.cogsTotal / qty : Number(srcRow.avg_cost));
    const totalTransferCost = roundMoney(outRes.cogsTotal);

    await tx.run('UPDATE branch_stock SET quantity = ?, fifo_lots_json = ? WHERE id = ?', [
      roundMoney(available - qty),
      JSON.stringify(outRes.remainingLots ?? srcLots),
      srcRow.id,
    ]);

    const dstRow = await tx.get<{
      id: number;
      quantity: number;
      avg_cost: number;
      fifo_lots_json: string;
    }>('SELECT id, quantity, avg_cost, fifo_lots_json FROM branch_stock WHERE branch_id = ? AND product_id = ?', [
      input.toBranchId,
      input.productId,
    ]);

    if (dstRow) {
      const dstLots: StockLot[] = JSON.parse(dstRow.fifo_lots_json || '[]');
      const dstUpd = computeWeightedAvgStockIn(Number(dstRow.quantity), Number(dstRow.avg_cost), qty, transferUnitCost);
      dstLots.push({ qty, unitCost: transferUnitCost });
      await tx.run('UPDATE branch_stock SET quantity = ?, avg_cost = ?, fifo_lots_json = ? WHERE id = ?', [
        dstUpd.newQty,
        dstUpd.newAvgCost,
        JSON.stringify(dstLots),
        dstRow.id,
      ]);
    } else {
      await tx.run(
        'INSERT INTO branch_stock (branch_id, product_id, quantity, avg_cost, fifo_lots_json) VALUES (?, ?, ?, ?, ?)',
        [input.toBranchId, input.productId, qty, transferUnitCost, JSON.stringify([{ qty, unitCost: transferUnitCost }])]
      );
    }

    const movementDate = input.date || todayISO();
    const noteBase = String(input.notes || '').trim();
    const outNote = `Transfer to ${toBranch.name}${noteBase ? ` · ${noteBase}` : ''}`;
    const inNote = `Transfer from ${fromBranch.name}${noteBase ? ` · ${noteBase}` : ''}`;

    const outMv = await tx.run(
      `INSERT INTO stock_movements (branch_id, product_id, movement_type, quantity, unit_cost, total_cost, source_type, source_id, movement_date, notes)
       VALUES (?, ?, 'out', ?, ?, ?, 'transfer_out', ?, ?, ?)`,
      [input.fromBranchId, input.productId, -qty, transferUnitCost, totalTransferCost, input.toBranchId, movementDate, outNote]
    );

    await tx.run(
      `INSERT INTO stock_movements (branch_id, product_id, movement_type, quantity, unit_cost, total_cost, source_type, source_id, movement_date, notes)
       VALUES (?, ?, 'in', ?, ?, ?, 'transfer_in', ?, ?, ?)`,
      [
        input.toBranchId,
        input.productId,
        qty,
        transferUnitCost,
        totalTransferCost,
        Number(outMv.lastInsertRowid),
        movementDate,
        inNote,
      ]
    );

    await writeAuditLog(
      tx,
      actor,
      'STOCK_TRANSFERRED',
      'product',
      input.productId,
      `Transferred ${qty} of ${prod.sku} from ${fromBranch.name} to ${toBranch.name}`
    );

    return { transferredQty: qty, unitCost: transferUnitCost };
  });
}

// Customers
export async function updateCustomerRecord(
  db: DbClient,
  customerId: number,
  input: {
    name?: string;
    companyName?: string;
    phone?: string;
    email?: string;
    binNumber?: string;
    address?: string;
    openingBalance?: number;
    creditLimit?: number;
  },
  actor: ActorContext
): Promise<{ id: number }> {
  return db.transaction(async (tx) => {
    const existing = await tx.get<{ id: number; name: string }>('SELECT id, name FROM customers WHERE id = ?', [
      customerId,
    ]);
    if (!existing) throw new Error('Customer not found.');
    const nextName = String(input.name ?? existing.name).trim();
    if (!nextName) throw new Error('Customer name is required.');

    await tx.run(
      `UPDATE customers SET
        name = ?,
        company_name = COALESCE(?, company_name),
        phone = COALESCE(?, phone),
        email = COALESCE(?, email),
        bin_number = COALESCE(?, bin_number),
        address = COALESCE(?, address),
        opening_balance = COALESCE(?, opening_balance),
        credit_limit = COALESCE(?, credit_limit)
       WHERE id = ?`,
      [
        nextName,
        input.companyName !== undefined ? String(input.companyName).trim() : null,
        input.phone !== undefined ? String(input.phone).trim() : null,
        input.email !== undefined ? String(input.email).trim() : null,
        input.binNumber !== undefined ? String(input.binNumber).trim() : null,
        input.address !== undefined ? String(input.address).trim() : null,
        input.openingBalance !== undefined && Number.isFinite(Number(input.openingBalance))
          ? Number(input.openingBalance)
          : null,
        input.creditLimit !== undefined && Number.isFinite(Number(input.creditLimit))
          ? Math.max(0, Number(input.creditLimit))
          : null,
        customerId,
      ]
    );

    await writeAuditLog(tx, actor, 'CUSTOMER_UPDATED', 'customer', customerId, `Updated customer ${nextName}`);
    return { id: customerId };
  });
}

export async function deleteCustomerRecord(
  db: DbClient,
  customerId: number,
  actor: ActorContext
): Promise<{ deletedId: number }> {
  return db.transaction(async (tx) => {
    const existing = await tx.get<{ id: number; name: string; code: string }>(
      'SELECT id, name, code FROM customers WHERE id = ?',
      [customerId]
    );
    if (!existing) throw new Error('Customer not found.');

    const invCount = Number(
      (await tx.get<{ c: number }>('SELECT COUNT(*) as c FROM invoices WHERE customer_id = ?', [customerId]))?.c || 0
    );
    const payCount = Number(
      (await tx.get<{ c: number }>('SELECT COUNT(*) as c FROM payments WHERE customer_id = ?', [customerId]))?.c || 0
    );
    const recCount = Number(
      (await tx.get<{ c: number }>('SELECT COUNT(*) as c FROM recurring_profiles WHERE customer_id = ?', [customerId]))
        ?.c || 0
    );
    if (invCount > 0 || payCount > 0 || recCount > 0) {
      throw new Error(
        `Cannot delete customer "${existing.name}" because ${invCount} invoice(s), ${payCount} payment(s), and ${recCount} recurring schedule(s) are linked. Delete those records first.`
      );
    }

    await tx.run('DELETE FROM customers WHERE id = ?', [customerId]);
    await writeAuditLog(
      tx,
      actor,
      'CUSTOMER_DELETED',
      'customer',
      customerId,
      `Deleted customer ${existing.name} (${existing.code})`
    );
    return { deletedId: customerId };
  });
}

// Vendors
export async function updateVendorRecord(
  db: DbClient,
  vendorId: number,
  input: {
    name?: string;
    companyName?: string;
    phone?: string;
    email?: string;
    binNumber?: string;
    address?: string;
  },
  actor: ActorContext
): Promise<{ id: number }> {
  return db.transaction(async (tx) => {
    const existing = await tx.get<{ id: number; name: string }>('SELECT id, name FROM vendors WHERE id = ?', [
      vendorId,
    ]);
    if (!existing) throw new Error('Vendor not found.');
    const nextName = String(input.name ?? existing.name).trim();
    if (!nextName) throw new Error('Vendor name is required.');

    await tx.run(
      `UPDATE vendors SET
        name = ?,
        company_name = COALESCE(?, company_name),
        phone = COALESCE(?, phone),
        email = COALESCE(?, email),
        bin_number = COALESCE(?, bin_number),
        address = COALESCE(?, address)
       WHERE id = ?`,
      [
        nextName,
        input.companyName !== undefined ? String(input.companyName).trim() : null,
        input.phone !== undefined ? String(input.phone).trim() : null,
        input.email !== undefined ? String(input.email).trim() : null,
        input.binNumber !== undefined ? String(input.binNumber).trim() : null,
        input.address !== undefined ? String(input.address).trim() : null,
        vendorId,
      ]
    );

    await writeAuditLog(tx, actor, 'VENDOR_UPDATED', 'vendor', vendorId, `Updated vendor ${nextName}`);
    return { id: vendorId };
  });
}

export async function deleteVendorRecord(
  db: DbClient,
  vendorId: number,
  actor: ActorContext
): Promise<{ deletedId: number }> {
  return db.transaction(async (tx) => {
    const existing = await tx.get<{ id: number; name: string; code: string }>(
      'SELECT id, name, code FROM vendors WHERE id = ?',
      [vendorId]
    );
    if (!existing) throw new Error('Vendor not found.');

    const purCount = Number(
      (await tx.get<{ c: number }>('SELECT COUNT(*) as c FROM purchases WHERE vendor_id = ?', [vendorId]))?.c || 0
    );
    if (purCount > 0) {
      throw new Error(
        `Cannot delete vendor "${existing.name}" because ${purCount} purchase bill(s) reference this vendor. Delete those purchases first.`
      );
    }

    await tx.run('DELETE FROM vendors WHERE id = ?', [vendorId]);
    await writeAuditLog(
      tx,
      actor,
      'VENDOR_DELETED',
      'vendor',
      vendorId,
      `Deleted vendor ${existing.name} (${existing.code})`
    );
    return { deletedId: vendorId };
  });
}

// Products
export async function deleteProductRecord(
  db: DbClient,
  productId: number,
  actor: ActorContext
): Promise<{ deletedId: number }> {
  return db.transaction(async (tx) => {
    const existing = await tx.get<{ id: number; sku: string; name: string }>(
      'SELECT id, sku, name FROM products WHERE id = ?',
      [productId]
    );
    if (!existing) throw new Error('Product not found.');

    const invCount = Number(
      (await tx.get<{ c: number }>('SELECT COUNT(*) as c FROM invoice_items WHERE product_id = ?', [productId]))?.c || 0
    );
    const purCount = Number(
      (await tx.get<{ c: number }>('SELECT COUNT(*) as c FROM purchase_items WHERE product_id = ?', [productId]))?.c || 0
    );
    if (invCount > 0 || purCount > 0) {
      throw new Error(
        `Cannot delete product "${existing.name}" (${existing.sku}) because it is referenced in ${invCount} invoice line(s) and ${purCount} purchase line(s). Delete those transactions first.`
      );
    }

    await tx.run('DELETE FROM stock_movements WHERE product_id = ?', [productId]);
    await tx.run('DELETE FROM branch_stock WHERE product_id = ?', [productId]);
    await tx.run('DELETE FROM products WHERE id = ?', [productId]);

    await writeAuditLog(
      tx,
      actor,
      'PRODUCT_DELETED',
      'product',
      productId,
      `Deleted product ${existing.name} (${existing.sku})`
    );
    return { deletedId: productId };
  });
}

// Tax Rules
export async function updateTaxRule(
  db: DbClient,
  id: number,
  input: {
    code: string;
    name: string;
    nameBn?: string;
    rate: number;
    sdRate?: number;
    mushakCategory?: string;
    effectiveFrom: string;
  },
  actor: ActorContext
): Promise<{ id: number }> {
  return db.transaction(async (tx) => {
    const existing = await tx.get<{ id: number }>('SELECT id FROM tax_rules WHERE id = ?', [id]);
    if (!existing) throw new Error('Tax rule not found.');
    const rate = Math.max(0, Number(input.rate) || 0);
    const sdRate = Math.max(0, Number(input.sdRate) || 0);

    await tx.run(
      `UPDATE tax_rules SET code = ?, name = ?, name_bn = ?, rate = ?, sd_rate = ?, mushak_category = ?, effective_from = ?
       WHERE id = ?`,
      [
        String(input.code).trim().toUpperCase(),
        String(input.name).trim(),
        String(input.nameBn || input.name).trim(),
        rate,
        sdRate,
        String(input.mushakCategory || (rate === 15 ? 'standard' : rate === 0 ? 'zero_rated' : 'truncated')),
        String(input.effectiveFrom || todayISO()),
        id,
      ]
    );

    await writeAuditLog(
      tx,
      actor,
      'TAX_RULE_UPDATED',
      'tax_rule',
      id,
      `Updated VAT rule ${String(input.code).toUpperCase()} (${rate}%)`
    );
    return { id };
  });
}

export async function deleteTaxRule(
  db: DbClient,
  id: number,
  actor: ActorContext
): Promise<{ deletedId: number }> {
  return db.transaction(async (tx) => {
    const existing = await tx.get<{ id: number; code: string; is_default: number }>(
      'SELECT id, code, is_default FROM tax_rules WHERE id = ?',
      [id]
    );
    if (!existing) throw new Error('Tax rule not found.');
    if (existing.is_default) throw new Error('Cannot delete the default VAT rule.');

    const prodCount = Number(
      (await tx.get<{ c: number }>('SELECT COUNT(*) as c FROM products WHERE tax_rule_id = ?', [id]))?.c || 0
    );
    const invItemCount = Number(
      (await tx.get<{ c: number }>('SELECT COUNT(*) as c FROM invoice_items WHERE tax_rule_id = ?', [id]))?.c || 0
    );
    if (prodCount > 0 || invItemCount > 0) {
      throw new Error(
        `Cannot delete VAT rule "${existing.code}" because it is assigned to ${prodCount} product(s) and ${invItemCount} invoice line(s).`
      );
    }

    await tx.run('DELETE FROM tax_rules WHERE id = ?', [id]);
    await writeAuditLog(tx, actor, 'TAX_RULE_DELETED', 'tax_rule', id, `Deleted VAT rule ${existing.code}`);
    return { deletedId: id };
  });
}

// Branches
export async function updateBranchRecord(
  db: DbClient,
  id: number,
  input: { code: string; name: string; nameBn?: string; address?: string; phone?: string },
  actor: ActorContext
): Promise<{ id: number }> {
  return db.transaction(async (tx) => {
    const existing = await tx.get<{ id: number }>('SELECT id FROM branches WHERE id = ?', [id]);
    if (!existing) throw new Error('Branch not found.');
    if (!input.code?.trim() || !input.name?.trim()) {
      throw new Error('Branch code and name are required.');
    }

    await tx.run('UPDATE branches SET code = ?, name = ?, name_bn = ?, address = ?, phone = ? WHERE id = ?', [
      input.code.trim().toUpperCase().slice(0, 6),
      input.name.trim(),
      String(input.nameBn || input.name).trim(),
      String(input.address || '').trim(),
      String(input.phone || '').trim(),
      id,
    ]);

    await writeAuditLog(
      tx,
      actor,
      'BRANCH_UPDATED',
      'branch',
      id,
      `Updated branch ${input.name.trim()} (${input.code.trim().toUpperCase()})`
    );
    return { id };
  });
}

export async function deleteBranchRecord(
  db: DbClient,
  id: number,
  actor: ActorContext
): Promise<{ deletedId: number }> {
  return db.transaction(async (tx) => {
    const existing = await tx.get<{ id: number; code: string; name: string; is_main: number }>(
      'SELECT id, code, name, is_main FROM branches WHERE id = ?',
      [id]
    );
    if (!existing) throw new Error('Branch not found.');
    if (existing.is_main) throw new Error('Cannot delete the main Head Office branch.');

    const invC = Number((await tx.get<{ c: number }>('SELECT COUNT(*) as c FROM invoices WHERE branch_id = ?', [id]))?.c || 0);
    const purC = Number((await tx.get<{ c: number }>('SELECT COUNT(*) as c FROM purchases WHERE branch_id = ?', [id]))?.c || 0);
    const expC = Number((await tx.get<{ c: number }>('SELECT COUNT(*) as c FROM expenses WHERE branch_id = ?', [id]))?.c || 0);
    const payC = Number((await tx.get<{ c: number }>('SELECT COUNT(*) as c FROM payments WHERE branch_id = ?', [id]))?.c || 0);
    const jeC = Number((await tx.get<{ c: number }>('SELECT COUNT(*) as c FROM journal_entries WHERE branch_id = ?', [id]))?.c || 0);
    const usrC = Number((await tx.get<{ c: number }>('SELECT COUNT(*) as c FROM users WHERE branch_id = ?', [id]))?.c || 0);
    const stkC = Number(
      (await tx.get<{ c: number }>('SELECT COUNT(*) as c FROM branch_stock WHERE branch_id = ? AND quantity > 0', [id]))?.c ||
        0
    );

    if (invC + purC + expC + payC + jeC + usrC + stkC > 0) {
      throw new Error(
        `Cannot delete branch "${existing.name}" because it has existing stock, staff, or ledger transactions.`
      );
    }

    await tx.run('DELETE FROM stock_movements WHERE branch_id = ?', [id]);
    await tx.run('DELETE FROM branch_stock WHERE branch_id = ?', [id]);
    await tx.run('DELETE FROM branches WHERE id = ?', [id]);
    await writeAuditLog(tx, actor, 'BRANCH_DELETED', 'branch', id, `Deleted branch ${existing.name} (${existing.code})`);
    return { deletedId: id };
  });
}

// Users / Staff
export async function updateUserRecord(
  db: DbClient,
  id: number,
  input: {
    name: string;
    email: string;
    role: string;
    branchId?: number | null;
    passwordHash?: string | null;
  },
  actor: ActorContext
): Promise<{ id: number }> {
  return db.transaction(async (tx) => {
    const existing = await tx.get<{ id: number; role: string }>('SELECT id, role FROM users WHERE id = ?', [id]);
    if (!existing) throw new Error('User not found.');
    if (!input.name?.trim() || !input.email?.trim() || !input.role) {
      throw new Error('Name, email, and role are required.');
    }

    if (existing.role === 'owner' && input.role !== 'owner') {
      const ownerCount = Number(
        (await tx.get<{ c: number }>("SELECT COUNT(*) as c FROM users WHERE role = 'owner' AND is_active = 1"))?.c || 0
      );
      if (ownerCount <= 1) {
        throw new Error('Cannot change role of the last active Owner account.');
      }
    }

    if (input.passwordHash) {
      await tx.run('UPDATE users SET name = ?, email = ?, role = ?, branch_id = ?, password_hash = ? WHERE id = ?', [
        input.name.trim(),
        input.email.trim().toLowerCase(),
        input.role,
        input.branchId ?? null,
        input.passwordHash,
        id,
      ]);
    } else {
      await tx.run('UPDATE users SET name = ?, email = ?, role = ?, branch_id = ? WHERE id = ?', [
        input.name.trim(),
        input.email.trim().toLowerCase(),
        input.role,
        input.branchId ?? null,
        id,
      ]);
    }

    await writeAuditLog(
      tx,
      actor,
      'USER_UPDATED',
      'user',
      id,
      `Updated user ${input.name.trim()} (${input.role})`
    );
    return { id };
  });
}

export async function deleteUserRecord(
  db: DbClient,
  id: number,
  currentUserId: number,
  actor: ActorContext
): Promise<{ deletedId: number }> {
  return db.transaction(async (tx) => {
    if (id === currentUserId) {
      throw new Error('You cannot delete your currently signed-in account.');
    }
    const existing = await tx.get<{ id: number; name: string; email: string; role: string }>(
      'SELECT id, name, email, role FROM users WHERE id = ?',
      [id]
    );
    if (!existing) throw new Error('User not found.');

    if (existing.role === 'owner') {
      const ownerCount = Number(
        (await tx.get<{ c: number }>("SELECT COUNT(*) as c FROM users WHERE role = 'owner' AND is_active = 1"))?.c || 0
      );
      if (ownerCount <= 1) {
        throw new Error('Cannot delete the last active Owner account.');
      }
    }

    await tx.run('DELETE FROM users WHERE id = ?', [id]);
    await writeAuditLog(
      tx,
      actor,
      'USER_DELETED',
      'user',
      id,
      `Deleted team member ${existing.name} (${existing.email})`
    );
    return { deletedId: id };
  });
}

export interface OnboardWorkspaceInput {
  ownerName: string;
  ownerEmail: string;
  passwordHash: string;
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
  vatMode?: TaxMode;
  defaultLanguage?: 'bn' | 'en';
  branchNameBn?: string;
  branchNameEn?: string;
  branchCode?: string;
}

export async function onboardWorkspaceTransaction(
  db: DbClient,
  input: OnboardWorkspaceInput
): Promise<{
  userId: number;
  branchId: number;
  user: {
    id: number;
    name: string;
    email: string;
    role: 'owner';
    branchId: number;
  };
}> {
  const ownerName = String(input.ownerName || '').trim().slice(0, 120);
  const ownerEmail = String(input.ownerEmail || '').trim().toLowerCase().slice(0, 120);
  const passwordHash = String(input.passwordHash || '').trim();
  const rawNameBn = String(input.orgNameBn || '').trim().slice(0, 160);
  const rawNameEn = String(input.orgNameEn || '').trim().slice(0, 160);
  const orgNameBn = rawNameBn || rawNameEn;
  const orgNameEn = rawNameEn || rawNameBn;
  const proprietorName = String(input.proprietorName || ownerName).trim().slice(0, 120);
  const phone = String(input.phone || '').trim().slice(0, 80);
  const address = String(input.address || '').trim().slice(0, 260);
  const binNumber = String(input.binNumber || '').trim().slice(0, 60);
  const tinNumber = String(input.tinNumber || '').trim().slice(0, 60);
  const tagline = String(input.tagline || '').trim().slice(0, 160);
  const website = String(input.website || '').trim().slice(0, 120);
  const businessDescription = String(input.businessDescription || '').trim().slice(0, 320);
  const vatMode: TaxMode = input.vatMode === 'inclusive' ? 'inclusive' : 'exclusive';
  const defaultLanguage: 'bn' | 'en' = input.defaultLanguage === 'en' ? 'en' : 'bn';
  const branchNameBn = String(input.branchNameBn || 'প্রধান শাখা').trim().slice(0, 120) || 'প্রধান শাখা';
  const branchNameEn = String(input.branchNameEn || 'Main Branch').trim().slice(0, 120) || 'Main Branch';
  const branchCode =
    String(input.branchCode || 'MAIN')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '')
      .slice(0, 12) || 'MAIN';

  if (!ownerName) {
    throw new Error('ওনারের নাম আবশ্যক (Owner name is required).');
  }
  if (!ownerEmail || !ownerEmail.includes('@')) {
    throw new Error('সঠিক ইমেইল ঠিকানা আবশ্যক (Valid owner email is required).');
  }
  if (!passwordHash) {
    throw new Error('পাসওয়ার্ড আবশ্যক (Password is required).');
  }
  if (!orgNameBn && !orgNameEn) {
    throw new Error('প্রতিষ্ঠানের নাম আবশ্যক (Organization name is required).');
  }
  if (!phone) {
    throw new Error('মোবাইল নম্বর আবশ্যক (Business phone number is required).');
  }
  if (!address) {
    throw new Error('প্রতিষ্ঠানের ঠিকানা আবশ্যক (Business address is required).');
  }

  return db.transaction(async (tx) => {
    const orgRow = await tx.get<{ onboarding_completed?: number }>(
      'SELECT onboarding_completed FROM organizations WHERE id = 1'
    );
    const activeUsersCount = Number(
      (await tx.get<{ c: number }>('SELECT COUNT(*) as c FROM users WHERE is_active = 1'))?.c || 0
    );

    if (orgRow?.onboarding_completed === 1 && activeUsersCount > 0) {
      throw new Error('Onboarding has already been completed for this workspace.');
    }

    await tx.run('DELETE FROM sessions');
    await tx.run('DELETE FROM users');
    await tx.run('DELETE FROM branches');

    const branchInfo = await tx.run(
      `INSERT INTO branches (code, name, name_bn, address, phone, is_main, is_active)
       VALUES (?, ?, ?, ?, ?, 1, 1)`,
      [branchCode, branchNameEn, branchNameBn, address, phone]
    );
    const branchId = Number(branchInfo.lastInsertRowid);

    const userInfo = await tx.run(
      `INSERT INTO users (name, email, role, branch_id, password_hash, is_active)
       VALUES (?, ?, 'owner', ?, ?, 1)`,
      [ownerName, ownerEmail, branchId, passwordHash]
    );
    const userId = Number(userInfo.lastInsertRowid);

    await tx.run(
      `UPDATE organizations
       SET name = ?,
           name_bn = ?,
           proprietor_name = ?,
           phone = ?,
           email = ?,
           address = ?,
           bin_number = ?,
           tin_number = ?,
           tagline = ?,
           website = ?,
           business_description = ?,
           vat_mode = ?,
           default_language = ?,
           admin_password_hash = ?,
           onboarding_completed = 1,
           updated_at = datetime('now')
       WHERE id = 1`,
      [
        orgNameEn,
        orgNameBn,
        proprietorName,
        phone,
        ownerEmail,
        address,
        binNumber,
        tinNumber,
        tagline,
        website,
        businessDescription,
        vatMode,
        defaultLanguage,
        passwordHash,
      ]
    );

    await writeAuditLog(
      tx,
      { name: ownerName, role: 'owner' },
      'WORKSPACE_ONBOARDED',
      'organization',
      1,
      `Onboarded organization "${orgNameBn}" with main branch "${branchNameBn}" (${branchCode})`
    );

    return {
      userId,
      branchId,
      user: {
        id: userId,
        name: ownerName,
        email: ownerEmail,
        role: 'owner' as const,
        branchId,
      },
    };
  });
}

export async function resetToCleanWorkspace(db: DbClient, actor: ActorContext): Promise<void> {
  await db.transaction(async (tx) => {
    const tables = [
      'idempotency_keys',
      'documents',
      'payment_allocations',
      'payments',
      'invoice_items',
      'invoices',
      'purchase_items',
      'purchases',
      'expenses',
      'recurring_profiles',
      'stock_movements',
      'branch_stock',
      'journal_lines',
      'journal_entries',
      'products',
      'customers',
      'vendors',
      'audit_logs',
    ];
    for (const tbl of tables) {
      await tx.run(`DELETE FROM ${tbl}`);
    }
    await writeAuditLog(
      tx,
      actor,
      'WORKSPACE_RESET',
      'organization',
      1,
      'Cleared transactional records to start clean workspace'
    );
  });
}

export async function seedSampleBusinessData(db: DbClient, actor: ActorContext): Promise<void> {
  const existingInvCount = Number(
    (await db.get<{ c: number }>('SELECT COUNT(*) as c FROM invoices'))?.c || 0
  );
  if (existingInvCount > 0) return;

  await db.transaction(async (tx) => {
    await tx.run(
      `UPDATE organizations
       SET name = CASE WHEN name = '' THEN 'Dhaka Trade & Textiles Ltd.' ELSE name END,
           name_bn = CASE WHEN name_bn = '' THEN 'ঢাকা ট্রেড অ্যান্ড টেক্সটাইলস লিমিটেড' ELSE name_bn END,
           bin_number = CASE WHEN bin_number = '' THEN '001948271-0101' ELSE bin_number END,
           tin_number = CASE WHEN tin_number = '' THEN '548291038472' ELSE tin_number END,
           phone = CASE WHEN phone = '' THEN '+880 1711-004821' ELSE phone END,
           email = CASE WHEN email = '' THEN 'accounts@dhakatrade.com.bd' ELSE email END,
           address = CASE WHEN address = '' THEN 'House 42, Road 11, Gulshan-1, Dhaka 1212, Bangladesh' ELSE address END,
           onboarding_completed = 1
       WHERE id = 1`
    );

    const branchCount = Number((await tx.get<{ c: number }>('SELECT COUNT(*) as c FROM branches'))?.c || 0);
    if (branchCount === 0) {
      await tx.run(
        `INSERT INTO branches (code, name, name_bn, address, phone, is_main)
         VALUES ('DHK', 'Dhaka Gulshan Main', 'ঢাকা গুলশান প্রধান শাখা', 'Road 11, Gulshan-1, Dhaka 1212', '+880 1711-004821', 1)`
      );
      await tx.run(
        `INSERT INTO branches (code, name, name_bn, address, phone, is_main)
         VALUES ('CTG', 'Chattogram Agrabad', 'চট্টগ্রাম আগ্রাবাদ শাখা', 'Commercial Area, Agrabad, Chattogram 4100', '+880 1819-442190', 0)`
      );
    }

    const userCount = Number((await tx.get<{ c: number }>('SELECT COUNT(*) as c FROM users'))?.c || 0);
    if (userCount === 0) {
      await tx.run(
        `INSERT INTO users (name, email, role, branch_id) VALUES ('Rafiqul Islam (Owner)', 'owner@dhakatrade.com.bd', 'owner', 1)`
      );
      await tx.run(
        `INSERT INTO users (name, email, role, branch_id) VALUES ('Farhana Yasmin (Accountant)', 'accounts@dhakatrade.com.bd', 'accountant', 1)`
      );
      await tx.run(
        `INSERT INTO users (name, email, role, branch_id) VALUES ('Tanvir Ahmed (POS Cashier)', 'pos@dhakatrade.com.bd', 'cashier', 1)`
      );
      await tx.run(
        `INSERT INTO users (name, email, role, branch_id) VALUES ('Mahmudul Hasan (Auditor)', 'audit@dhakatrade.com.bd', 'auditor', NULL)`
      );
    }

    const jeCount = Number((await tx.get<{ c: number }>('SELECT COUNT(*) as c FROM journal_entries'))?.c || 0);
    if (jeCount === 0) {
      await postJournalEntry(tx, {
        entryDate: '2026-11-01',
        branchId: 1,
        sourceType: 'opening',
        sourceId: null,
        description: 'Opening Capital Injection (Cash & Prime Bank)',
        lines: [
          { accountCode: '1000', debit: 150000, credit: 0, memo: 'Opening Cash Drawer' },
          { accountCode: '1010', debit: 350000, credit: 0, memo: 'Opening Prime Bank Balance' },
          { accountCode: '3000', debit: 0, credit: 500000, memo: 'Owner Paid-up Capital' },
        ],
        actor,
      });
    }

    const customersData = [
      ['CUST-001', 'Kamrul Hasan', 'Padma Apparel Exports Ltd.', '+880 1712-338910', 'finance@padmaapparel.com.bd', '002847192-0102', 'Sector 7, Uttara, Dhaka 1230', 0, 500000],
      ['CUST-002', 'Nusrat Jahan', 'Bengal Craft Studio', '+880 1817-994120', 'accounts@bengalcraft.bd', '003910482-0201', 'Road 27, Dhanmondi, Dhaka 1209', 0, 250000],
      ['CUST-003', 'Sajjad Hossain', 'Karnaphuli Builders & Supply', '+880 1911-550291', 'billing@karnaphulibuild.com', '004192837-0501', 'CDA Avenue, Nasirabad, Chattogram', 0, 300000],
      ['CUST-004', 'Walk-in Counter Customer', 'Cash Counter Retail', '+880 1700-000000', '', '', 'Gulshan-1 Counter, Dhaka', 0, 0],
    ];
    for (const c of customersData) {
      await tx.run(
        `INSERT OR IGNORE INTO customers (code, name, company_name, phone, email, bin_number, address, opening_balance, credit_limit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        c
      );
    }

    const vendorsData = [
      ['VEND-001', 'Meghna Spinning Mills', 'Meghna Group Textiles', '+880 1715-882100', 'sales@meghnaspinning.com.bd', '001122334-0104', 'Narayanganj Industrial Zone'],
      ['VEND-002', 'Jamuna Industrial Hardware', 'Jamuna Hardware Corp.', '+880 1611-220491', 'orders@jamunahardware.bd', '005544332-0103', 'Nawabpur Road, Old Dhaka'],
    ];
    for (const v of vendorsData) {
      await tx.run(
        `INSERT OR IGNORE INTO vendors (code, name, company_name, phone, email, bin_number, address)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        v
      );
    }

    const productsData = [
      ['TEX-101', '890101001011', 'Bengal Loom', 'Combed Cotton Poplin (40m Roll)', 'কটন পপলিন কাপড় (৪০ মিটার রোল)', 'roll', 'Textiles', '5208.11', '100% combed cotton poplin weave, 44-inch width, 40m export-grade roll.', '/src/assets/images/product_cotton_poplin_1795659038539.jpg', 1, 6800, 4800, 1, 5],
      ['TEX-102', '890101001028', 'Bengal Loom', 'Raw Linen Fabric Bolt', 'লিনেন ফেব্রিক বোল্ট', 'bolt', 'Textiles', '5309.19', 'Unbleached natural oatmeal slub linen bolt suitable for apparel & home textiles.', '/src/assets/images/product_raw_linen_1795659040000.jpg', 1, 9500, 6900, 1, 4],
      ['HRD-201', '890201002015', 'YKK Industrial', 'Heavy-Duty Brass Zippers (Box 100)', 'ব্রাস জিপার (১০০ পিস বক্স)', 'box', 'Accessories', '9607.11', 'No. 5 antique brass auto-lock metal zippers, 100-piece factory pack.', '/src/assets/images/product_brass_zippers_1795659038682.jpg', 1, 2400, 1550, 2, 10],
      ['HRD-202', '890201002022', 'Coats Astra', 'Industrial Thread Cone Pack', 'ইন্ডাস্ট্রিয়াল সুতার কোন প্যাক', 'pack', 'Accessories', '5401.10', 'High-tensile 40/2 spun polyester industrial sewing thread cones (pack of 6).', '/src/assets/images/product_thread_cones_1795659039569.jpg', 1, 1450, 920, 3, 12],
      ['SRV-301', '890301003012', 'Dhaka Trade', 'Monthly B2B Supply Retainer', 'মাসিক বিটুবি সাপ্লাই রিটেইনার', 'month', 'Services', '9983.11', 'Dedicated monthly B2B procurement, quality inspection & priority logistics service.', '', 0, 18000, 0, 1, 0],
    ];
    for (const p of productsData) {
      await tx.run(
        `INSERT OR IGNORE INTO products (sku, barcode, brand, name, name_bn, unit, category, hs_code, description, image_url, is_active, track_inventory, sale_price, cost_price, tax_rule_id, reorder_level)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
        p
      );
    }
  });

  const customers = await db.all<{ id: number; code: string }>('SELECT id, code FROM customers');
  const vendors = await db.all<{ id: number; code: string }>('SELECT id, code FROM vendors');
  const products = await db.all<{ id: number; sku: string }>('SELECT id, sku FROM products');

  const cMap = Object.fromEntries(customers.map((c) => [c.code, Number(c.id)]));
  const vMap = Object.fromEntries(vendors.map((v) => [v.code, Number(v.id)]));
  const pMap = Object.fromEntries(products.map((p) => [p.sku, Number(p.id)]));

  await createPurchaseTransaction(
    db,
    {
      branchId: 1,
      vendorId: vMap['VEND-001'],
      purchaseDate: '2026-11-02',
      mushak61Ref: 'M61-2026-00104',
      payImmediately: true,
      paymentMethod: 'bank',
      notes: 'Initial November fabric restock — Gulshan Warehouse',
      items: [
        { productId: pMap['TEX-101'], quantity: 18, unitCost: 4800, vatRate: 15 },
        { productId: pMap['TEX-102'], quantity: 10, unitCost: 6900, vatRate: 15 },
      ],
    },
    actor
  );

  await createPurchaseTransaction(
    db,
    {
      branchId: 1,
      vendorId: vMap['VEND-002'],
      purchaseDate: '2026-11-04',
      mushak61Ref: 'M61-2026-00112',
      payImmediately: false,
      notes: 'Accessories procurement (Net 30)',
      items: [
        { productId: pMap['HRD-201'], quantity: 20, unitCost: 1550, vatRate: 7.5 },
        { productId: pMap['HRD-202'], quantity: 14, unitCost: 920, vatRate: 5 },
      ],
    },
    actor
  );

  await createPurchaseTransaction(
    db,
    {
      branchId: 2,
      vendorId: vMap['VEND-001'],
      purchaseDate: '2026-11-05',
      mushak61Ref: 'M61-CTG-00018',
      payImmediately: true,
      paymentMethod: 'bank',
      notes: 'Chattogram Agrabad branch opening stock',
      items: [
        { productId: pMap['TEX-101'], quantity: 8, unitCost: 4850, vatRate: 15 },
        { productId: pMap['HRD-201'], quantity: 6, unitCost: 1550, vatRate: 7.5 },
      ],
    },
    actor
  );

  const inv1 = await createInvoiceTransaction(
    db,
    {
      branchId: 1,
      customerId: cMap['CUST-001'],
      issueDate: '2026-11-08',
      dueDate: '2026-11-18',
      notes: 'Urgent export batch — Uttara factory delivery',
      items: [
        {
          productId: pMap['TEX-101'],
          description: 'Combed Cotton Poplin (40m Roll)',
          quantity: 6,
          unitPrice: 6800,
          taxRuleId: 1,
          taxRate: 15,
        },
        {
          productId: pMap['HRD-201'],
          description: 'Heavy-Duty Brass Zippers (Box 100)',
          quantity: 8,
          unitPrice: 2400,
          taxRuleId: 2,
          taxRate: 7.5,
        },
      ],
    },
    actor
  );

  const inv2 = await createInvoiceTransaction(
    db,
    {
      branchId: 1,
      customerId: cMap['CUST-002'],
      issueDate: '2026-11-12',
      dueDate: '2026-11-28',
      notes: 'Boutique winter line fabric supply',
      items: [
        {
          productId: pMap['TEX-102'],
          description: 'Raw Linen Fabric Bolt',
          quantity: 4,
          unitPrice: 9500,
          taxRuleId: 1,
          taxRate: 15,
        },
        {
          productId: pMap['HRD-202'],
          description: 'Industrial Thread Cone Pack',
          quantity: 5,
          unitPrice: 1450,
          taxRuleId: 3,
          taxRate: 5,
        },
      ],
    },
    actor
  );

  await createInvoiceTransaction(
    db,
    {
      branchId: 2,
      customerId: cMap['CUST-003'],
      issueDate: '2026-11-19',
      dueDate: '2026-12-05',
      notes: 'Chattogram Agrabad dispatch',
      items: [
        {
          productId: pMap['TEX-101'],
          description: 'Combed Cotton Poplin (40m Roll)',
          quantity: 3,
          unitPrice: 6800,
          taxRuleId: 1,
          taxRate: 15,
        },
      ],
    },
    actor
  );

  await createInvoiceTransaction(
    db,
    {
      branchId: 1,
      customerId: cMap['CUST-004'],
      issueDate: '2026-11-22',
      dueDate: '2026-11-22',
      source: 'pos',
      notes: 'Gulshan POS Counter Quick Sale',
      items: [
        {
          productId: pMap['HRD-202'],
          description: 'Industrial Thread Cone Pack',
          quantity: 4,
          unitPrice: 1450,
          taxRuleId: 3,
          taxRate: 5,
        },
      ],
      immediatePayment: {
        amount: 6090,
        method: 'bkash',
        gatewayProvider: 'bKash Merchant',
        gatewayReference: 'BKS9A821K4',
      },
    },
    actor
  );

  await recordPaymentTransaction(
    db,
    {
      customerId: cMap['CUST-001'],
      branchId: 1,
      paymentDate: '2026-11-14',
      amount: 35000,
      method: 'bank',
      gatewayProvider: 'BEFTN / Prime Bank',
      gatewayReference: 'PRB-20261114-882',
      invoiceId: inv1.id,
      notes: 'First installment via bank transfer',
    },
    actor
  );

  await recordPaymentTransaction(
    db,
    {
      customerId: cMap['CUST-002'],
      branchId: 1,
      paymentDate: '2026-11-16',
      amount: inv2.grandTotal,
      method: 'sslcommerz',
      gatewayProvider: 'SSLCommerz Checkout',
      gatewayReference: 'SSLCZ-TXN-774921',
      invoiceId: inv2.id,
      notes: 'Paid online via SSLCommerz invoice link',
    },
    actor
  );

  await createExpenseTransaction(
    db,
    {
      branchId: 1,
      expenseDate: '2026-11-05',
      category: 'Warehouse & Office Rent',
      accountCode: '5100',
      vendorName: 'Gulshan Commercial Estates',
      amount: 35000,
      vatAmount: 0,
      paymentMethod: 'bank',
      reference: 'RENT-NOV-2026',
      notes: 'November 2026 showroom & storage rent',
    },
    actor
  );

  await createExpenseTransaction(
    db,
    {
      branchId: 1,
      expenseDate: '2026-11-15',
      category: 'Utilities & Fiber Internet',
      accountCode: '5200',
      vendorName: 'DESCO & AmberIT',
      amount: 6500,
      vatAmount: 325,
      paymentMethod: 'nagad',
      reference: 'NGD-441029',
      notes: 'Monthly electricity & fiber broadband',
    },
    actor
  );

  const recItems: InvoiceLineInput[] = [
    {
      productId: pMap['SRV-301'],
      description: 'Monthly B2B Supply Retainer',
      quantity: 1,
      unitPrice: 18000,
      taxRuleId: 1,
      taxRate: 15,
    },
  ];
  const recTotals = computeInvoiceTotals(recItems, 'exclusive');
  await db.run(
    `INSERT INTO recurring_profiles (title, customer_id, branch_id, frequency, next_run_date, last_run_date, status, auto_send, items_json, estimated_total)
     VALUES (?, ?, ?, 'monthly', '2026-11-24', '2026-10-24', 'active', 1, ?, ?)`,
    ['Padma Apparel Monthly Retainer', cMap['CUST-001'], 1, JSON.stringify(recItems), recTotals.grandTotal]
  );
}

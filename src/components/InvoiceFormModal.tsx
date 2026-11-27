import { useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { computeInvoiceTotals } from '../engine/billing';
import { formatMoney, todayISO } from '../engine/format';
import type { Branch, Customer, Invoice, InvoiceLineInput, Language, Organization, Product, TaxRule } from '../engine/types';
import { apiRequest } from '../lib/api';
import { CustomerPickerCombobox } from './CustomerPickerCombobox';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (invoice: Invoice) => void;
  onRefresh?: () => Promise<void>;
  org: Organization;
  lang: Language;
  branches: Branch[];
  activeBranchId: number;
  customers: Customer[];
  products: Product[];
  taxRules: TaxRule[];
  editingInvoice?: Invoice | null;
  prefillCustomerId?: number | null;
}

export function InvoiceFormModal({
  open,
  onClose,
  onCreated,
  onRefresh,
  org,
  lang,
  branches,
  activeBranchId,
  customers,
  products,
  taxRules,
  editingInvoice,
  prefillCustomerId,
}: Props) {
  const isBn = lang === 'bn';
  const defaultTax = taxRules.find((r) => r.isDefault) || taxRules[0];

  const [addedCustomers, setAddedCustomers] = useState<Customer[]>([]);
  const [branchId, setBranchId] = useState<number>(
    editingInvoice?.branchId || activeBranchId || branches[0]?.id || 1
  );
  const [customerId, setCustomerId] = useState<number>(
    editingInvoice?.customerId || prefillCustomerId || customers[0]?.id || 0
  );

  const availableCustomers = useMemo(() => {
    const existingIds = new Set(customers.map((c) => c.id));
    const extras = addedCustomers.filter((c) => !existingIds.has(c.id));
    return [...extras, ...customers];
  }, [customers, addedCustomers]);
  const [issueDate, setIssueDate] = useState<string>(editingInvoice?.issueDate || todayISO());
  const [dueDate, setDueDate] = useState<string>(() => {
    if (editingInvoice?.dueDate) return editingInvoice.dueDate;
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [notes, setNotes] = useState(editingInvoice?.notes || '');
  const [lines, setLines] = useState<InvoiceLineInput[]>(() => {
    if (editingInvoice?.items && editingInvoice.items.length > 0) {
      return editingInvoice.items.map((item) => ({
        productId: item.productId ?? null,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount || 0,
        taxRuleId: item.taxRuleId ?? defaultTax?.id ?? null,
        taxRate: item.taxRate,
        sdRate: item.sdRate || 0,
      }));
    }
    return [
      {
        productId: products[0]?.id ?? null,
        description: products[0]?.name ?? '',
        quantity: 1,
        unitPrice: products[0]?.salePrice ?? 0,
        discountAmount: 0,
        taxRuleId: products[0]?.taxRuleId ?? defaultTax?.id ?? null,
        taxRate: products[0]?.taxRate ?? defaultTax?.rate ?? 15,
        sdRate: 0,
      },
    ];
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  const totals = useMemo(() => {
    try {
      const validLines = lines.filter((l) => l.description.trim() && l.quantity > 0);
      if (validLines.length === 0) return null;
      return computeInvoiceTotals(validLines, org.vatMode);
    } catch {
      return null;
    }
  }, [lines, org.vatMode]);

  if (!open) return null;

  const money = (v: number) => formatMoney(v, lang, org.currencySymbol);

  const handleProductPick = (idx: number, prodIdStr: string) => {
    const prodId = prodIdStr ? Number(prodIdStr) : null;
    const prod = products.find((p) => p.id === prodId);
    setLines((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        if (!prod) return { ...row, productId: null };
        const rule = taxRules.find((r) => r.id === prod.taxRuleId) || defaultTax;
        return {
          ...row,
          productId: prod.id,
          description: isBn && prod.nameBn ? prod.nameBn : prod.name,
          unitPrice: prod.salePrice,
          taxRuleId: rule?.id ?? null,
          taxRate: rule?.rate ?? 15,
          sdRate: rule?.sdRate ?? 0,
        };
      })
    );
  };

  const handleTaxPick = (idx: number, ruleIdStr: string) => {
    const ruleId = ruleIdStr ? Number(ruleIdStr) : null;
    const rule = taxRules.find((r) => r.id === ruleId);
    setLines((prev) =>
      prev.map((row, i) =>
        i === idx
          ? {
              ...row,
              taxRuleId: rule?.id ?? null,
              taxRate: rule?.rate ?? 0,
              sdRate: rule?.sdRate ?? 0,
            }
          : row
      )
    );
  };

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        productId: null,
        description: '',
        quantity: 1,
        unitPrice: 0,
        discountAmount: 0,
        taxRuleId: defaultTax?.id ?? null,
        taxRate: defaultTax?.rate ?? 15,
        sdRate: 0,
      },
    ]);
  };

  const removeLine = (idx: number) => {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!customerId) {
      setError(isBn ? 'অনুগ্রহ করে একজন কাস্টমার নির্বাচন করুন।' : 'Please select a customer.');
      return;
    }
    const cleanLines = lines.filter((l) => l.description.trim().length > 0);
    if (cleanLines.length === 0) {
      setError(isBn ? 'কমপক্ষে একটি পণ্য বা সেবার বিবরণ দিন।' : 'Add at least one line item with a description.');
      return;
    }
    setSubmitting(true);
    try {
      const saved = editingInvoice
        ? await apiRequest<Invoice>(`/api/invoices/${editingInvoice.id}`, {
            method: 'PUT',
            body: {
              branchId,
              customerId,
              issueDate,
              dueDate,
              notes,
              items: cleanLines,
            },
          })
        : await apiRequest<Invoice>('/api/invoices', {
            method: 'POST',
            idempotencyKey,
            body: {
              branchId,
              customerId,
              issueDate,
              dueDate,
              notes,
              items: cleanLines,
            },
          });
      onCreated(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save invoice.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/45 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={isBn ? 'নতুন ইনভয়েস তৈরি করুন' : 'Create New Invoice'}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-white w-full sm:max-w-4xl rounded-t-3xl sm:rounded-xl border border-slate-200 max-h-[94dvh] flex flex-col overflow-hidden"
      >
        <div className="sm:hidden pt-2.5 pb-0.5 flex justify-center">
          <div className="w-10 h-1.5 bg-slate-300 rounded-full" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-200">
          <div className="min-w-0 pr-2">
            <h2 className="text-base font-semibold text-slate-900 truncate">
              {editingInvoice
                ? isBn
                  ? `ইনভয়েস সম্পাদনা (${editingInvoice.invoiceNumber})`
                  : `Edit Invoice (${editingInvoice.invoiceNumber})`
                : isBn
                  ? 'নতুন ইনভয়েস ও মূসক ৬.৩ চালান'
                  : 'New Invoice & Mushak 6.3'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {editingInvoice
                ? isBn
                  ? 'পরিবর্তন সংরক্ষণ করলে পূর্বের জার্নাল রিভার্স হয়ে নতুন ডাবল-এন্ট্রি ও স্টক সমন্বয় হবে।'
                  : 'Saving automatically reverses the previous journal, adjusts stock, and posts a reconciled entry.'
                : isBn
                  ? 'সংরক্ষণের সাথে সাথে মূসক, কাস্টমারের পাওনা, স্টক এবং ডাবল-এন্ট্রি জার্নাল সমন্বয় হবে।'
                  : 'Automatically posts VAT, receivable, stock COGS, and balanced double-entry ledger.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close invoice form"
            className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:p-2 inline-flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl sm:rounded-lg transition-colors shrink-0"
          >
            <X className="w-5 h-5 sm:w-4 sm:h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div role="alert" className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="inv-customer" className="block text-xs font-medium text-slate-700 mb-1">
                {isBn ? 'কাস্টমার *' : 'Customer *'}
              </label>
              <CustomerPickerCombobox
                id="inv-customer"
                customers={availableCustomers}
                value={customerId}
                onChange={setCustomerId}
                onCustomerCreated={(created) => {
                  setAddedCustomers((prev) => [created, ...prev]);
                  if (onRefresh) {
                    onRefresh().catch(() => {});
                  }
                }}
                lang={lang}
                placeholder={isBn ? 'কাস্টমার খুঁজুন বা নতুন যোগ করুন...' : 'Search or add customer...'}
              />
            </div>

            <div>
              <label htmlFor="inv-branch" className="block text-xs font-medium text-slate-700 mb-1">
                {isBn ? 'শাখা' : 'Branch'}
              </label>
              <select
                id="inv-branch"
                value={branchId}
                onChange={(e) => setBranchId(Number(e.target.value))}
                className="w-full h-10 px-3 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]/25 focus:border-[#0F766E]"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {isBn ? b.nameBn : b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="inv-issue" className="block text-xs font-medium text-slate-700 mb-1">
                {isBn ? 'ইস্যু তারিখ' : 'Issue Date'}
              </label>
              <input
                id="inv-issue"
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                required
                className="w-full h-10 px-3 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]/25 focus:border-[#0F766E]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label htmlFor="inv-due" className="block text-xs font-medium text-slate-700 mb-1">
                {isBn ? 'পরিশোধের তারিখ' : 'Due Date'}
              </label>
              <input
                id="inv-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
                className="w-full h-10 px-3 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]/25 focus:border-[#0F766E]"
              />
            </div>
            <div className="sm:col-span-3">
              <label htmlFor="inv-notes" className="block text-xs font-medium text-slate-700 mb-1">
                {isBn ? 'নোট / ডেলিভারি বিবরণ' : 'Notes / Delivery Terms'}
              </label>
              <input
                id="inv-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={isBn ? 'যেমন: ৭ দিনের মধ্যে পরিশোধযোগ্য' : 'e.g. Net 14 days, Gulshan dispatch'}
                className="w-full h-10 px-3 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]/25 focus:border-[#0F766E]"
              />
            </div>
          </div>

          {/* Line Items */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">
                {isBn ? 'পণ্য ও সেবার তালিকা' : 'Line Items'}
              </span>
              <button
                type="button"
                onClick={addLine}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#0F766E] hover:text-[#115E59] whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                {isBn ? 'আইটেম যোগ করুন' : 'Add Line'}
              </button>
            </div>

            <div className="divide-y divide-slate-200">
              {lines.map((line, idx) => (
                <div key={idx} className="p-3 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] text-slate-500 mb-1">
                      {isBn ? 'পণ্য নির্বাচন' : 'Catalog Item'}
                    </label>
                    <select
                      aria-label={`Select product for line ${idx + 1}`}
                      value={line.productId ?? ''}
                      onChange={(e) => handleProductPick(idx, e.target.value)}
                      className="w-full h-9 px-2.5 text-xs bg-white border border-slate-300 rounded-md"
                    >
                      <option value="">{isBn ? 'কাস্টম আইটেম' : 'Custom line'}</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {isBn ? p.nameBn : p.name} ({p.stockQty ?? 0} {p.unit})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-[11px] text-slate-500 mb-1">
                      {isBn ? 'বিবরণ *' : 'Description *'}
                    </label>
                    <input
                      aria-label={`Line ${idx + 1} description`}
                      type="text"
                      value={line.description}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, description: e.target.value } : r))
                        )
                      }
                      required
                      placeholder={isBn ? 'বিবরণ লিখুন' : 'Item description'}
                      className="w-full h-9 px-2.5 text-xs bg-white border border-slate-300 rounded-md"
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:col-span-3 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">{isBn ? 'পরিমাণ' : 'Qty'}</label>
                      <input
                        aria-label={`Line ${idx + 1} quantity`}
                        type="number"
                        step="any"
                        min="0.01"
                        value={line.quantity}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, quantity: Number(e.target.value) } : r))
                          )
                        }
                        required
                        className="w-full h-9 px-2.5 text-xs font-mono text-right bg-white border border-slate-300 rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">{isBn ? 'দর' : 'Rate'}</label>
                      <input
                        aria-label={`Line ${idx + 1} unit price`}
                        type="number"
                        step="any"
                        min="0"
                        value={line.unitPrice}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, unitPrice: Number(e.target.value) } : r))
                          )
                        }
                        required
                        className="w-full h-9 px-2.5 text-xs font-mono text-right bg-white border border-slate-300 rounded-md"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-slate-500 mb-1">{isBn ? 'মূসক (VAT)' : 'VAT Rule'}</label>
                    <select
                      aria-label={`Line ${idx + 1} tax rule`}
                      value={line.taxRuleId ?? ''}
                      onChange={(e) => handleTaxPick(idx, e.target.value)}
                      className="w-full h-9 px-2 text-xs bg-white border border-slate-300 rounded-md"
                    >
                      {taxRules.map((tr) => (
                        <option key={tr.id} value={tr.id}>
                          {tr.code} ({tr.rate}%)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      disabled={lines.length <= 1}
                      aria-label={`Remove line ${idx + 1}`}
                      className="h-9 w-9 inline-flex items-center justify-center text-slate-400 hover:text-rose-600 disabled:opacity-30 rounded-md"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live Summary */}
          <div className="flex justify-end">
            <div className="w-full sm:w-80 border border-slate-200 rounded-lg p-4 space-y-2 text-sm bg-slate-50/70">
              <div className="flex justify-between text-slate-600">
                <span>{isBn ? 'করযোগ্য উপ-মোট' : 'Taxable Subtotal'}</span>
                <span className="font-mono tabular-nums">{money(totals?.subtotal ?? 0)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>{isBn ? 'মোট মূসক (Output VAT)' : 'Output VAT'}</span>
                <span className="font-mono tabular-nums">{money(totals?.vatTotal ?? 0)}</span>
              </div>
              <div className="flex justify-between font-semibold text-slate-900 pt-2 border-t border-slate-200 text-base">
                <span>{isBn ? 'সর্বমোট' : 'Grand Total'}</span>
                <span className="font-mono tabular-nums text-[#0F766E]">{money(totals?.grandTotal ?? 0)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="flex items-center justify-end gap-2.5 px-4 sm:px-5 py-3.5 pb-safe border-t border-slate-200 bg-white">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] sm:min-h-0 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-xl sm:rounded-lg transition-colors whitespace-nowrap"
          >
            {isBn ? 'বাতিল' : 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 sm:flex-none min-h-[44px] sm:min-h-0 px-5 py-2.5 text-sm font-semibold text-white bg-[#0F766E] hover:bg-[#115E59] active:scale-[0.98] disabled:opacity-50 rounded-xl sm:rounded-lg transition-all whitespace-nowrap"
          >
            {submitting
              ? isBn
                ? 'সংরক্ষণ হচ্ছে...'
                : 'Saving...'
              : editingInvoice
                ? isBn
                  ? 'পরিবর্তন সংরক্ষণ করুন'
                  : 'Save Invoice Changes'
                : isBn
                  ? 'ইনভয়েস পোস্ট করুন'
                  : 'Post Invoice & Mushak 6.3'}
          </button>
        </div>
      </form>
    </div>
  );
}

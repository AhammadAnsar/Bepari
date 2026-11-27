import { useMemo, useState } from 'react';
import { FileText, Minus, Plus, Search, Trash2, Truck } from 'lucide-react';
import { computeInvoiceTotals } from '../engine/billing';
import { formatMoney, todayISO } from '../engine/format';
import type { Customer, Invoice, Language, PaymentMethod, Product } from '../engine/types';
import { DICT } from '../i18n/translations';
import { apiRequest, type WorkspacePayload } from '../lib/api';
import { CustomerPickerCombobox } from './CustomerPickerCombobox';

interface Props {
  data: WorkspacePayload;
  lang: Language;
  activeBranchId: number;
  onCompleted: (invoice: Invoice) => void;
  onPreviewMemo?: (invoice: Invoice) => void;
  onPreviewChallan?: (invoice: Invoice) => void;
  onRefresh?: () => Promise<void>;
}

interface CartRow {
  product: Product;
  quantity: number;
}

export function PosCounterView({
  data,
  lang,
  activeBranchId,
  onCompleted,
  onPreviewMemo,
  onPreviewChallan,
  onRefresh,
}: Props) {
  const t = DICT[lang];
  const isBn = lang === 'bn';
  const money = (v: number) => formatMoney(v, lang, data.organization.currencySymbol);

  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartRow[]>([]);
  const [addedCustomers, setAddedCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState<number>(() => {
    const walkin = data.customers.find((c) => c.name.toLowerCase().includes('walk-in'));
    return walkin?.id ?? data.customers[0]?.id ?? 0;
  });
  const [poNumber, setPoNumber] = useState('');
  const [challanNumber, setChallanNumber] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCompletedInvoice, setLastCompletedInvoice] = useState<Invoice | null>(null);

  const availableCustomers = useMemo(() => {
    const existingIds = new Set(data.customers.map((c) => c.id));
    const extras = addedCustomers.filter((c) => !existingIds.has(c.id));
    return [...extras, ...data.customers];
  }, [data.customers, addedCustomers]);

  const products = data.products.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.nameBn.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.brand || '').toLowerCase().includes(q)
    );
  });

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === product.id);
      if (existing) {
        return prev.map((c) => (c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c));
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQty = (productId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.product.id === productId ? { ...c, quantity: c.quantity + delta } : c))
        .filter((c) => c.quantity > 0)
    );
  };

  const totals = useMemo(() => {
    if (cart.length === 0) return null;
    return computeInvoiceTotals(
      cart.map((c) => ({
        productId: c.product.id,
        description: isBn && c.product.nameBn ? c.product.nameBn : c.product.name,
        quantity: c.quantity,
        unitPrice: c.product.salePrice,
        taxRuleId: c.product.taxRuleId,
        taxRate: c.product.taxRate ?? 15,
      })),
      data.organization.vatMode
    );
  }, [cart, data.organization.vatMode, isBn]);

  const handleCheckout = async () => {
    setError(null);
    if (!customerId) {
      setError(isBn ? 'কাস্টমার নির্বাচন করুন।' : 'Select a customer before checkout.');
      return;
    }
    if (!totals || cart.length === 0) {
      setError(isBn ? 'কার্টে কমপক্ষে একটি পণ্য যোগ করুন।' : 'Add at least one item to the cart.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await apiRequest<Invoice>('/api/invoices', {
        method: 'POST',
        idempotencyKey: `pos-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        body: {
          branchId: activeBranchId || data.branches[0]?.id || 1,
          customerId,
          issueDate: todayISO(),
          dueDate: todayISO(),
          poNumber: poNumber.trim(),
          challanNumber: challanNumber.trim(),
          challanDate: todayISO(),
          source: 'pos',
          notes: `POS Counter Sale (${method.toUpperCase()})`,
          items: cart.map((c) => ({
            productId: c.product.id,
            description: isBn && c.product.nameBn ? c.product.nameBn : c.product.name,
            quantity: c.quantity,
            unitPrice: c.product.salePrice,
            taxRuleId: c.product.taxRuleId,
            taxRate: c.product.taxRate ?? 15,
          })),
          immediatePayment: {
            amount: totals.grandTotal,
            method,
            gatewayProvider: method === 'cash' ? 'POS Cash Drawer' : method.toUpperCase(),
            gatewayReference: `POS-${Date.now().toString().slice(-6)}`,
          },
        },
      });
      setCart([]);
      setPoNumber('');
      setChallanNumber('');
      setLastCompletedInvoice(created);
      onCompleted(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Left: Fast Product Picker */}
      <div className="lg:col-span-7 space-y-4">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isBn ? 'পণ্য, ব্র্যান্ড বা SKU কোড লিখে খুঁজুন...' : 'Search product by name, brand, or SKU...'}
            aria-label="Search POS catalog"
            className="w-full h-11 pl-10 pr-4 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#0F766E]"
          />
        </div>

        {products.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
            {isBn ? 'কোনো পণ্য পাওয়া যায়নি।' : 'No products available in catalog.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {products.map((p) => {
              const specs = [p.brand, p.size, p.color].filter(Boolean).join(' · ');
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addToCart(p)}
                  className="text-left p-4 bg-white border border-slate-200 hover:border-[#0F766E] active:scale-[0.98] rounded-2xl sm:rounded-xl transition-all flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-900 leading-snug">
                      {isBn && p.nameBn ? p.nameBn : p.name}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 font-mono">
                      {p.sku} · {isBn ? 'মূসক' : 'VAT'} {p.taxRate ?? 15}%
                    </div>
                    {specs && <div className="text-[11px] text-slate-500 mt-0.5">{specs}</div>}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="tabular-nums text-sm font-semibold text-[#0F766E]">
                      {money(p.salePrice)}
                    </span>
                    <span
                      className={`text-xs tabular-nums ${
                        p.trackInventory && (p.stockQty ?? 0) <= p.reorderLevel
                          ? 'text-amber-700 font-medium'
                          : 'text-slate-500'
                      }`}
                    >
                      {p.trackInventory ? `${p.stockQty ?? 0} ${p.unit}` : isBn ? 'সেবা' : 'Service'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Right: Live Cash Counter Cart */}
      <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden lg:sticky lg:top-20">
        <div className="px-4 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            {isBn ? 'ক্যাশ কাউন্টার কার্ট' : 'POS Cash Counter'}
          </h2>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={() => setCart([])}
              className="text-xs text-slate-500 hover:text-rose-700"
            >
              {isBn ? 'খালি করুন' : 'Clear'}
            </button>
          )}
        </div>

        <div className="p-4 space-y-4">
          {lastCompletedInvoice && (
            <div className="p-3 bg-teal-50/70 border border-teal-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#0F766E]">
                  {isBn
                    ? `সর্বশেষ মেমো: ${lastCompletedInvoice.invoiceNumber}`
                    : `Last Memo: ${lastCompletedInvoice.invoiceNumber}`}
                </span>
                <span className="font-mono text-[11px] text-slate-600">
                  {lastCompletedInvoice.challanNumber}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {onPreviewMemo && (
                  <button
                    type="button"
                    onClick={() => onPreviewMemo(lastCompletedInvoice)}
                    className="inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 text-xs font-medium text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#0F766E]" />
                    <span>{isBn ? 'ক্যাশ মেমো' : 'Cash Memo'}</span>
                  </button>
                )}
                {onPreviewChallan && (
                  <button
                    type="button"
                    onClick={() => onPreviewChallan(lastCompletedInvoice)}
                    className="inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#115E59] rounded-lg"
                  >
                    <Truck className="w-3.5 h-3.5" />
                    <span>{isBn ? 'ডেলিভারি চালান' : 'Delivery Challan'}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="p-2.5 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="pos-customer" className="block text-xs text-slate-600 mb-1">
              {t.labels.customer}
            </label>
            <CustomerPickerCombobox
              id="pos-customer"
              compact
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

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="pos-po" className="block text-[11px] text-slate-500 mb-1">
                {isBn ? 'P.O No (ঐচ্ছিক)' : 'P.O No (Optional)'}
              </label>
              <input
                id="pos-po"
                type="text"
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                placeholder="PO-..."
                className="w-full h-8 px-2.5 text-xs font-mono border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="pos-challan" className="block text-[11px] text-slate-500 mb-1">
                {isBn ? 'Challan No (ঐচ্ছিক)' : 'Challan No (Auto)'}
              </label>
              <input
                id="pos-challan"
                type="text"
                value={challanNumber}
                onChange={(e) => setChallanNumber(e.target.value)}
                placeholder={isBn ? 'স্বয়ংক্রিয়' : 'Auto-generated'}
                className="w-full h-8 px-2.5 text-xs font-mono border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          {cart.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
              {isBn ? 'বাম দিক থেকে পণ্য ক্লিক করে যোগ করুন' : 'Click any product on the left to add to counter'}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 lg:max-h-64 lg:overflow-y-auto">
              {cart.map((row) => (
                <div key={row.product.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-900 truncate">
                      {isBn && row.product.nameBn ? row.product.nameBn : row.product.name}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500">
                      {money(row.product.salePrice)} × {row.quantity}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      aria-label={`Decrease quantity of ${row.product.name}`}
                      onClick={() => updateQty(row.product.id, -1)}
                      className="w-9 h-9 sm:w-7 sm:h-7 inline-flex items-center justify-center border border-slate-200 rounded-lg sm:rounded-md hover:bg-slate-50 active:scale-95"
                    >
                      <Minus className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                    </button>
                    <span className="w-6 text-center text-xs font-mono tabular-nums">{row.quantity}</span>
                    <button
                      type="button"
                      aria-label={`Increase quantity of ${row.product.name}`}
                      onClick={() => updateQty(row.product.id, 1)}
                      className="w-9 h-9 sm:w-7 sm:h-7 inline-flex items-center justify-center border border-slate-200 rounded-lg sm:rounded-md hover:bg-slate-50 active:scale-95"
                    >
                      <Plus className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${row.product.name}`}
                      onClick={() => updateQty(row.product.id, -row.quantity)}
                      className="w-9 h-9 sm:w-7 sm:h-7 inline-flex items-center justify-center text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Payment Method Selector */}
          <div>
            <div className="text-xs text-slate-600 mb-1.5">{t.labels.method}</div>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { id: 'cash', label: isBn ? 'নগদ' : 'Cash' },
                  { id: 'bkash', label: isBn ? 'বিকাশ' : 'bKash' },
                  { id: 'nagad', label: isBn ? 'নগদ অ্যাপ' : 'Nagad' },
                  { id: 'card', label: isBn ? 'কার্ড' : 'Card' },
                ] as { id: PaymentMethod; label: string }[]
              ).map((pm) => (
                <button
                  key={pm.id}
                  type="button"
                  onClick={() => setMethod(pm.id)}
                  className={`py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                    method === pm.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {pm.label}
                </button>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="pt-3 border-t border-slate-200 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>{t.labels.subtotal}</span>
              <span className="font-mono tabular-nums">{money(totals?.subtotal ?? 0)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>{t.labels.vat}</span>
              <span className="font-mono tabular-nums">{money(totals?.vatTotal ?? 0)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold text-slate-900 pt-2 border-t border-slate-200">
              <span>{t.labels.total}</span>
              <span className="font-mono tabular-nums text-[#0F766E]">{money(totals?.grandTotal ?? 0)}</span>
            </div>
          </div>

          <button
            type="button"
            disabled={submitting || cart.length === 0}
            onClick={handleCheckout}
            className="w-full h-11 text-sm font-medium text-white bg-[#0F766E] hover:bg-[#115E59] disabled:opacity-45 rounded-xl transition-colors"
          >
            {submitting ? (isBn ? 'সম্পন্ন হচ্ছে...' : 'Processing...') : t.actions.checkout}
          </button>
        </div>
      </div>
    </div>
  );
}

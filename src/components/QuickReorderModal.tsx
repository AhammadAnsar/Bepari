import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ArrowRight, ShoppingBag, X } from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import { formatMoney, formatNumber, todayISO } from '../engine/format';
import type { Branch, Language, Organization, PaymentMethod, Product, Vendor } from '../engine/types';
import { DICT } from '../i18n/translations';
import { apiRequest } from '../lib/api';
import { computeRecommendedReorderQty } from '../lib/productDirectory';

interface Props {
  open: boolean;
  product: Product | null;
  org: Organization;
  lang: Language;
  branches: Branch[];
  vendors: Vendor[];
  activeBranchId: number;
  onClose: () => void;
  onCompleted: () => Promise<void>;
}

export function QuickReorderModal({
  open,
  product,
  org,
  lang,
  branches,
  vendors,
  activeBranchId,
  onClose,
  onCompleted,
}: Props) {
  const t = DICT[lang];
  const isBn = lang === 'bn';
  const { notify } = useFeedback();
  const money = (v: number) => formatMoney(v, lang, org.currencySymbol);
  const numClass = isBn ? 'tabular-nums tracking-tight' : 'font-mono tabular-nums';

  const [vendorId, setVendorId] = useState<number>(vendors[0]?.id || 0);
  const [branchId, setBranchId] = useState<number>(activeBranchId || branches[0]?.id || 1);
  const [quantity, setQuantity] = useState('10');
  const [unitCost, setUnitCost] = useState('0');
  const [vatRate, setVatRate] = useState('15');
  const [mushak61Ref, setMushak61Ref] = useState('');
  const [payImmediately, setPayImmediately] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bank');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !product) return;
    setError(null);
    setVendorId(vendors[0]?.id || 0);

    // Default to the branch with the lowest stock for this product
    let targetBranch = activeBranchId || branches[0]?.id || 1;
    if (product.branchStocks && product.branchStocks.length > 0) {
      const lowest = [...product.branchStocks].sort((a, b) => a.quantity - b.quantity)[0];
      if (lowest) targetBranch = lowest.branchId;
    }
    setBranchId(targetBranch);
    setQuantity(String(computeRecommendedReorderQty(product)));
    setUnitCost(String(product.costPrice));
    setVatRate(String(product.taxRate ?? 15));
    setMushak61Ref('');
    setPayImmediately(true);
    setPaymentMethod('bank');
    setNotes(isBn ? `রিঅর্ডার রেস্টক (${product.sku})` : `Reorder replenishment (${product.sku})`);
  }, [open, product, activeBranchId, branches, vendors, isBn]);

  if (!open || !product) return null;

  const parsedQty = Math.max(0, Number(quantity) || 0);
  const parsedCost = Math.max(0, Number(unitCost) || 0);
  const parsedVat = Math.max(0, Number(vatRate) || 0);
  const subtotal = Number((parsedQty * parsedCost).toFixed(2));
  const vatAmount = Number(((subtotal * parsedVat) / 100).toFixed(2));
  const grandTotal = Number((subtotal + vatAmount).toFixed(2));

  const currentTotalStock = Number(product.stockQty ?? 0);
  const projectedTotalStock = Number((currentTotalStock + parsedQty).toFixed(2));
  const displayName = isBn && product.nameBn ? product.nameBn : product.name;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!vendorId) {
      setError(
        isBn
          ? 'প্রথমে ক্রয় ও খরচ মডিউল থেকে অন্তত একজন সরবরাহকারী যুক্ত করুন।'
          : 'Please add a vendor in Purchases & Expenses first.'
      );
      return;
    }
    if (parsedQty <= 0) {
      setError(isBn ? 'অর্ডার পরিমাণ শূন্যের বেশি হতে হবে।' : 'Order quantity must be greater than zero.');
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest('/api/purchases', {
        method: 'POST',
        body: {
          branchId,
          vendorId,
          purchaseDate: todayISO(),
          mushak61Ref: mushak61Ref.trim(),
          payImmediately,
          paymentMethod,
          notes: notes.trim(),
          items: [
            {
              productId: product.id,
              quantity: parsedQty,
              unitCost: parsedCost,
              vatRate: parsedVat,
            },
          ],
        },
      });
      await onCompleted();
      notify({
        title: isBn ? 'স্টক রিঅর্ডার সম্পন্ন হয়েছে।' : 'Restock purchase order recorded.',
        description: `${displayName} · +${formatNumber(parsedQty, lang)} ${product.unit}`,
        variant: 'success',
        sound: 'save',
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to place restock order.';
      setError(msg);
      notify({ title: msg, variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isBn ? 'দ্রুত স্টক অর্ডার' : 'Quick Reorder Stock'}
        className="bg-white w-full sm:max-w-lg max-h-[92vh] rounded-t-3xl sm:rounded-2xl border-t sm:border border-slate-200 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0">
          <div className="w-10 h-1.5 bg-slate-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-[#0F766E] shrink-0" />
              <span>{isBn ? 'পুনঃস্টক অর্ডার (মূসক ৬.১)' : 'Order Restock (Mushak 6.1)'}</span>
            </h2>
            <p className="text-xs text-slate-500 truncate mt-0.5">
              {displayName} · <span className="font-mono">{product.sku}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close reorder modal"
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {error && (
            <div role="alert" className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
              {error}
            </div>
          )}

          {/* Reorder Status Strip */}
          <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-amber-900 font-medium truncate">
                {isBn
                  ? `বর্তমান মজুদ ${formatNumber(currentTotalStock, lang)} ${product.unit} (রিঅর্ডার সীমা: ${formatNumber(product.reorderLevel, lang)})`
                  : `Current stock ${formatNumber(currentTotalStock, lang)} ${product.unit} (Reorder point: ${formatNumber(product.reorderLevel, lang)})`}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="ro-vendor" className="block text-xs font-medium text-slate-700 mb-1">
                {t.labels.vendor} *
              </label>
              <select
                id="ro-vendor"
                required
                value={vendorId}
                onChange={(e) => setVendorId(Number(e.target.value))}
                className="w-full h-10 sm:h-9 px-3 text-sm bg-white border border-slate-300 rounded-xl sm:rounded-lg"
              >
                {vendors.length === 0 && (
                  <option value={0}>{isBn ? 'কোনো সরবরাহকারী নেই' : 'No vendors available'}</option>
                )}
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} {v.companyName ? `(${v.companyName})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ro-branch" className="block text-xs font-medium text-slate-700 mb-1">
                {isBn ? 'গ্রহীতা শাখা / গুদাম' : 'Receiving Branch'}
              </label>
              <select
                id="ro-branch"
                value={branchId}
                onChange={(e) => setBranchId(Number(e.target.value))}
                className="w-full h-10 sm:h-9 px-3 text-sm bg-white border border-slate-300 rounded-xl sm:rounded-lg"
              >
                {branches.map((b) => {
                  const bs = product.branchStocks?.find((x) => x.branchId === b.id);
                  return (
                    <option key={b.id} value={b.id}>
                      {isBn ? b.nameBn : b.name} ({formatNumber(bs?.quantity ?? 0, lang)} {product.unit})
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="ro-qty" className="block text-xs font-medium text-slate-700 mb-1">
                {isBn ? `অর্ডার (${product.unit})` : `Order Qty (${product.unit})`}
              </label>
              <input
                id="ro-qty"
                type="number"
                required
                min="1"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full h-10 sm:h-9 px-3 text-sm font-mono border border-slate-300 rounded-xl sm:rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="ro-cost" className="block text-xs font-medium text-slate-700 mb-1">
                {isBn ? 'একক ক্রয় দর' : 'Unit Cost'}
              </label>
              <input
                id="ro-cost"
                type="number"
                required
                min="0"
                step="any"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                className="w-full h-10 sm:h-9 px-3 text-sm font-mono border border-slate-300 rounded-xl sm:rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="ro-vat" className="block text-xs font-medium text-slate-700 mb-1">
                {isBn ? 'ইনপুট মূসক %' : 'Input VAT %'}
              </label>
              <input
                id="ro-vat"
                type="number"
                min="0"
                step="any"
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
                className="w-full h-10 sm:h-9 px-3 text-sm font-mono border border-slate-300 rounded-xl sm:rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="ro-m61" className="block text-xs font-medium text-slate-700 mb-1">
                {isBn ? 'মূসক ৬.১ চালান নং (ঐচ্ছিক)' : 'Mushak 6.1 Ref (optional)'}
              </label>
              <input
                id="ro-m61"
                type="text"
                value={mushak61Ref}
                onChange={(e) => setMushak61Ref(e.target.value)}
                placeholder="AUTO"
                className="w-full h-10 sm:h-9 px-3 text-sm font-mono border border-slate-300 rounded-xl sm:rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="ro-method" className="block text-xs font-medium text-slate-700 mb-1">
                {isBn ? 'পরিশোধ মাধ্যম' : 'Payment Method'}
              </label>
              <select
                id="ro-method"
                disabled={!payImmediately}
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full h-10 sm:h-9 px-3 text-sm bg-white border border-slate-300 rounded-xl sm:rounded-lg disabled:bg-slate-100 disabled:text-slate-400"
              >
                <option value="bank">{isBn ? 'ব্যাংক' : 'Bank Transfer'}</option>
                <option value="cash">{isBn ? 'নগদ' : 'Cash'}</option>
                <option value="bkash">{isBn ? 'বিকাশ' : 'bKash'}</option>
              </select>
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={payImmediately}
              onChange={(e) => setPayImmediately(e.target.checked)}
              className="rounded border-slate-300 text-[#0F766E]"
            />
            {isBn ? 'তাৎক্ষণিক পরিশোধ করুন (নতুবা সরবরাহকারীর পাওনায় যুক্ত হবে)' : 'Pay immediately (otherwise record as Vendor Payable)'}
          </label>

          {/* Live Order & Stock Summary */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">{isBn ? 'অর্ডার পরবর্তী মোট মজুদ' : 'Projected Stock After Order'}</span>
              <span className={`font-semibold flex items-center gap-1.5 ${numClass}`}>
                <span className="text-slate-600">{formatNumber(currentTotalStock, lang)}</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                <span className={projectedTotalStock > product.reorderLevel ? 'text-emerald-700' : 'text-amber-700'}>
                  {formatNumber(projectedTotalStock, lang)} {product.unit}
                </span>
              </span>
            </div>
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
              <span className="text-slate-600">
                {isBn ? 'মোট ক্রয়মূল্য (মূসকসহ)' : 'Total Purchase (incl. Input VAT)'}
              </span>
              <span className={`text-sm font-bold text-slate-900 ${numClass}`}>{money(grandTotal)}</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1 pb-safe">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-xl sm:rounded-lg"
            >
              {t.actions.cancel}
            </button>
            <button
              type="submit"
              disabled={submitting || vendors.length === 0}
              className="min-h-[40px] px-5 py-2 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#115E59] disabled:opacity-60 rounded-xl sm:rounded-lg whitespace-nowrap"
            >
              {submitting
                ? isBn
                  ? 'অর্ডার সংরক্ষণ হচ্ছে...'
                  : 'Placing Order...'
                : isBn
                  ? 'অর্ডার নিশ্চিত করুন'
                  : 'Confirm Restock Order'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

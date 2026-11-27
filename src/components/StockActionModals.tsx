import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, X } from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import { formatMoney, formatNumber } from '../engine/format';
import type { Branch, Language, Organization, Product } from '../engine/types';
import { DICT } from '../i18n/translations';
import { adjustProductStockApi, transferProductStockApi } from '../lib/api';

interface AdjustProps {
  open: boolean;
  product: Product | null;
  initialBranchId?: number;
  org: Organization;
  lang: Language;
  branches: Branch[];
  onClose: () => void;
  onCompleted: () => Promise<void>;
}

const ADJUST_REASONS = [
  { bn: 'ভৌত স্টক গণনা সমন্বয়', en: 'Physical inventory count' },
  { bn: 'ক্ষতিগ্রস্ত / নষ্ট পণ্য বাদ', en: 'Damaged or expired stock' },
  { bn: 'সাপ্লায়ার বোনাস / ফ্রি স্যাম্পল', en: 'Supplier bonus / sample received' },
  { bn: 'আভ্যন্তরীণ ব্যবহার', en: 'Internal workshop consumption' },
];

export function StockAdjustModal({
  open,
  product,
  initialBranchId,
  org,
  lang,
  branches,
  onClose,
  onCompleted,
}: AdjustProps) {
  const t = DICT[lang];
  const isBn = lang === 'bn';
  const { notify } = useFeedback();
  const money = (v: number) => formatMoney(v, lang, org.currencySymbol);

  const [branchId, setBranchId] = useState<number>(initialBranchId || branches[0]?.id || 1);
  const [mode, setMode] = useState<'add' | 'reduce' | 'set'>('add');
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !product) return;
    setError(null);
    setBranchId(initialBranchId || branches[0]?.id || 1);
    setMode('add');
    setQuantity('1');
    setUnitCost(String(product.costPrice));
    setReason(isBn ? ADJUST_REASONS[0].bn : ADJUST_REASONS[0].en);
  }, [open, product, initialBranchId, branches, isBn]);

  if (!open || !product) return null;

  const branchStock = product.branchStocks?.find((bs) => bs.branchId === branchId);
  const currentQty = branchStock?.quantity ?? 0;
  const parsedQty = Number(quantity) || 0;
  const nextQty =
    mode === 'add'
      ? currentQty + parsedQty
      : mode === 'reduce'
        ? currentQty - parsedQty
        : parsedQty;
  const delta = Number((nextQty - currentQty).toFixed(4));
  const effCost = Number(unitCost) || branchStock?.avgCost || product.costPrice;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (nextQty < 0) {
      setError(isBn ? 'স্টক শূন্যের নিচে নামানো যাবে না।' : 'Resulting stock cannot be negative.');
      return;
    }
    if (Math.abs(delta) < 0.0001) {
      setError(isBn ? 'স্টকের কোনো পরিবর্তন হয়নি।' : 'No stock quantity change detected.');
      return;
    }
    setSubmitting(true);
    try {
      await adjustProductStockApi(product.id, {
        branchId,
        mode,
        quantity: parsedQty,
        unitCost: effCost,
        reason: reason.trim() || 'Stock count adjustment',
      });
      await onCompleted();
      notify({
        title: isBn ? 'স্টক অ্যাডজাস্টমেন্ট সম্পন্ন হয়েছে।' : 'Stock adjustment saved.',
        description: isBn && product.nameBn ? product.nameBn : product.name,
        variant: 'success',
        sound: 'save',
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Stock adjustment failed.';
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
        aria-label={isBn ? 'স্টক অ্যাডজাস্টমেন্ট' : 'Stock Adjustment'}
        className="bg-white w-full sm:max-w-lg max-h-[92vh] rounded-t-3xl sm:rounded-2xl border-t sm:border border-slate-200 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0">
          <div className="w-10 h-1.5 bg-slate-300 rounded-full" />
        </div>

        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">
              {isBn ? 'স্টক অ্যাডজাস্টমেন্ট' : 'Adjust Branch Stock'}
            </h2>
            <p className="text-xs text-slate-500 truncate mt-0.5">
              {isBn && product.nameBn ? product.nameBn : product.name} · <span className="font-mono">{product.sku}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close stock adjustment"
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
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

          <div>
            <label htmlFor="adj-branch" className="block text-xs font-medium text-slate-700 mb-1">
              {isBn ? 'শাখা / গুদাম' : 'Branch / Warehouse'}
            </label>
            <select
              id="adj-branch"
              value={branchId}
              onChange={(e) => setBranchId(Number(e.target.value))}
              className="w-full h-10 sm:h-9 px-3 text-sm bg-white border border-slate-300 rounded-xl sm:rounded-lg"
            >
              {branches.map((b) => {
                const bs = product.branchStocks?.find((x) => x.branchId === b.id);
                return (
                  <option key={b.id} value={b.id}>
                    {isBn ? b.nameBn : b.name} — {formatNumber(bs?.quantity ?? 0, lang)} {product.unit}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Mode Toggle */}
          <div>
            <div className="text-xs font-medium text-slate-700 mb-1.5">
              {isBn ? 'সমন্বয়ের ধরন' : 'Adjustment Mode'}
            </div>
            <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-xl sm:rounded-lg">
              {(
                [
                  { id: 'add', label: isBn ? 'যোগ (+)' : 'Add (+)' },
                  { id: 'reduce', label: isBn ? 'কমানো (−)' : 'Reduce (−)' },
                  { id: 'set', label: isBn ? 'সঠিক সংখ্যা (=)' : 'Set Exact (=)' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={`py-2 text-xs font-semibold rounded-lg sm:rounded-md transition-colors ${
                    mode === m.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="adj-qty" className="block text-xs font-medium text-slate-700 mb-1">
                {mode === 'set'
                  ? isBn
                    ? `নতুন মোট পরিমাণ (${product.unit})`
                    : `New On-Hand (${product.unit})`
                  : isBn
                    ? `পরিমাণ (${product.unit})`
                    : `Quantity (${product.unit})`}
              </label>
              <input
                id="adj-qty"
                type="number"
                required
                min={mode === 'set' ? '0' : '0.01'}
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full h-10 sm:h-9 px-3 text-sm font-mono border border-slate-300 rounded-xl sm:rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="adj-cost" className="block text-xs font-medium text-slate-700 mb-1">
                {isBn ? 'একক খরচ (মূল্যায়ন)' : 'Unit Cost (Valuation)'}
              </label>
              <input
                id="adj-cost"
                type="number"
                min="0"
                step="any"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                className="w-full h-10 sm:h-9 px-3 text-sm font-mono border border-slate-300 rounded-xl sm:rounded-lg"
              />
            </div>
          </div>

          <div>
            <label htmlFor="adj-reason" className="block text-xs font-medium text-slate-700 mb-1">
              {isBn ? 'সমন্বয়ের কারণ ও নোট' : 'Reason & Audit Note'}
            </label>
            <input
              id="adj-reason"
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full h-10 sm:h-9 px-3 text-sm border border-slate-300 rounded-xl sm:rounded-lg"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {ADJUST_REASONS.map((r) => {
                const label = isBn ? r.bn : r.en;
                return (
                  <button
                    key={r.en}
                    type="button"
                    onClick={() => setReason(label)}
                    className="px-2 py-1 text-[11px] text-slate-600 bg-slate-100 hover:bg-slate-200/80 rounded-md"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Impact Preview */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs tabular-nums">
            <div>
              <div className="text-slate-500">{isBn ? 'স্টক পরিবর্তন' : 'Stock Change'}</div>
              <div className="font-semibold text-slate-900 mt-0.5 flex items-center gap-1.5">
                <span>{formatNumber(currentQty, lang)}</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                <span className={nextQty < 0 ? 'text-rose-700' : 'text-[#0F766E]'}>
                  {formatNumber(nextQty, lang)} {product.unit}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-slate-500">{isBn ? 'লেজার সমন্বয়' : 'Ledger Impact'}</div>
              <div className={`font-semibold mt-0.5 ${delta >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {delta >= 0 ? '+' : '−'}
                {money(Math.abs(delta * effCost))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 pb-safe">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-xl sm:rounded-lg"
            >
              {t.actions.cancel}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[40px] px-5 py-2 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#115E59] disabled:opacity-60 rounded-xl sm:rounded-lg"
            >
              {submitting ? (isBn ? 'হালনাগাদ হচ্ছে...' : 'Updating...') : isBn ? 'স্টক হালনাগাদ করুন' : 'Confirm Adjustment'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

interface TransferProps {
  open: boolean;
  initialProductId?: number;
  products: Product[];
  branches: Branch[];
  lang: Language;
  onClose: () => void;
  onCompleted: () => Promise<void>;
}

export function StockTransferModal({
  open,
  initialProductId,
  products,
  branches,
  lang,
  onClose,
  onCompleted,
}: TransferProps) {
  const t = DICT[lang];
  const isBn = lang === 'bn';
  const { notify } = useFeedback();
  const trackedProducts = products.filter((p) => p.trackInventory);

  const [productId, setProductId] = useState<number>(initialProductId || trackedProducts[0]?.id || 0);
  const [fromBranchId, setFromBranchId] = useState<number>(branches[0]?.id || 1);
  const [toBranchId, setToBranchId] = useState<number>(branches[1]?.id || branches[0]?.id || 1);
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const chosenId = initialProductId || trackedProducts[0]?.id || 0;
    setProductId(chosenId);
    const chosen = trackedProducts.find((p) => p.id === chosenId);
    // Pick the branch with the highest stock as default source
    const sortedBranches = [...branches].sort((a, b) => {
      const qa = chosen?.branchStocks?.find((bs) => bs.branchId === a.id)?.quantity ?? 0;
      const qb = chosen?.branchStocks?.find((bs) => bs.branchId === b.id)?.quantity ?? 0;
      return qb - qa;
    });
    const src = sortedBranches[0]?.id || branches[0]?.id || 1;
    const dst = branches.find((b) => b.id !== src)?.id || src;
    setFromBranchId(src);
    setToBranchId(dst);
    setQuantity('1');
    setNotes('');
  }, [open, initialProductId, branches]);

  if (!open) return null;

  const selectedProduct = trackedProducts.find((p) => p.id === productId);
  const srcQty = selectedProduct?.branchStocks?.find((bs) => bs.branchId === fromBranchId)?.quantity ?? 0;
  const dstQty = selectedProduct?.branchStocks?.find((bs) => bs.branchId === toBranchId)?.quantity ?? 0;
  const parsedQty = Number(quantity) || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!selectedProduct) {
      setError(isBn ? 'একটি পণ্য নির্বাচন করুন।' : 'Please select a product.');
      return;
    }
    if (fromBranchId === toBranchId) {
      setError(isBn ? 'উৎস ও গন্তব্য শাখা ভিন্ন হতে হবে।' : 'Source and destination branches must differ.');
      return;
    }
    if (parsedQty <= 0 || parsedQty > srcQty) {
      setError(
        isBn
          ? `পর্যাপ্ত স্টক নেই (উৎস শাখায় মজুদ: ${formatNumber(srcQty, lang)} ${selectedProduct.unit})।`
          : `Insufficient stock at source branch (available: ${srcQty} ${selectedProduct.unit}).`
      );
      return;
    }
    setSubmitting(true);
    try {
      await transferProductStockApi({
        productId: selectedProduct.id,
        fromBranchId,
        toBranchId,
        quantity: parsedQty,
        notes: notes.trim(),
      });
      await onCompleted();
      notify({
        title: isBn ? 'শাখাভিত্তিক স্টক ট্রান্সফার সম্পন্ন হয়েছে।' : 'Branch stock transfer completed.',
        description: isBn && selectedProduct.nameBn ? selectedProduct.nameBn : selectedProduct.name,
        variant: 'success',
        sound: 'save',
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Stock transfer failed.';
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
        aria-label={isBn ? 'শাখাভিত্তিক স্টক ট্রান্সফার' : 'Branch Stock Transfer'}
        className="bg-white w-full sm:max-w-lg max-h-[92vh] rounded-t-3xl sm:rounded-2xl border-t sm:border border-slate-200 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0">
          <div className="w-10 h-1.5 bg-slate-300 rounded-full" />
        </div>

        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {isBn ? 'শাখাভিত্তিক স্টক ট্রান্সফার' : 'Branch-to-Branch Stock Transfer'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isBn ? 'এক শাখা/গুদাম থেকে অন্য শাখায় নিরাপদ মজুদ স্থানান্তর' : 'Atomically move inventory between warehouses while preserving unit cost'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close stock transfer"
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
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

          {branches.length < 2 ? (
            <div className="p-4 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl">
              {isBn
                ? 'স্টক ট্রান্সফারের জন্য কমপক্ষে ২টি শাখা প্রয়োজন। সেটিংস থেকে নতুন শাখা যুক্ত করুন।'
                : 'At least 2 branches are required for stock transfers. Add another branch in Settings.'}
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="trf-product" className="block text-xs font-medium text-slate-700 mb-1">
                  {isBn ? 'পণ্য নির্বাচন করুন' : 'Select Product'}
                </label>
                <select
                  id="trf-product"
                  value={productId}
                  onChange={(e) => setProductId(Number(e.target.value))}
                  className="w-full h-10 sm:h-9 px-3 text-sm bg-white border border-slate-300 rounded-xl sm:rounded-lg"
                >
                  {trackedProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {isBn && p.nameBn ? p.nameBn : p.name} ({p.sku})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="trf-from" className="block text-xs font-medium text-slate-700 mb-1">
                    {isBn ? 'উৎস শাখা (From)' : 'From Branch'}
                  </label>
                  <select
                    id="trf-from"
                    value={fromBranchId}
                    onChange={(e) => setFromBranchId(Number(e.target.value))}
                    className="w-full h-10 sm:h-9 px-3 text-sm bg-white border border-slate-300 rounded-xl sm:rounded-lg"
                  >
                    {branches.map((b) => {
                      const qty = selectedProduct?.branchStocks?.find((bs) => bs.branchId === b.id)?.quantity ?? 0;
                      return (
                        <option key={b.id} value={b.id}>
                          {isBn ? b.nameBn : b.name} ({formatNumber(qty, lang)})
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label htmlFor="trf-to" className="block text-xs font-medium text-slate-700 mb-1">
                    {isBn ? 'গন্তব্য শাখা (To)' : 'To Branch'}
                  </label>
                  <select
                    id="trf-to"
                    value={toBranchId}
                    onChange={(e) => setToBranchId(Number(e.target.value))}
                    className="w-full h-10 sm:h-9 px-3 text-sm bg-white border border-slate-300 rounded-xl sm:rounded-lg"
                  >
                    {branches.map((b) => {
                      const qty = selectedProduct?.branchStocks?.find((bs) => bs.branchId === b.id)?.quantity ?? 0;
                      return (
                        <option key={b.id} value={b.id}>
                          {isBn ? b.nameBn : b.name} ({formatNumber(qty, lang)})
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="trf-qty" className="block text-xs font-medium text-slate-700 mb-1">
                    {isBn ? `ট্রান্সফার পরিমাণ (${selectedProduct?.unit || 'pcs'})` : `Transfer Qty (${selectedProduct?.unit || 'pcs'})`}
                  </label>
                  <input
                    id="trf-qty"
                    type="number"
                    required
                    min="0.01"
                    max={Math.max(0, srcQty)}
                    step="any"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full h-10 sm:h-9 px-3 text-sm font-mono border border-slate-300 rounded-xl sm:rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="trf-notes" className="block text-xs font-medium text-slate-700 mb-1">
                    {isBn ? 'চালান / নোট' : 'Challan / Transfer Note'}
                  </label>
                  <input
                    id="trf-notes"
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={isBn ? 'যেমন: শোরুম চাহিদা পূরণ' : 'e.g. Showroom replenishment'}
                    className="w-full h-10 sm:h-9 px-3 text-sm border border-slate-300 rounded-xl sm:rounded-lg"
                  />
                </div>
              </div>

              {/* Live Branch Impact */}
              {selectedProduct && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 gap-3 text-xs tabular-nums">
                  <div>
                    <div className="text-slate-500">{isBn ? 'উৎস শাখার নতুন মজুদ' : 'Source After Transfer'}</div>
                    <div className={`font-semibold mt-0.5 ${srcQty - parsedQty < 0 ? 'text-rose-700' : 'text-slate-900'}`}>
                      {formatNumber(srcQty, lang)} → {formatNumber(srcQty - parsedQty, lang)} {selectedProduct.unit}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-slate-500">{isBn ? 'গন্তব্য শাখার নতুন মজুদ' : 'Destination After Transfer'}</div>
                    <div className="font-semibold text-[#0F766E] mt-0.5">
                      {formatNumber(dstQty, lang)} → {formatNumber(dstQty + parsedQty, lang)} {selectedProduct.unit}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 pb-safe">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[40px] px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-xl sm:rounded-lg"
                >
                  {t.actions.cancel}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[40px] px-5 py-2 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#115E59] disabled:opacity-60 rounded-xl sm:rounded-lg"
                >
                  {submitting ? (isBn ? 'স্থানান্তর হচ্ছে...' : 'Transferring...') : isBn ? 'ট্রান্সফার নিশ্চিত করুন' : 'Confirm Transfer'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>,
    document.body
  );
}

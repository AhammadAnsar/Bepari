import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowLeftRight,
  Barcode,
  Edit3,
  Package,
  ShoppingBag,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { formatDate, formatMoney, formatNumber } from '../engine/format';
import type { Language, Organization, Product, StockMovementRecord } from '../engine/types';
import { fetchProductMovements } from '../lib/api';
import { encodeCode128B } from '../lib/barcode';
import { downloadPdfDocument } from '../lib/pdfExport';
import { computeProductMargin, getProductStockStatus, isBelowReorderPoint } from '../lib/productDirectory';

interface Props {
  product: Product | null;
  org: Organization;
  lang: Language;
  onClose: () => void;
  onEdit: (product: Product) => void;
  onAdjustStock: (product: Product, branchId?: number) => void;
  onTransferStock: (product: Product) => void;
  onOrderNow: (product: Product) => void;
  onDelete: (product: Product) => void;
}

function InlineCode128Barcode({ value }: { value: string }) {
  const encoded = useMemo(() => encodeCode128B(value), [value]);
  const moduleWidth = 1.5;
  const height = 42;
  const quietZone = 8;
  const totalWidth = Math.ceil(encoded.totalModules * moduleWidth + quietZone * 2);

  const runs: { x: number; w: number }[] = [];
  let i = 0;
  while (i < encoded.bars.length) {
    if (!encoded.bars[i]) {
      i++;
      continue;
    }
    const start = i;
    while (i < encoded.bars.length && encoded.bars[i]) i++;
    runs.push({ x: quietZone + start * moduleWidth, w: (i - start) * moduleWidth });
  }

  return (
    <svg
      viewBox={`0 0 ${totalWidth} ${height + 18}`}
      className="w-full max-w-[240px] h-auto block mx-auto"
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Barcode ${encoded.value}`}
    >
      {runs.map((r, idx) => (
        <rect key={idx} x={r.x} y={2} width={r.w} height={height} fill="#0F172A" />
      ))}
      <text
        x={totalWidth / 2}
        y={height + 14}
        textAnchor="middle"
        fontSize="10.5"
        fill="#334155"
        style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', letterSpacing: '1px' }}
      >
        {encoded.value}
      </text>
    </svg>
  );
}

const SOURCE_LABELS: Record<string, { bn: string; en: string }> = {
  opening: { bn: 'প্রারম্ভিক মজুদ', en: 'Opening Stock' },
  purchase: { bn: 'ক্রয় (মূসক ৬.১)', en: 'Purchase In' },
  invoice: { bn: 'বিক্রয় / ইনভয়েস', en: 'Sales Invoice Out' },
  sale: { bn: 'বিক্রয় / POS', en: 'Sales Out' },
  adjustment: { bn: 'স্টক সমন্বয়', en: 'Stock Adjustment' },
  transfer_in: { bn: 'শাখা ট্রান্সফার জমা', en: 'Branch Transfer In' },
  transfer_out: { bn: 'শাখা ট্রান্সফার প্রেরণ', en: 'Branch Transfer Out' },
};

export function ProductDetailDrawer({
  product,
  org,
  lang,
  onClose,
  onEdit,
  onAdjustStock,
  onTransferStock,
  onOrderNow,
  onDelete,
}: Props) {
  const isBn = lang === 'bn';
  const money = (v: number) => formatMoney(v, lang, org.currencySymbol);
  const numClass = isBn ? 'tabular-nums tracking-tight' : 'font-mono tabular-nums';

  const [movements, setMovements] = useState<StockMovementRecord[]>([]);
  const [loadingMoves, setLoadingMoves] = useState(false);
  const [labelCopies, setLabelCopies] = useState(6);
  const [downloadingLabel, setDownloadingLabel] = useState(false);

  useEffect(() => {
    if (!product) return;
    let active = true;
    setLoadingMoves(true);
    fetchProductMovements(product.id)
      .then((res) => {
        if (active) setMovements(res.movements || []);
      })
      .catch(() => {
        if (active) setMovements([]);
      })
      .finally(() => {
        if (active) setLoadingMoves(false);
      });
    return () => {
      active = false;
    };
  }, [product?.id, product?.stockQty]);

  if (!product) return null;

  const margin = computeProductMargin(product.salePrice, product.costPrice);
  const status = getProductStockStatus(product);
  const displayName = isBn && product.nameBn ? product.nameBn : product.name;
  const secondaryName = isBn && product.nameBn && product.nameBn !== product.name ? product.name : product.nameBn || '';

  const handleDownloadLabels = async () => {
    setDownloadingLabel(true);
    try {
      await downloadPdfDocument(
        { type: 'barcode_labels', items: [{ product, copies: labelCopies }] },
        org,
        lang
      );
    } finally {
      setDownloadingLabel(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-[2px] flex items-end sm:items-stretch sm:justify-end"
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={displayName}
        className="bg-white w-full sm:max-w-xl h-[92vh] sm:h-full rounded-t-3xl sm:rounded-none sm:border-l border-slate-200 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0">
          <div className="w-10 h-1.5 bg-slate-300 rounded-full" />
        </div>

        {/* Drawer Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900 truncate">{displayName}</h2>
            {secondaryName && <div className="text-xs text-slate-500 truncate mt-0.5">{secondaryName}</div>}
            <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-1.5">
              <span className="font-mono text-slate-700 font-medium">{product.sku}</span>
              {product.brand && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{product.brand}</span>
                </>
              )}
              {product.category && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{product.category}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onDelete(product)}
              aria-label={isBn ? `পণ্য মুছুন ${product.name}` : `Delete ${product.name}`}
              title={isBn ? 'মুছুন' : 'Delete'}
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close product detail"
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Studio Image + Barcode Block */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
            <div className="sm:col-span-6 aspect-[4/3] rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={displayName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-1.5 text-slate-400">
                  <Package className="w-8 h-8" strokeWidth={1.5} />
                  <span className="text-[11px]">{isBn ? 'ছবি যুক্ত নেই' : 'No photo'}</span>
                </div>
              )}
            </div>

            <div className="sm:col-span-6 border border-slate-200 rounded-xl p-3.5 bg-slate-50/50 space-y-2.5">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Code-128B</span>
                <span
                  className={`font-semibold ${
                    status === 'out'
                      ? 'text-rose-700'
                      : status === 'low'
                        ? 'text-amber-700'
                        : status === 'service'
                          ? 'text-slate-600'
                          : 'text-emerald-700'
                  }`}
                >
                  {status === 'out'
                    ? isBn
                      ? 'স্টক শেষ'
                      : 'Out of Stock'
                    : status === 'low'
                      ? isBn
                        ? 'কম স্টক'
                        : 'Low Stock'
                      : status === 'service'
                        ? isBn
                          ? 'সেবা আইটেম'
                          : 'Service Item'
                        : isBn
                          ? 'পর্যাপ্ত মজুদ'
                          : 'In Stock'}
                </span>
              </div>
              <InlineCode128Barcode value={product.barcode || product.sku} />
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200">
                <label className="text-[11px] text-slate-600 flex items-center gap-1.5">
                  <span>{isBn ? 'কপি:' : 'Copies:'}</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={labelCopies}
                    onChange={(e) => setLabelCopies(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                    className="w-12 h-7 px-1.5 text-xs font-mono text-center bg-white border border-slate-300 rounded-md"
                  />
                </label>
                <button
                  type="button"
                  disabled={downloadingLabel}
                  onClick={handleDownloadLabels}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#0F766E] hover:bg-[#0F766E]/10 rounded-lg whitespace-nowrap"
                >
                  <Barcode className="w-3.5 h-3.5" />
                  {downloadingLabel ? '...' : isBn ? 'লেবেল PDF' : 'Label PDF'}
                </button>
              </div>
            </div>
          </div>

          {product.description && (
            <p className="text-xs text-slate-600 leading-relaxed">{product.description}</p>
          )}

          {/* Below Reorder Point Warning Banner with Order Now Action */}
          {isBelowReorderPoint(product) && (
            <div
              role="status"
              className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                status === 'out'
                  ? 'bg-rose-50/70 border-rose-200'
                  : 'bg-amber-50/70 border-amber-200'
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <AlertTriangle
                  className={`w-4 h-4 shrink-0 mt-0.5 ${status === 'out' ? 'text-rose-600' : 'text-amber-600'}`}
                />
                <div className="min-w-0">
                  <div className={`text-xs font-semibold ${status === 'out' ? 'text-rose-900' : 'text-amber-900'}`}>
                    {status === 'out'
                      ? isBn
                        ? 'স্টক শেষ হয়ে গেছে — জরুরি অর্ডার প্রয়োজন'
                        : 'Out of stock — immediate restock required'
                      : isBn
                        ? 'রিঅর্ডার সীমার নিচে মজুদ নেমে এসেছে'
                        : 'Stock is below defined reorder point'}
                  </div>
                  <div className={`text-[11px] mt-0.5 ${numClass} ${status === 'out' ? 'text-rose-700' : 'text-amber-800'}`}>
                    {isBn
                      ? `বর্তমান: ${formatNumber(product.stockQty ?? 0, lang)} ${product.unit} · রিঅর্ডার সীমা: ${formatNumber(product.reorderLevel, lang)} ${product.unit}`
                      : `On hand: ${formatNumber(product.stockQty ?? 0, lang)} ${product.unit} · Reorder point: ${formatNumber(product.reorderLevel, lang)} ${product.unit}`}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOrderNow(product)}
                className={`min-h-[36px] inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white rounded-lg whitespace-nowrap shrink-0 transition-colors ${
                  status === 'out'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>{isBn ? 'এখনই অর্ডার' : 'Order Now'}</span>
              </button>
            </div>
          )}

          {/* Action Row */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => onEdit(product)}
              className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl sm:rounded-lg whitespace-nowrap"
            >
              <Edit3 className="w-3.5 h-3.5 text-slate-600" />
              {isBn ? 'সম্পাদনা' : 'Edit'}
            </button>
            {product.trackInventory && (
              <>
                <button
                  type="button"
                  onClick={() => onAdjustStock(product)}
                  className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-[#0F766E] hover:bg-[#115E59] rounded-xl sm:rounded-lg whitespace-nowrap"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  {isBn ? 'স্টক সমন্বয়' : 'Adjust'}
                </button>
                <button
                  type="button"
                  onClick={() => onTransferStock(product)}
                  className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl sm:rounded-lg whitespace-nowrap"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 text-[#0F766E]" />
                  {isBn ? 'ট্রান্সফার' : 'Transfer'}
                </button>
              </>
            )}
          </div>

          {/* Pricing & Tax Hairline Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-200 border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-white p-3">
              <div className="text-[11px] text-slate-500">{isBn ? 'ক্রয় মূল্য' : 'Cost Price'}</div>
              <div className={`text-sm font-semibold text-slate-900 mt-0.5 ${numClass}`}>{money(product.costPrice)}</div>
            </div>
            <div className="bg-white p-3">
              <div className="text-[11px] text-slate-500">{isBn ? 'বিক্রয় মূল্য' : 'Sale Price'}</div>
              <div className={`text-sm font-semibold text-slate-900 mt-0.5 ${numClass}`}>{money(product.salePrice)}</div>
            </div>
            <div className="bg-white p-3">
              <div className="text-[11px] text-slate-500">{isBn ? 'লাভ ও মার্জিন' : 'Profit & Margin'}</div>
              <div className={`text-sm font-semibold mt-0.5 ${margin.profit >= 0 ? 'text-emerald-700' : 'text-rose-700'} ${numClass}`}>
                {formatNumber(margin.marginPct, lang)}%
              </div>
              <div className={`text-[10px] text-slate-500 ${numClass}`}>{money(margin.profit)}</div>
            </div>
            <div className="bg-white p-3">
              <div className="text-[11px] text-slate-500">{isBn ? 'মূসক / HS কোড' : 'VAT / HS Code'}</div>
              <div className={`text-sm font-semibold text-slate-900 mt-0.5 ${numClass}`}>
                {formatNumber(product.taxRate ?? 15, lang)}%
              </div>
              <div className="text-[10px] font-mono text-slate-500 truncate">{product.hsCode || '—'}</div>
            </div>
          </div>

          {/* Multi-Branch Stock Breakdown */}
          {product.trackInventory && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {isBn ? 'শাখাভিত্তিক মজুদ' : 'Branch-Wise Stock'}
                </h3>
                <span className={`text-xs text-slate-500 ${numClass}`}>
                  {isBn ? 'রিঅর্ডার সীমা:' : 'Reorder at:'} {formatNumber(product.reorderLevel, lang)} {product.unit}
                </span>
              </div>
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                {(product.branchStocks || []).map((bs) => (
                  <div key={bs.branchId} className="px-4 py-3 flex items-center justify-between gap-3 bg-white">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {isBn ? bs.branchNameBn || bs.branchName : bs.branchName}
                      </div>
                      <div className={`text-[11px] text-slate-500 ${numClass}`}>
                        {isBn ? 'গড় ক্রয়মূল্য:' : 'Avg Cost:'} {money(bs.avgCost)} · {isBn ? 'মূল্য:' : 'Value:'} {money(bs.stockValue)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span
                        className={`text-sm font-semibold ${numClass} ${
                          bs.quantity <= 0
                            ? 'text-rose-700'
                            : bs.quantity <= product.reorderLevel
                              ? 'text-amber-700'
                              : 'text-slate-900'
                        }`}
                      >
                        {formatNumber(bs.quantity, lang)} {product.unit}
                      </span>
                      <button
                        type="button"
                        onClick={() => onAdjustStock(product, bs.branchId)}
                        className="px-2 py-1 text-[11px] font-medium text-[#0F766E] hover:bg-[#0F766E]/10 rounded-md"
                      >
                        {isBn ? 'সমন্বয়' : 'Adjust'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Stock Movement History */}
          {product.trackInventory && (
            <section className="space-y-2 pb-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {isBn ? 'স্টক মুভমেন্ট হিস্ট্রি' : 'Stock Movement History'}
                </h3>
                <span className={`text-xs text-slate-500 ${numClass}`}>{formatNumber(movements.length, lang)}</span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                {loadingMoves ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    {isBn ? 'হিস্ট্রি লোড হচ্ছে...' : 'Loading stock ledger...'}
                  </div>
                ) : movements.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    {isBn ? 'এখনো কোনো স্টক মুভমেন্ট লিপিবদ্ধ হয়নি।' : 'No stock movements recorded yet.'}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {movements.map((mv) => {
                      const meta = SOURCE_LABELS[mv.sourceType] || {
                        bn: mv.sourceType || mv.movementType,
                        en: mv.sourceType || mv.movementType,
                      };
                      const isOut = mv.movementType === 'out' || mv.quantity < 0;
                      const absQty = Math.abs(mv.quantity);
                      return (
                        <div key={mv.id} className="px-4 py-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-900">
                              {isBn ? meta.bn : meta.en}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-1.5">
                              <span>{formatDate(mv.movementDate || mv.createdAt.slice(0, 10), lang)}</span>
                              <span aria-hidden="true">·</span>
                              <span>{isBn ? mv.branchNameBn || mv.branchName : mv.branchName}</span>
                              {mv.sourceId && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono text-slate-600">#{mv.sourceId}</span>
                                </>
                              )}
                            </div>
                            {mv.notes && <div className="text-[11px] text-slate-500 mt-0.5">{mv.notes}</div>}
                          </div>
                          <div className="text-right shrink-0 tabular-nums">
                            <div className={`text-xs font-semibold ${isOut ? 'text-rose-700' : 'text-emerald-700'}`}>
                              {isOut ? '−' : '+'}
                              {formatNumber(absQty, lang)} {product.unit}
                            </div>
                            <div className="text-[10px] text-slate-500">{money(mv.unitCost)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>,
    document.body
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowUpDown,
  Barcode,
  CheckCircle2,
  Download,
  Edit3,
  LayoutGrid,
  List,
  Package,
  Plus,
  ScanBarcode,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import { formatMoney, formatNumber } from '../engine/format';
import type { Language, Product } from '../engine/types';
import { DICT } from '../i18n/translations';
import { apiRequest, type WorkspacePayload } from '../lib/api';
import { downloadPdfDocument } from '../lib/pdfExport';
import {
  computeDirectoryMetrics,
  computeProductMargin,
  extractBrands,
  extractCategories,
  filterAndSortProducts,
  getProductStockStatus,
  isBelowReorderPoint,
  type ProductSortKey,
  type ProductStockFilter,
  type ProductStockStatus,
} from '../lib/productDirectory';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { ProductDetailDrawer } from './ProductDetailDrawer';
import { ProductFormModal } from './ProductFormModal';
import { QuickReorderModal } from './QuickReorderModal';
import { StockAdjustModal, StockTransferModal } from './StockActionModals';

interface Props {
  data: WorkspacePayload;
  lang: Language;
  activeBranchId: number;
  highlightProductId?: number | null;
  onClearHighlight?: () => void;
  onRefresh: () => Promise<void>;
}

export function ProductsDirectoryWorkspace({
  data,
  lang,
  activeBranchId,
  highlightProductId,
  onClearHighlight,
  onRefresh,
}: Props) {
  const t = DICT[lang];
  const isBn = lang === 'bn';
  const { notify } = useFeedback();
  const money = (v: number) => formatMoney(v, lang, data.organization.currencySymbol);
  const numClass = isBn ? 'tabular-nums tracking-tight' : 'font-mono tabular-nums';

  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState<ProductStockFilter>('all');
  const [sortBy, setSortBy] = useState<ProductSortKey>('name');

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [drawerProductId, setDrawerProductId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<{ product: Product; branchId?: number } | null>(null);
  const [orderTarget, setOrderTarget] = useState<Product | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannedHighlight, setScannedHighlight] = useState<{ productId: number; code: string } | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferProductId, setTransferProductId] = useState<number | undefined>(undefined);
  const [exportingPdf, setExportingPdf] = useState<'catalog' | 'labels' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleConfirmDeleteProduct = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiRequest(`/api/products/${deleteTarget.id}`, { method: 'DELETE' });
      if (drawerProductId === deleteTarget.id) setDrawerProductId(null);
      notify({
        title: isBn ? 'পণ্য মুছে ফেলা হয়েছে।' : 'Product deleted.',
        description: isBn && deleteTarget.nameBn ? deleteTarget.nameBn : deleteTarget.name,
        variant: 'warning',
        sound: 'delete',
      });
      setDeleteTarget(null);
      await onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : isBn ? 'পণ্য মুছতে ব্যর্থ হয়েছে।' : 'Failed to delete product.';
      setDeleteError(msg);
      notify({ title: msg, variant: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const lastOpenedHighlight = useRef<number | null>(null);

  // Auto-open Product Detail Drawer when navigated from Global Search or Notification Center
  useEffect(() => {
    if (highlightProductId && highlightProductId !== lastOpenedHighlight.current) {
      const exists = data.products.some((p) => p.id === highlightProductId);
      if (exists) {
        lastOpenedHighlight.current = highlightProductId;
        setDrawerProductId(highlightProductId);
      }
    }
  }, [highlightProductId, data.products]);

  const categories = useMemo(() => extractCategories(data.products), [data.products]);
  const brands = useMemo(() => extractBrands(data.products), [data.products]);
  const metrics = useMemo(() => computeDirectoryMetrics(data.products), [data.products]);

  const filteredProducts = useMemo(
    () =>
      filterAndSortProducts(
        data.products,
        {
          query,
          category: categoryFilter,
          brand: brandFilter,
          stockStatus: stockFilter,
          sortBy,
        },
        lang
      ),
    [data.products, query, categoryFilter, brandFilter, stockFilter, sortBy, lang]
  );

  const drawerProduct = useMemo(
    () => (drawerProductId ? data.products.find((p) => p.id === drawerProductId) ?? null : null),
    [data.products, drawerProductId]
  );

  const scannedProduct = useMemo(
    () =>
      scannedHighlight
        ? data.products.find((p) => p.id === scannedHighlight.productId) ?? null
        : null,
    [data.products, scannedHighlight]
  );

  // Smoothly scroll the scanned & highlighted item into center view across grid/table/mobile
  useEffect(() => {
    if (!scannedHighlight) return;
    const rafId = window.requestAnimationFrame(() => {
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(
          `[data-product-id="${scannedHighlight.productId}"][data-scan-highlighted="true"]`
        )
      );
      const visibleTarget = candidates.find((el) => el.offsetParent !== null);
      if (visibleTarget) {
        visibleTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [scannedHighlight, viewMode, filteredProducts]);

  const handleScanMatch = (matched: Product, code: string) => {
    setScannerOpen(false);
    // Ensure active filters do not hide the matched product
    const stillVisible = filterAndSortProducts(
      [matched],
      {
        query,
        category: categoryFilter,
        brand: brandFilter,
        stockStatus: stockFilter,
        sortBy,
      },
      lang
    ).length > 0;
    if (!stillVisible) {
      setQuery('');
      setCategoryFilter('all');
      setBrandFilter('all');
      setStockFilter('all');
    }
    setScannedHighlight({ productId: matched.id, code });
  };

  const hasActiveFilters =
    Boolean(query.trim()) ||
    categoryFilter !== 'all' ||
    brandFilter !== 'all' ||
    stockFilter !== 'all';

  const resetFilters = () => {
    setQuery('');
    setCategoryFilter('all');
    setBrandFilter('all');
    setStockFilter('all');
    setSortBy('name');
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDownloadCatalogPdf = async () => {
    setExportingPdf('catalog');
    try {
      const parts: string[] = [];
      if (categoryFilter !== 'all') parts.push(categoryFilter);
      if (brandFilter !== 'all') parts.push(brandFilter);
      if (stockFilter !== 'all') parts.push(stockFilter);
      await downloadPdfDocument(
        {
          type: 'product_catalog',
          products: filteredProducts,
          filterSummary: parts.length > 0 ? parts.join(' · ') : undefined,
        },
        data.organization,
        lang
      );
      notify({
        title: isBn ? 'পণ্য ক্যাটালগ PDF ডাউনলোড হয়েছে।' : 'Product catalog PDF downloaded.',
        variant: 'info',
        sound: 'export',
      });
    } finally {
      setExportingPdf(null);
    }
  };

  const handleDownloadBarcodeLabelsPdf = async () => {
    const targets =
      selectedIds.size > 0
        ? data.products.filter((p) => selectedIds.has(p.id))
        : filteredProducts;
    if (targets.length === 0) return;

    setExportingPdf('labels');
    try {
      await downloadPdfDocument(
        {
          type: 'barcode_labels',
          items: targets.map((product) => ({ product, copies: selectedIds.size === 1 ? 6 : 2 })),
        },
        data.organization,
        lang
      );
      notify({
        title: isBn ? 'বারকোড লেবেল PDF ডাউনলোড হয়েছে।' : 'Barcode labels PDF downloaded.',
        variant: 'info',
        sound: 'export',
      });
    } finally {
      setExportingPdf(null);
    }
  };

  const statusMeta = (status: ProductStockStatus) => {
    switch (status) {
      case 'out':
        return { label: isBn ? 'স্টক শেষ' : 'Out of Stock', cls: 'text-rose-700 font-semibold' };
      case 'low':
        return { label: isBn ? 'কম স্টক' : 'Low Stock', cls: 'text-amber-700 font-semibold' };
      case 'service':
        return { label: isBn ? 'সেবা' : 'Service', cls: 'text-slate-500 font-medium' };
      default:
        return { label: isBn ? 'মজুদ আছে' : 'In Stock', cls: 'text-emerald-700 font-medium' };
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-semibold text-slate-900">
            {isBn ? 'প্রোডাক্ট ডাইরেক্টরি ও ইনভেন্টরি' : 'Product Directory & Inventory'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {isBn ? 'ভ্যালুয়েশন:' : 'Valuation:'}{' '}
            <span className="font-medium text-slate-700">
              {data.organization.inventoryMethod === 'fifo' ? 'FIFO' : 'Weighted Average'}
            </span>
            {' · '}
            {isBn
              ? `${formatNumber(data.branches.length, lang)}টি শাখা সমন্বিত`
              : `${data.branches.length} branches synced`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="scan-barcode-btn"
            onClick={() => setScannerOpen(true)}
            className="min-h-[38px] sm:min-h-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#0F766E] bg-teal-50/70 border border-[#0F766E]/35 hover:bg-teal-50 rounded-xl sm:rounded-lg whitespace-nowrap transition-colors"
          >
            <ScanBarcode className="w-3.5 h-3.5 text-[#0F766E]" />
            <span>{isBn ? 'বারকোড স্ক্যান' : 'Scan Barcode'}</span>
          </button>

          <button
            type="button"
            disabled={exportingPdf !== null || filteredProducts.length === 0}
            onClick={handleDownloadCatalogPdf}
            className="min-h-[38px] sm:min-h-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-xl sm:rounded-lg whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            {exportingPdf === 'catalog'
              ? isBn
                ? 'তৈরি হচ্ছে...'
                : 'Exporting...'
              : isBn
                ? 'ক্যাটালগ PDF'
                : 'Catalog PDF'}
          </button>

          <button
            type="button"
            disabled={exportingPdf !== null || filteredProducts.length === 0}
            onClick={handleDownloadBarcodeLabelsPdf}
            className="min-h-[38px] sm:min-h-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-xl sm:rounded-lg whitespace-nowrap"
          >
            <Barcode className="w-3.5 h-3.5 text-slate-600" />
            {exportingPdf === 'labels'
              ? isBn
                ? 'তৈরি হচ্ছে...'
                : 'Generating...'
              : selectedIds.size > 0
                ? isBn
                  ? `বারকোড PDF (${formatNumber(selectedIds.size, lang)})`
                  : `Labels PDF (${selectedIds.size})`
                : isBn
                  ? 'বারকোড লেবেল PDF'
                  : 'Barcode Labels PDF'}
          </button>

          {data.branches.length >= 2 && (
            <button
              type="button"
              onClick={() => {
                setTransferProductId(undefined);
                setTransferOpen(true);
              }}
              className="min-h-[38px] sm:min-h-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl sm:rounded-lg whitespace-nowrap"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-[#0F766E]" />
              {isBn ? 'স্টক ট্রান্সফার' : 'Transfer Stock'}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setEditingProduct(null);
              setFormOpen(true);
            }}
            className="min-h-[38px] sm:min-h-0 inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#115E59] rounded-xl sm:rounded-lg whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            {t.actions.newProduct}
          </button>
        </div>
      </div>

      {/* 4-KPI Hairline Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200 border border-slate-200 rounded-2xl sm:rounded-xl overflow-hidden">
        <div className="bg-white p-3.5 sm:p-4 min-w-0">
          <div className="text-xs text-slate-500">{isBn ? 'মোট প্রোডাক্ট ও সেবা' : 'Total Catalog Items'}</div>
          <div className={`text-lg sm:text-2xl font-semibold text-slate-900 mt-1 ${numClass}`}>
            {formatNumber(metrics.totalProducts, lang)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 truncate">
            {isBn
              ? `${formatNumber(metrics.trackedProducts, lang)}টি স্টক পণ্য · ${formatNumber(metrics.totalProducts - metrics.trackedProducts, lang)}টি সেবা`
              : `${metrics.trackedProducts} stocked · ${metrics.totalProducts - metrics.trackedProducts} services`}
          </div>
        </div>

        <div className="bg-white p-3.5 sm:p-4 min-w-0">
          <div className="text-xs text-slate-500">{t.metrics.inventoryValue}</div>
          <div className={`text-lg sm:text-2xl font-semibold text-slate-900 mt-1 truncate ${numClass}`}>
            {money(metrics.totalStockValue)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 truncate">
            {isBn ? 'শাখাভিত্তিক গড় ক্রয়মূল্যে' : 'At weighted average cost'}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setStockFilter((prev) => (prev === 'needs_reorder' ? 'all' : 'needs_reorder'))}
          className={`p-3.5 sm:p-4 min-w-0 text-left transition-colors ${
            stockFilter === 'needs_reorder' ? 'bg-amber-50/70' : 'bg-white hover:bg-slate-50'
          }`}
        >
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <span>{isBn ? 'রিঅর্ডার প্রয়োজন' : 'Below Reorder Point'}</span>
            {metrics.lowOrOutCount > 0 && (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-hidden="true" />
            )}
          </div>
          <div
            className={`text-lg sm:text-2xl font-semibold mt-1 ${numClass} ${
              metrics.lowOrOutCount > 0 ? 'text-amber-700' : 'text-emerald-700'
            }`}
          >
            {formatNumber(metrics.lowOrOutCount, lang)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 truncate">
            {metrics.lowOrOutCount > 0
              ? stockFilter === 'needs_reorder'
                ? isBn
                  ? 'ফিল্টার চালু আছে (রিসেট করতে ক্লিক)'
                  : 'Filtered (click to show all)'
                : isBn
                  ? 'ফিল্টার করতে ক্লিক করুন'
                  : 'Click to filter items to reorder'
              : isBn
                ? 'সব পণ্যের মজুদ স্বাভাবিক'
                : 'All stock levels healthy'}
          </div>
        </button>

        <div className="bg-white p-3.5 sm:p-4 min-w-0">
          <div className="text-xs text-slate-500">{isBn ? 'গড় গ্রস মার্জিন' : 'Avg Gross Margin'}</div>
          <div className={`text-lg sm:text-2xl font-semibold text-emerald-700 mt-1 ${numClass}`}>
            {formatNumber(metrics.avgMarginPct, lang)}%
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 truncate">
            {isBn ? 'বিক্রয়মূল্য বনাম ক্রয়মূল্য' : 'Across priced catalog items'}
          </div>
        </div>
      </div>

      {/* Filter & View Switch Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl p-3 sm:p-3.5 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center gap-2.5">
          {/* Search Input (type="text" with custom clear button) */}
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                isBn
                  ? 'নাম, SKU, বারকোড, ব্র্যান্ড বা HS কোড খুঁজুন...'
                  : 'Search by name, SKU, barcode, brand, or HS code...'
              }
              aria-label={isBn ? 'প্রোডাক্ট খুঁজুন' : 'Search products'}
              className="w-full h-10 sm:h-9 pl-9 pr-8 text-sm sm:text-xs bg-slate-50 border border-slate-200 rounded-xl sm:rounded-lg focus:bg-white focus:outline-none focus:border-[#0F766E]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="p-1 text-slate-400 hover:text-slate-700 absolute right-2 top-1/2 -translate-y-1/2"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Dropdowns */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
            <select
              aria-label={isBn ? 'ক্যাটাগরি ফিল্টার' : 'Filter by category'}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-10 sm:h-9 px-2.5 text-xs bg-white border border-slate-200 rounded-xl sm:rounded-lg text-slate-700"
            >
              <option value="all">{isBn ? 'সকল ক্যাটাগরি' : 'All Categories'}</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              aria-label={isBn ? 'ব্র্যান্ড ফিল্টার' : 'Filter by brand'}
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="h-10 sm:h-9 px-2.5 text-xs bg-white border border-slate-200 rounded-xl sm:rounded-lg text-slate-700"
            >
              <option value="all">{isBn ? 'সকল ব্র্যান্ড' : 'All Brands'}</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>

            <select
              aria-label={isBn ? 'স্টক অবস্থা' : 'Filter by stock status'}
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value as ProductStockFilter)}
              className="col-span-2 sm:col-span-1 h-10 sm:h-9 px-2.5 text-xs bg-white border border-slate-200 rounded-xl sm:rounded-lg text-slate-700"
            >
              <option value="all">{isBn ? 'সব স্টক অবস্থা' : 'All Status'}</option>
              <option value="needs_reorder">{isBn ? 'রিঅর্ডার প্রয়োজন' : 'Needs Reorder'}</option>
              <option value="in_stock">{isBn ? 'মজুদ আছে' : 'In Stock'}</option>
              <option value="low">{isBn ? 'কম স্টক' : 'Low Stock'}</option>
              <option value="out">{isBn ? 'স্টক শেষ' : 'Out of Stock'}</option>
              <option value="service">{isBn ? 'সেবা আইটেম' : 'Services'}</option>
            </select>

            <div className="col-span-2 sm:col-span-1 inline-flex items-center gap-1.5 h-10 sm:h-9 px-2.5 bg-slate-50 border border-slate-200 rounded-xl sm:rounded-lg focus-within:bg-white focus-within:border-[#0F766E]">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
              <label
                htmlFor="products-sort-by"
                className="text-xs font-medium text-slate-500 whitespace-nowrap shrink-0"
              >
                {isBn ? 'সাজান:' : 'Sort By:'}
              </label>
              <select
                id="products-sort-by"
                data-testid="products-sort-by"
                aria-label={isBn ? 'সাজান' : 'Sort By'}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as ProductSortKey)}
                className="flex-1 min-w-0 h-full bg-transparent text-xs font-medium text-slate-800 focus:outline-none cursor-pointer pr-1"
              >
                <option value="name">{isBn ? 'নাম (ক–য)' : 'Name (A–Z)'}</option>
                <option value="name_desc">{isBn ? 'নাম (য–ক)' : 'Name (Z–A)'}</option>
                <option value="price_asc">{isBn ? 'মূল্য (কম → বেশি)' : 'Price (Low to High)'}</option>
                <option value="price_desc">{isBn ? 'মূল্য (বেশি → কম)' : 'Price (High to Low)'}</option>
                <option value="stock_asc">{isBn ? 'মজুদ (কম → বেশি)' : 'Stock Level (Low to High)'}</option>
                <option value="stock_desc">{isBn ? 'মজুদ (বেশি → কম)' : 'Stock Level (High to Low)'}</option>
                <option value="margin_desc">{isBn ? 'সর্বোচ্চ লাভের হার' : 'Highest Margin'}</option>
                <option value="value_desc">{isBn ? 'সর্বোচ্চ মজুদ মূল্য' : 'Highest Stock Value'}</option>
              </select>
            </div>

            {/* Desktop Grid / Table Toggle */}
            <div className="hidden md:inline-flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200 shrink-0">
              <button
                type="button"
                aria-label={isBn ? 'কার্ড গ্রিড ভিউ' : 'Card Grid View'}
                onClick={() => setViewMode('grid')}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  viewMode === 'grid' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>{isBn ? 'কার্ড' : 'Cards'}</span>
              </button>
              <button
                type="button"
                aria-label={isBn ? 'টেবিল ভিউ' : 'Table View'}
                onClick={() => setViewMode('table')}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  viewMode === 'table' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>{isBn ? 'টেবিল' : 'Table'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Result Count & Clear Filters */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pt-1 border-t border-slate-100">
          <span>
            {isBn
              ? `${formatNumber(filteredProducts.length, lang)}টি পণ্য দেখানো হচ্ছে (মোট ${formatNumber(data.products.length, lang)}টি)`
              : `Showing ${filteredProducts.length} of ${data.products.length} items`}
          </span>
          <div className="flex items-center gap-3">
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-slate-600 hover:text-slate-900 underline"
              >
                {isBn ? `নির্বাচন বাতিল (${formatNumber(selectedIds.size, lang)})` : `Clear selection (${selectedIds.size})`}
              </button>
            )}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="font-medium text-[#0F766E] hover:underline"
              >
                {isBn ? 'ফিল্টার রিসেট করুন' : 'Reset filters'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Scanned Product Match Banner */}
      {scannedProduct && scannedHighlight && (
        <div
          role="status"
          data-testid="scan-match-banner"
          className="bg-teal-50/80 border border-[#0F766E]/40 rounded-2xl sm:rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
        >
          <div className="flex items-start sm:items-center gap-2.5 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-[#0F766E] shrink-0 mt-0.5 sm:mt-0" />
            <div className="min-w-0 text-xs">
              <div className="font-semibold text-slate-900 truncate">
                {isBn ? 'স্ক্যানে পণ্য শনাক্ত হয়েছে:' : 'Scanned match highlighted:'}{' '}
                <span className="text-[#0F766E]">
                  {isBn && scannedProduct.nameBn ? scannedProduct.nameBn : scannedProduct.name}
                </span>
              </div>
              <div className="text-[11px] text-slate-600 font-mono truncate mt-0.5">
                {scannedProduct.sku}
                {scannedProduct.barcode ? ` · ${scannedProduct.barcode}` : ''}
                {scannedProduct.trackInventory
                  ? ` · ${formatNumber(scannedProduct.stockQty ?? 0, lang)} ${scannedProduct.unit}`
                  : ''}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setDrawerProductId(scannedProduct.id)}
              className="px-2.5 py-1.5 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#115E59] rounded-lg whitespace-nowrap"
            >
              {isBn ? 'বিস্তারিত দেখুন' : 'View Details'}
            </button>
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap"
            >
              {isBn ? 'আবার স্ক্যান' : 'Scan Another'}
            </button>
            <button
              type="button"
              onClick={() => setScannedHighlight(null)}
              aria-label={isBn ? 'হাইলাইট সরান' : 'Clear scan highlight'}
              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-white/70 rounded-lg"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {filteredProducts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl p-10 text-center space-y-2">
          <div className="text-sm font-semibold text-slate-900">
            {isBn ? 'কোনো প্রোডাক্ট পাওয়া যায়নি' : 'No matching products found'}
          </div>
          <p className="text-xs text-slate-500">
            {isBn
              ? 'অনুসন্ধান বা ফিল্টার পরিবর্তন করে আবার চেষ্টা করুন, অথবা নতুন পণ্য যুক্ত করুন।'
              : 'Try adjusting your search or filters, or add a new product to the catalog.'}
          </p>
        </div>
      ) : (
        <>
          {/* DESKTOP VISUAL CARD GRID VIEW */}
          {viewMode === 'grid' && (
            <div className="hidden md:grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredProducts.map((p) => {
                const margin = computeProductMargin(p.salePrice, p.costPrice);
                const status = getProductStockStatus(p);
                const belowReorder = isBelowReorderPoint(p);
                const isScanHighlighted = scannedHighlight?.productId === p.id;
                const stMeta = statusMeta(status);
                const displayName = isBn && p.nameBn ? p.nameBn : p.name;
                const isChecked = selectedIds.has(p.id);
                const cardBorderClass = isScanHighlighted
                  ? 'border-[#0F766E] ring-2 ring-[#0F766E]/35 bg-teal-50/35 shadow-sm'
                  : drawerProductId === p.id
                    ? 'border-[#0F766E] ring-1 ring-[#0F766E]/20 bg-white'
                    : belowReorder
                      ? status === 'out'
                        ? 'border-rose-300 bg-rose-50/30 hover:border-rose-400'
                        : 'border-amber-300 bg-amber-50/30 hover:border-amber-400'
                      : 'border-slate-200 bg-white hover:border-slate-300';

                return (
                  <article
                    key={p.id}
                    data-product-id={p.id}
                    data-below-reorder={belowReorder ? 'true' : 'false'}
                    data-scan-highlighted={isScanHighlighted ? 'true' : 'false'}
                    className={`border rounded-xl overflow-hidden flex flex-col transition-all ${cardBorderClass}`}
                  >
                    {/* Studio Photo Header */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setDrawerProductId(p.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setDrawerProductId(p.id);
                        }
                      }}
                      className="relative aspect-[16/10] bg-slate-100 overflow-hidden cursor-pointer group"
                    >
                      {p.imageUrl ? (
                        <img
                          src={p.imageUrl}
                          alt={displayName}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-1">
                          <Package className="w-8 h-8" strokeWidth={1.5} />
                          <span className="text-[11px] font-medium">{p.category}</span>
                        </div>
                      )}
                      <label
                        onClick={(e) => e.stopPropagation()}
                        className="absolute top-2.5 left-2.5 w-6 h-6 rounded-md bg-white/90 border border-slate-300 flex items-center justify-center cursor-pointer"
                        title={isBn ? 'বারকোড লেবেলের জন্য নির্বাচন' : 'Select for barcode labels'}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelect(p.id)}
                          className="rounded border-slate-400 text-[#0F766E] focus:ring-[#0F766E]"
                        />
                      </label>
                    </div>

                    {/* Card Content */}
                    <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setDrawerProductId(p.id)}
                            className="text-left text-sm font-semibold text-slate-900 hover:text-[#0F766E] line-clamp-1"
                          >
                            {displayName}
                          </button>
                          <span className={`inline-flex items-center gap-1 text-[11px] shrink-0 whitespace-nowrap ${stMeta.cls}`}>
                            {belowReorder && (
                              <AlertTriangle
                                className={`w-3.5 h-3.5 shrink-0 ${status === 'out' ? 'text-rose-600' : 'text-amber-600'}`}
                                aria-label={isBn ? 'কম স্টক সতর্কতা' : 'Reorder warning'}
                              />
                            )}
                            <span>{stMeta.label}</span>
                          </span>
                        </div>

                        <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5 min-w-0">
                          <span className="truncate">
                            <span className="font-mono text-slate-700">{p.sku}</span>
                            {p.brand ? ` · ${p.brand}` : ''}
                            {p.category ? ` · ${p.category}` : ''}
                          </span>
                          {isScanHighlighted && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0F766E] shrink-0 whitespace-nowrap">
                              <ScanBarcode className="w-3 h-3" aria-hidden="true" />
                              <span>{isBn ? 'স্ক্যানকৃত' : 'Scanned'}</span>
                            </span>
                          )}
                        </div>

                        <div className="mt-3 pt-3 border-t border-slate-200/70 grid grid-cols-3 gap-2 text-xs tabular-nums">
                          <div>
                            <div className="text-[11px] text-slate-500">{isBn ? 'বিক্রয় দর' : 'Sale'}</div>
                            <div className="font-semibold text-slate-900 mt-0.5">{money(p.salePrice)}</div>
                          </div>
                          <div>
                            <div className="text-[11px] text-slate-500">{isBn ? 'ক্রয় / লাভ' : 'Cost / Margin'}</div>
                            <div className="text-slate-700 mt-0.5">
                              {money(p.costPrice)}{' '}
                              <span className={margin.marginPct >= 20 ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                                ({formatNumber(margin.marginPct, lang)}%)
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[11px] text-slate-500">{isBn ? 'মজুদ' : 'On Hand'}</div>
                            <div
                              className={`font-semibold mt-0.5 ${
                                status === 'out'
                                  ? 'text-rose-700'
                                  : status === 'low'
                                    ? 'text-amber-700'
                                    : 'text-slate-900'
                              }`}
                            >
                              {p.trackInventory ? `${formatNumber(p.stockQty ?? 0, lang)} ${p.unit}` : '—'}
                            </div>
                            {belowReorder && (
                              <div className="text-[10px] text-amber-800/80">
                                {isBn ? `সীমা: ${formatNumber(p.reorderLevel, lang)}` : `Min: ${formatNumber(p.reorderLevel, lang)}`}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="pt-2.5 border-t border-slate-200/70 flex items-center justify-between gap-2 text-xs">
                        <span className="text-[11px] text-slate-500 font-mono truncate">
                          {isBn ? 'মূসক' : 'VAT'} {formatNumber(p.taxRate ?? 15, lang)}%
                          {p.hsCode ? ` · HS ${p.hsCode}` : ''}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {belowReorder && (
                            <button
                              type="button"
                              onClick={() => setOrderTarget(p)}
                              aria-label={`${isBn ? 'এখনই অর্ডার' : 'Order Now'} ${p.name}`}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white rounded-md whitespace-nowrap transition-colors ${
                                status === 'out'
                                  ? 'bg-rose-600 hover:bg-rose-700'
                                  : 'bg-amber-600 hover:bg-amber-700'
                              }`}
                            >
                              <ShoppingBag className="w-3 h-3" />
                              <span>{isBn ? 'এখনই অর্ডার' : 'Order Now'}</span>
                            </button>
                          )}
                          {p.trackInventory && !belowReorder && (
                            <button
                              type="button"
                              onClick={() => setAdjustTarget({ product: p })}
                              className="px-2 py-1 text-xs font-medium text-[#0F766E] hover:bg-[#0F766E]/10 rounded-md whitespace-nowrap"
                            >
                              {isBn ? 'স্টক' : 'Stock'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingProduct(p);
                              setFormOpen(true);
                            }}
                            aria-label={`Edit ${p.name}`}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteError(null);
                              setDeleteTarget(p);
                            }}
                            aria-label={`Delete ${p.name}`}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDrawerProductId(p.id)}
                            className="px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md whitespace-nowrap"
                          >
                            {isBn ? 'বিস্তারিত' : 'Details'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* DESKTOP HIGH-DENSITY TABLE VIEW */}
          {viewMode === 'table' && (
            <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                    <th className="py-2.5 pl-4 pr-2 w-8 text-left">
                      <input
                        type="checkbox"
                        aria-label="Select all products"
                        checked={filteredProducts.length > 0 && filteredProducts.every((p) => selectedIds.has(p.id))}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds(new Set(filteredProducts.map((p) => p.id)));
                          else setSelectedIds(new Set());
                        }}
                        className="rounded border-slate-300 text-[#0F766E]"
                      />
                    </th>
                    <th className="py-2.5 px-3 text-left font-medium">{isBn ? 'পণ্য ও ব্র্যান্ড' : 'Product & Brand'}</th>
                    <th className="py-2.5 px-3 text-left font-medium">SKU / HS</th>
                    <th className="py-2.5 px-3 text-right font-medium">{isBn ? 'ক্রয় দর' : 'Cost'}</th>
                    <th className="py-2.5 px-3 text-right font-medium">{isBn ? 'বিক্রয় দর' : 'Sale'}</th>
                    <th className="py-2.5 px-3 text-right font-medium">{isBn ? 'মার্জিন' : 'Margin'}</th>
                    <th className="py-2.5 px-3 text-right font-medium">{isBn ? 'মোট মজুদ' : 'Stock'}</th>
                    <th className="py-2.5 px-3 text-right font-medium">{isBn ? 'মজুদ মূল্য' : 'Value'}</th>
                    <th className="py-2.5 pl-2 pr-4 text-right font-medium">{isBn ? 'অ্যাকশন' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.map((p) => {
                    const margin = computeProductMargin(p.salePrice, p.costPrice);
                    const status = getProductStockStatus(p);
                    const belowReorder = isBelowReorderPoint(p);
                    const isScanHighlighted = scannedHighlight?.productId === p.id;
                    const displayName = isBn && p.nameBn ? p.nameBn : p.name;
                    const rowTint = isScanHighlighted
                      ? 'bg-teal-50/80 ring-1 ring-inset ring-[#0F766E]'
                      : drawerProductId === p.id
                        ? 'bg-[#0F766E]/8'
                        : belowReorder
                          ? status === 'out'
                            ? 'bg-rose-50/45 hover:bg-rose-50/75'
                            : 'bg-amber-50/45 hover:bg-amber-50/75'
                          : 'hover:bg-slate-50/70';

                    return (
                      <tr
                        key={p.id}
                        data-product-id={p.id}
                        data-below-reorder={belowReorder ? 'true' : 'false'}
                        data-scan-highlighted={isScanHighlighted ? 'true' : 'false'}
                        className={`transition-colors ${rowTint}`}
                      >
                        <td className="py-3 pl-4 pr-2">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(p.id)}
                            onChange={() => toggleSelect(p.id)}
                            aria-label={`Select ${p.name}`}
                            className="rounded border-slate-300 text-[#0F766E]"
                          />
                        </td>
                        <td className="py-3 px-3">
                          <button
                            type="button"
                            onClick={() => setDrawerProductId(p.id)}
                            className="flex items-center gap-3 text-left group min-w-0"
                          >
                            <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                              {p.imageUrl ? (
                                <img
                                  src={p.imageUrl}
                                  alt={displayName}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <Package className="w-4 h-4 text-slate-400" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-slate-900 group-hover:text-[#0F766E] truncate max-w-[230px] flex items-center gap-1.5">
                                <span className="truncate">{displayName}</span>
                                {isScanHighlighted && (
                                  <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#0F766E] shrink-0 whitespace-nowrap">
                                    <ScanBarcode className="w-3 h-3" aria-hidden="true" />
                                    <span>{isBn ? 'স্ক্যানকৃত' : 'Scanned'}</span>
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 truncate max-w-[230px]">
                                {[p.brand, p.category].filter(Boolean).join(' · ') || '—'} · {isBn ? 'মূসক' : 'VAT'}{' '}
                                {formatNumber(p.taxRate ?? 15, lang)}%
                              </div>
                            </div>
                          </button>
                        </td>
                        <td className="py-3 px-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                          <div className="text-slate-900 font-medium">{p.sku}</div>
                          {p.hsCode && <div className="text-[11px] text-slate-400">HS {p.hsCode}</div>}
                        </td>
                        <td className={`py-3 px-3 text-right text-xs text-slate-600 ${numClass}`}>{money(p.costPrice)}</td>
                        <td className={`py-3 px-3 text-right text-sm font-medium text-slate-900 ${numClass}`}>
                          {money(p.salePrice)}
                        </td>
                        <td
                          className={`py-3 px-3 text-right text-xs font-semibold ${numClass} ${
                            margin.marginPct >= 20 ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {formatNumber(margin.marginPct, lang)}%
                        </td>
                        <td className={`py-3 px-3 text-right text-xs ${numClass} whitespace-nowrap`}>
                          {p.trackInventory ? (
                            <div>
                              <span
                                className={`inline-flex items-center justify-end gap-1 ${
                                  status === 'out'
                                    ? 'text-rose-700 font-semibold'
                                    : status === 'low'
                                      ? 'text-amber-700 font-semibold'
                                      : 'text-slate-900 font-medium'
                                }`}
                              >
                                {belowReorder && (
                                  <AlertTriangle
                                    className={`w-3.5 h-3.5 shrink-0 ${status === 'out' ? 'text-rose-600' : 'text-amber-600'}`}
                                    aria-label={isBn ? 'কম স্টক সতর্কতা' : 'Reorder warning'}
                                  />
                                )}
                                <span>
                                  {formatNumber(p.stockQty ?? 0, lang)} {p.unit}
                                </span>
                              </span>
                              {belowReorder && (
                                <div className="text-[10px] text-amber-800/80">
                                  {isBn ? `সীমা: ${formatNumber(p.reorderLevel, lang)}` : `Min: ${formatNumber(p.reorderLevel, lang)}`}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">{isBn ? 'সেবা' : 'Service'}</span>
                          )}
                        </td>
                        <td className={`py-3 px-3 text-right text-sm font-medium text-slate-900 ${numClass}`}>
                          {p.trackInventory ? money(p.stockValue ?? 0) : '—'}
                        </td>
                        <td className="py-3 pl-2 pr-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            {belowReorder && (
                              <button
                                type="button"
                                onClick={() => setOrderTarget(p)}
                                aria-label={`${isBn ? 'এখনই অর্ডার' : 'Order Now'} ${p.name}`}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white rounded-md whitespace-nowrap transition-colors ${
                                  status === 'out'
                                    ? 'bg-rose-600 hover:bg-rose-700'
                                    : 'bg-amber-600 hover:bg-amber-700'
                                }`}
                              >
                                <ShoppingBag className="w-3 h-3" />
                                <span>{isBn ? 'এখনই অর্ডার' : 'Order Now'}</span>
                              </button>
                            )}
                            {p.trackInventory && (
                              <button
                                type="button"
                                onClick={() => setAdjustTarget({ product: p })}
                                title={isBn ? 'স্টক সমন্বয়' : 'Adjust Stock'}
                                className="p-1.5 text-slate-500 hover:text-[#0F766E] hover:bg-slate-100 rounded-md"
                              >
                                <SlidersHorizontal className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingProduct(p);
                                setFormOpen(true);
                              }}
                              title={isBn ? 'সম্পাদনা' : 'Edit Product'}
                              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteError(null);
                                setDeleteTarget(p);
                              }}
                              aria-label={`Delete ${p.name}`}
                              title={isBn ? 'মুছুন' : 'Delete Product'}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* MOBILE TOUCH-NATIVE PRODUCT CARDS (< md, zero horizontal overflow) */}
          <div className="md:hidden bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
            {filteredProducts.map((p) => {
              const margin = computeProductMargin(p.salePrice, p.costPrice);
              const status = getProductStockStatus(p);
              const belowReorder = isBelowReorderPoint(p);
              const isScanHighlighted = scannedHighlight?.productId === p.id;
              const stMeta = statusMeta(status);
              const displayName = isBn && p.nameBn ? p.nameBn : p.name;
              const mobileTint = isScanHighlighted
                ? 'bg-teal-50/75 ring-2 ring-inset ring-[#0F766E]'
                : belowReorder
                  ? status === 'out'
                    ? 'bg-rose-50/45'
                    : 'bg-amber-50/45'
                  : '';

              return (
                <div
                  key={p.id}
                  data-product-id={p.id}
                  data-below-reorder={belowReorder ? 'true' : 'false'}
                  data-scan-highlighted={isScanHighlighted ? 'true' : 'false'}
                  onClick={() => setDrawerProductId(p.id)}
                  className={`p-3.5 active:bg-slate-50 transition-colors space-y-2.5 ${mobileTint}`}
                >
                  <div className="flex gap-3 items-start">
                    <div className="w-16 h-16 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                      {p.imageUrl ? (
                        <img
                          src={p.imageUrl}
                          alt={displayName}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Package className="w-5 h-5 text-slate-400" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-semibold text-slate-900 truncate">{displayName}</div>
                        <div className={`text-sm font-semibold text-slate-900 shrink-0 ${numClass}`}>
                          {money(p.salePrice)}
                        </div>
                      </div>

                      <div className="text-xs text-slate-500 flex items-center gap-1.5 min-w-0">
                        <span className="truncate">
                          <span className="font-mono text-slate-700">{p.sku}</span>
                          {p.brand ? ` · ${p.brand}` : ''}
                          {p.category ? ` · ${p.category}` : ''}
                        </span>
                        {isScanHighlighted && (
                          <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#0F766E] shrink-0 whitespace-nowrap">
                            <ScanBarcode className="w-3 h-3" aria-hidden="true" />
                            <span>{isBn ? 'স্ক্যানকৃত' : 'Scanned'}</span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-0.5 text-xs tabular-nums">
                        <span className="text-slate-500 truncate">
                          {isBn ? 'লাভ' : 'Margin'}{' '}
                          <span className="font-semibold text-emerald-700">{formatNumber(margin.marginPct, lang)}%</span>
                          {' · '}
                          {isBn ? 'মূসক' : 'VAT'} {formatNumber(p.taxRate ?? 15, lang)}%
                        </span>
                        <span className={`inline-flex items-center gap-1 shrink-0 ${stMeta.cls}`}>
                          {belowReorder && (
                            <AlertTriangle
                              className={`w-3.5 h-3.5 shrink-0 ${status === 'out' ? 'text-rose-600' : 'text-amber-600'}`}
                              aria-label={isBn ? 'কম স্টক সতর্কতা' : 'Reorder warning'}
                            />
                          )}
                          <span>
                            {p.trackInventory
                              ? `${formatNumber(p.stockQty ?? 0, lang)} ${p.unit}`
                              : stMeta.label}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {belowReorder && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="pt-2 border-t border-amber-200/70 flex items-center justify-between gap-2"
                    >
                      <span className={`text-[11px] font-medium truncate ${status === 'out' ? 'text-rose-800' : 'text-amber-900'} ${numClass}`}>
                        {status === 'out'
                          ? isBn
                            ? 'স্টক শেষ · জরুরি অর্ডার'
                            : 'Out of stock'
                          : isBn
                            ? `রিঅর্ডার সীমা: ${formatNumber(p.reorderLevel, lang)} ${p.unit}`
                            : `Below reorder (${formatNumber(p.reorderLevel, lang)} ${p.unit})`}
                      </span>
                      <button
                        type="button"
                        onClick={() => setOrderTarget(p)}
                        aria-label={`${isBn ? 'এখনই অর্ডার' : 'Order Now'} ${p.name}`}
                        className={`min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white rounded-lg whitespace-nowrap shrink-0 active:scale-[0.98] transition-all ${
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
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Detail Slide-Over Drawer / Mobile Bottom Sheet */}
      <ProductDetailDrawer
        product={drawerProduct}
        org={data.organization}
        lang={lang}
        onClose={() => {
          setDrawerProductId(null);
          onClearHighlight?.();
        }}
        onEdit={(prod) => {
          setEditingProduct(prod);
          setFormOpen(true);
        }}
        onAdjustStock={(prod, branchId) => setAdjustTarget({ product: prod, branchId })}
        onTransferStock={(prod) => {
          setTransferProductId(prod.id);
          setTransferOpen(true);
        }}
        onOrderNow={(prod) => setOrderTarget(prod)}
        onDelete={(prod) => {
          setDeleteError(null);
          setDeleteTarget(prod);
        }}
      />

      {/* Barcode Camera Scanner Modal */}
      <BarcodeScannerModal
        open={scannerOpen}
        products={data.products}
        lang={lang}
        onClose={() => setScannerOpen(false)}
        onMatch={handleScanMatch}
      />

      {/* Quick Reorder Purchase Modal */}
      <QuickReorderModal
        open={Boolean(orderTarget)}
        product={orderTarget}
        org={data.organization}
        lang={lang}
        branches={data.branches}
        vendors={data.vendors}
        activeBranchId={activeBranchId}
        onClose={() => setOrderTarget(null)}
        onCompleted={onRefresh}
      />

      {/* Create / Edit Modal */}
      <ProductFormModal
        open={formOpen}
        product={editingProduct}
        org={data.organization}
        lang={lang}
        branches={data.branches}
        activeBranchId={activeBranchId}
        taxRules={data.taxRules}
        existingCategories={categories}
        existingBrands={brands}
        onClose={() => {
          setFormOpen(false);
          setEditingProduct(null);
        }}
        onSaved={async () => {
          await onRefresh();
        }}
      />

      {/* Branch Stock Adjustment Modal */}
      <StockAdjustModal
        open={Boolean(adjustTarget)}
        product={adjustTarget?.product ?? null}
        initialBranchId={adjustTarget?.branchId ?? activeBranchId}
        org={data.organization}
        lang={lang}
        branches={data.branches}
        onClose={() => setAdjustTarget(null)}
        onCompleted={onRefresh}
      />

      {/* Branch-to-Branch Stock Transfer Modal */}
      <StockTransferModal
        open={transferOpen}
        initialProductId={transferProductId}
        products={data.products}
        branches={data.branches}
        lang={lang}
        onClose={() => setTransferOpen(false)}
        onCompleted={onRefresh}
      />

      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        lang={lang}
        title={isBn ? 'পণ্য মুছে ফেলবেন?' : 'Delete product?'}
        itemLabel={deleteTarget ? `${deleteTarget.nameBn || deleteTarget.name} (${deleteTarget.sku})` : ''}
        description={
          deleteTarget
            ? isBn
              ? 'কোনো ইনভয়েস বা ক্রয়ে এই পণ্য যুক্ত না থাকলে ক্যাটালগ থেকে স্থায়ীভাবে মুছে ফেলা হবে।'
              : 'This product will be permanently removed from the catalog if it is not referenced by existing invoices or purchases.'
            : ''
        }
        busy={deleting}
        error={deleteError}
        onCancel={() => {
          if (!deleting) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
        onConfirm={handleConfirmDeleteProduct}
      />
    </div>
  );
}

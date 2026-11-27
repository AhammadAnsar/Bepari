import type { Product } from '../engine/types';

export type ProductStockStatus = 'in_stock' | 'low' | 'out' | 'service';
export type ProductStockFilter = 'all' | 'needs_reorder' | ProductStockStatus;
export type ProductSortKey =
  | 'name'
  | 'name_desc'
  | 'price_asc'
  | 'price_desc'
  | 'stock_asc'
  | 'stock_desc'
  | 'margin_desc'
  | 'value_desc';

export interface ProductDirectoryFilters {
  query: string;
  category: string;
  brand: string;
  stockStatus: ProductStockFilter;
  sortBy: ProductSortKey;
}

export interface ProductMarginInfo {
  profit: number;
  marginPct: number;
  markupPct: number;
}

export interface DirectoryMetrics {
  totalProducts: number;
  trackedProducts: number;
  lowOrOutCount: number;
  outOfStockCount: number;
  totalStockValue: number;
  avgMarginPct: number;
}

export function computeProductMargin(salePrice: number, costPrice: number): ProductMarginInfo {
  const safeSale = Number.isFinite(salePrice) ? salePrice : 0;
  const safeCost = Number.isFinite(costPrice) ? costPrice : 0;
  const profit = Number((safeSale - safeCost).toFixed(2));
  const marginPct = safeSale > 0 ? Number(((profit / safeSale) * 100).toFixed(1)) : 0;
  const markupPct = safeCost > 0 ? Number(((profit / safeCost) * 100).toFixed(1)) : 0;
  return { profit, marginPct, markupPct };
}

export function getProductStockStatus(product: Product): ProductStockStatus {
  if (!product.trackInventory) return 'service';
  const qty = Number(product.stockQty ?? 0);
  if (qty <= 0) return 'out';
  if (qty <= Number(product.reorderLevel ?? 0)) return 'low';
  return 'in_stock';
}

export function isBelowReorderPoint(product: Product): boolean {
  const status = getProductStockStatus(product);
  return status === 'low' || status === 'out';
}

export function computeRecommendedReorderQty(product: Product): number {
  const current = Math.max(0, Number(product.stockQty ?? 0));
  const reorder = Math.max(0, Number(product.reorderLevel ?? 0));
  const target = Math.max(reorder * 2, reorder + 5, 10);
  return Math.max(1, Math.ceil(target - current));
}

export function extractCategories(products: Product[]): string[] {
  const set = new Set<string>();
  for (const p of products) {
    const cat = (p.category || '').trim();
    if (cat) set.add(cat);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function extractBrands(products: Product[]): string[] {
  const set = new Set<string>();
  for (const p of products) {
    const brand = (p.brand || '').trim();
    if (brand) set.add(brand);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function filterAndSortProducts(
  products: Product[],
  filters: ProductDirectoryFilters,
  lang: 'en' | 'bn' = 'en'
): Product[] {
  const q = filters.query.trim().toLowerCase();

  const filtered = products.filter((p) => {
    if (filters.category && filters.category !== 'all') {
      if ((p.category || '').trim() !== filters.category) return false;
    }
    if (filters.brand && filters.brand !== 'all') {
      if ((p.brand || '').trim() !== filters.brand) return false;
    }
    if (filters.stockStatus && filters.stockStatus !== 'all') {
      const st = getProductStockStatus(p);
      if (filters.stockStatus === 'needs_reorder') {
        if (st !== 'low' && st !== 'out') return false;
      } else if (st !== filters.stockStatus) {
        return false;
      }
    }
    if (q) {
      const hay = [
        p.name,
        p.nameBn,
        p.sku,
        p.barcode || '',
        p.brand || '',
        p.category || '',
        p.hsCode || '',
        p.description || '',
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const displayName = (p: Product) => (lang === 'bn' ? p.nameBn || p.name : p.name);
  const compareName = (a: Product, b: Product) =>
    displayName(a).localeCompare(displayName(b), lang === 'bn' ? 'bn' : 'en', {
      sensitivity: 'base',
    });

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    switch (filters.sortBy) {
      case 'name_desc':
        return compareName(b, a);
      case 'price_asc':
        return a.salePrice - b.salePrice || compareName(a, b);
      case 'price_desc':
        return b.salePrice - a.salePrice || compareName(a, b);
      case 'stock_asc': {
        const qa = a.trackInventory ? (a.stockQty ?? 0) : Number.MAX_SAFE_INTEGER;
        const qb = b.trackInventory ? (b.stockQty ?? 0) : Number.MAX_SAFE_INTEGER;
        return qa - qb || compareName(a, b);
      }
      case 'stock_desc': {
        const qa = a.trackInventory ? (a.stockQty ?? 0) : -1;
        const qb = b.trackInventory ? (b.stockQty ?? 0) : -1;
        return qb - qa || compareName(a, b);
      }
      case 'margin_desc': {
        const ma = computeProductMargin(a.salePrice, a.costPrice).marginPct;
        const mb = computeProductMargin(b.salePrice, b.costPrice).marginPct;
        return mb - ma || compareName(a, b);
      }
      case 'value_desc':
        return (b.stockValue ?? 0) - (a.stockValue ?? 0) || compareName(a, b);
      case 'name':
      default:
        return compareName(a, b);
    }
  });

  return sorted;
}

export function computeDirectoryMetrics(products: Product[]): DirectoryMetrics {
  let trackedProducts = 0;
  let lowOrOutCount = 0;
  let outOfStockCount = 0;
  let totalStockValue = 0;
  let marginSum = 0;
  let marginCount = 0;

  for (const p of products) {
    if (p.trackInventory) {
      trackedProducts++;
      totalStockValue += Number(p.stockValue ?? 0);
      const status = getProductStockStatus(p);
      if (status === 'out') {
        outOfStockCount++;
        lowOrOutCount++;
      } else if (status === 'low') {
        lowOrOutCount++;
      }
    }
    if (p.salePrice > 0) {
      marginSum += computeProductMargin(p.salePrice, p.costPrice).marginPct;
      marginCount++;
    }
  }

  return {
    totalProducts: products.length,
    trackedProducts,
    lowOrOutCount,
    outOfStockCount,
    totalStockValue: Number(totalStockValue.toFixed(2)),
    avgMarginPct: marginCount > 0 ? Number((marginSum / marginCount).toFixed(1)) : 0,
  };
}

export function normalizeScanCode(raw: string): string {
  return String(raw || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function stripSeparators(code: string): string {
  return code.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function stripLeadingZeros(code: string): string {
  const digits = code.replace(/\D/g, '');
  if (!digits) return '';
  return digits.replace(/^0+/, '') || '0';
}

export function findProductByScannedCode(
  products: Product[],
  rawCode: string
): Product | null {
  const normalized = normalizeScanCode(rawCode);
  if (!normalized) return null;

  const lower = normalized.toLowerCase();

  // 1. Exact case-insensitive barcode match
  const exactBarcode = products.find(
    (p) => normalizeScanCode(p.barcode || '').toLowerCase() === lower
  );
  if (exactBarcode) return exactBarcode;

  // 2. Exact case-insensitive SKU match
  const exactSku = products.find(
    (p) => normalizeScanCode(p.sku || '').toLowerCase() === lower
  );
  if (exactSku) return exactSku;

  // 3. Alphanumeric match ignoring hyphens/spaces (barcode first, then SKU)
  const compact = stripSeparators(normalized);
  if (compact) {
    const compactBarcode = products.find(
      (p) => stripSeparators(p.barcode || '') === compact
    );
    if (compactBarcode) return compactBarcode;

    const compactSku = products.find(
      (p) => stripSeparators(p.sku || '') === compact
    );
    if (compactSku) return compactSku;
  }

  // 4. Numeric barcode match ignoring leading zero differences (e.g. UPC-A vs EAN-13)
  if (/^\d{6,}$/.test(compact)) {
    const sigDigits = stripLeadingZeros(compact);
    const numericBarcode = products.find((p) => {
      const bDigits = (p.barcode || '').replace(/\D/g, '');
      return bDigits.length >= 6 && stripLeadingZeros(bDigits) === sigDigits;
    });
    if (numericBarcode) return numericBarcode;
  }

  return null;
}

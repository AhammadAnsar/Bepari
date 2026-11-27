import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeCode128B, renderCode128BSvg, sanitizeBarcodeValue } from './barcode';
import {
  computeDirectoryMetrics,
  computeProductMargin,
  computeRecommendedReorderQty,
  extractBrands,
  extractCategories,
  filterAndSortProducts,
  findProductByScannedCode,
  getProductStockStatus,
  isBelowReorderPoint,
  normalizeScanCode,
} from './productDirectory';
import type { Product } from '../engine/types';

const sampleProducts: Product[] = [
  {
    id: 1,
    sku: 'TEX-101',
    barcode: '8941101001012',
    name: 'Combed Cotton Poplin',
    nameBn: 'কম্বড কটন পপলিন',
    category: 'Textiles',
    brand: 'Bengal Loom',
    unit: 'roll',
    hsCode: '5208.21',
    salePrice: 6800,
    costPrice: 5100,
    taxRuleId: 1,
    taxRate: 15,
    trackInventory: true,
    reorderLevel: 10,
    stockQty: 18,
    stockValue: 91800,
  },
  {
    id: 2,
    sku: 'TEX-102',
    barcode: '8941101001029',
    name: 'Raw Linen Fabric',
    nameBn: 'র লিনেন কাপড়',
    category: 'Textiles',
    brand: 'Sonargaon Weave',
    unit: 'bolt',
    hsCode: '5309.11',
    salePrice: 9200,
    costPrice: 7000,
    taxRuleId: 1,
    taxRate: 15,
    trackInventory: true,
    reorderLevel: 8,
    stockQty: 5,
    stockValue: 35000,
  },
  {
    id: 3,
    sku: 'HRD-201',
    barcode: '8941101002019',
    name: 'Brass Zippers',
    nameBn: 'ব্রাস জিপার',
    category: 'Accessories',
    brand: 'KAFCO Hardware',
    unit: 'box',
    hsCode: '9607.11',
    salePrice: 2450,
    costPrice: 1700,
    taxRuleId: 2,
    taxRate: 7.5,
    trackInventory: true,
    reorderLevel: 12,
    stockQty: 0,
    stockValue: 0,
  },
  {
    id: 4,
    sku: 'SRV-301',
    barcode: '8941101003016',
    name: 'Pattern Design Service',
    nameBn: 'প্যাটার্ন ডিজাইন সেবা',
    category: 'Services',
    brand: 'Dhaka Trade Studio',
    unit: 'service',
    hsCode: '9983.14',
    salePrice: 4500,
    costPrice: 0,
    taxRuleId: 2,
    taxRate: 7.5,
    trackInventory: false,
    reorderLevel: 0,
    stockQty: 0,
    stockValue: 0,
  },
];

test('Code-128B encoder produces valid bar count, start/stop sequence, and escaped SVG', () => {
  const enc = encodeCode128B('TEX-101');
  // Start (11) + 7 chars * 11 + checksum (11) + Stop (13) = 112 modules
  assert.equal(enc.totalModules, 11 + 7 * 11 + 11 + 13);
  assert.equal(enc.bars[0], true);
  assert.equal(enc.bars[enc.bars.length - 1], true);

  const svg = renderCode128BSvg('SKU<script>1');
  assert.ok(svg.startsWith('<svg '));
  assert.ok(!svg.includes('<script>'));
  assert.ok(svg.includes('&lt;script&gt;'));
  assert.equal(sanitizeBarcodeValue('  '), 'BEPARI-SKU');
});

test('computeProductMargin calculates profit, margin %, and markup % accurately', () => {
  const m = computeProductMargin(6800, 5100);
  assert.equal(m.profit, 1700);
  assert.equal(m.marginPct, 25);
  assert.equal(m.markupPct, 33.3);

  const zero = computeProductMargin(0, 0);
  assert.equal(zero.marginPct, 0);
});

test('getProductStockStatus classifies in_stock, low, out, and service', () => {
  assert.equal(getProductStockStatus(sampleProducts[0]), 'in_stock');
  assert.equal(getProductStockStatus(sampleProducts[1]), 'low');
  assert.equal(getProductStockStatus(sampleProducts[2]), 'out');
  assert.equal(getProductStockStatus(sampleProducts[3]), 'service');
});

test('filterAndSortProducts filters by query, category, brand, stockStatus and sorts accurately', () => {
  assert.deepEqual(extractCategories(sampleProducts), ['Accessories', 'Services', 'Textiles']);
  assert.deepEqual(extractBrands(sampleProducts), ['Bengal Loom', 'Dhaka Trade Studio', 'KAFCO Hardware', 'Sonargaon Weave']);

  const byBarcode = filterAndSortProducts(sampleProducts, {
    query: '8941101001029',
    category: 'all',
    brand: 'all',
    stockStatus: 'all',
    sortBy: 'name',
  });
  assert.equal(byBarcode.length, 1);
  assert.equal(byBarcode[0].sku, 'TEX-102');

  const lowOnly = filterAndSortProducts(sampleProducts, {
    query: '',
    category: 'all',
    brand: 'all',
    stockStatus: 'low',
    sortBy: 'stock_asc',
  });
  assert.equal(lowOnly.length, 1);
  assert.equal(lowOnly[0].sku, 'TEX-102');

  const byPrice = filterAndSortProducts(sampleProducts, {
    query: '',
    category: 'all',
    brand: 'all',
    stockStatus: 'all',
    sortBy: 'price_desc',
  });
  assert.equal(byPrice[0].sku, 'TEX-102');
});

test('computeDirectoryMetrics aggregates KPI counts, stock value, and avg margin', () => {
  const metrics = computeDirectoryMetrics(sampleProducts);
  assert.equal(metrics.totalProducts, 4);
  assert.equal(metrics.trackedProducts, 3);
  assert.equal(metrics.lowOrOutCount, 2);
  assert.equal(metrics.outOfStockCount, 1);
  assert.equal(metrics.totalStockValue, 126800);
  assert.ok(metrics.avgMarginPct > 40);
});

test('isBelowReorderPoint, computeRecommendedReorderQty, and needs_reorder filter work accurately', () => {
  assert.equal(isBelowReorderPoint(sampleProducts[0]), false); // 18 > 10
  assert.equal(isBelowReorderPoint(sampleProducts[1]), true);  // 5 <= 8 (low)
  assert.equal(isBelowReorderPoint(sampleProducts[2]), true);  // 0 <= 12 (out)
  assert.equal(isBelowReorderPoint(sampleProducts[3]), false); // service

  // 5 current vs 8 reorder -> target max(16, 13, 10) = 16 -> recommended 11
  assert.equal(computeRecommendedReorderQty(sampleProducts[1]), 11);
  // 0 current vs 12 reorder -> target 24 -> recommended 24
  assert.equal(computeRecommendedReorderQty(sampleProducts[2]), 24);

  const needsReorder = filterAndSortProducts(sampleProducts, {
    query: '',
    category: 'all',
    brand: 'all',
    stockStatus: 'needs_reorder',
    sortBy: 'stock_asc',
  });
  assert.deepEqual(
    needsReorder.map((p) => p.sku),
    ['HRD-201', 'TEX-102']
  );
});

test('filterAndSortProducts supports sorting by name, price, and stock level ascending and descending', () => {
  const base = { query: '', category: 'all', brand: 'all', stockStatus: 'all' as const };

  assert.deepEqual(
    filterAndSortProducts(sampleProducts, { ...base, sortBy: 'name' }, 'en').map((p) => p.sku),
    ['HRD-201', 'TEX-101', 'SRV-301', 'TEX-102']
  );
  assert.deepEqual(
    filterAndSortProducts(sampleProducts, { ...base, sortBy: 'name_desc' }, 'en').map((p) => p.sku),
    ['TEX-102', 'SRV-301', 'TEX-101', 'HRD-201']
  );
  assert.deepEqual(
    filterAndSortProducts(sampleProducts, { ...base, sortBy: 'price_asc' }, 'en').map((p) => p.sku),
    ['HRD-201', 'SRV-301', 'TEX-101', 'TEX-102']
  );
  assert.deepEqual(
    filterAndSortProducts(sampleProducts, { ...base, sortBy: 'price_desc' }, 'en').map((p) => p.sku),
    ['TEX-102', 'TEX-101', 'SRV-301', 'HRD-201']
  );
  assert.deepEqual(
    filterAndSortProducts(sampleProducts, { ...base, sortBy: 'stock_asc' }, 'en').map((p) => p.sku),
    ['HRD-201', 'TEX-102', 'TEX-101', 'SRV-301']
  );
  assert.deepEqual(
    filterAndSortProducts(sampleProducts, { ...base, sortBy: 'stock_desc' }, 'en').map((p) => p.sku),
    ['TEX-101', 'TEX-102', 'HRD-201', 'SRV-301']
  );
});

test('normalizeScanCode and findProductByScannedCode match exact barcode, SKU, compact format, and leading-zero EAN/UPC', () => {
  assert.equal(normalizeScanCode('  \n8941101001029\r\t '), '8941101001029');
  assert.equal(findProductByScannedCode(sampleProducts, '') , null);
  assert.equal(findProductByScannedCode(sampleProducts, '   '), null);
  assert.equal(findProductByScannedCode(sampleProducts, 'UNKNOWN-999'), null);

  // Exact barcode
  assert.equal(findProductByScannedCode(sampleProducts, '8941101001029')?.sku, 'TEX-102');
  // Exact SKU (case-insensitive)
  assert.equal(findProductByScannedCode(sampleProducts, 'hrd-201')?.sku, 'HRD-201');
  // Separator-insensitive SKU & barcode
  assert.equal(findProductByScannedCode(sampleProducts, 'TEX 101')?.sku, 'TEX-101');
  assert.equal(findProductByScannedCode(sampleProducts, '8941-1010-02019')?.sku, 'HRD-201');
  // Leading-zero tolerant EAN/UPC
  assert.equal(findProductByScannedCode(sampleProducts, '08941101001012')?.sku, 'TEX-101');
});

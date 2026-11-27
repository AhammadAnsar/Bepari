import type { Customer, Invoice, Product } from '../engine/types';

export interface SearchableWorkspace {
  invoices: Invoice[];
  products: Product[];
  customers: Customer[];
}

export type GlobalSearchResultItem =
  | { type: 'invoice'; id: string; item: Invoice; score: number }
  | { type: 'product'; id: string; item: Product; score: number }
  | { type: 'customer'; id: string; item: Customer; score: number };

export interface GlobalSearchResults {
  invoices: Invoice[];
  products: Product[];
  customers: Customer[];
  flat: GlobalSearchResultItem[];
  totalCount: number;
}

function normalize(value: string | number | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

function scoreFields(query: string, numericQuery: string, fields: { value: string; weight: number }[]): number {
  let best = 0;
  for (const field of fields) {
    if (!field.value) continue;
    if (field.value === query || (numericQuery && field.value === numericQuery)) {
      best = Math.max(best, 100 + field.weight);
    } else if (field.value.startsWith(query)) {
      best = Math.max(best, 70 + field.weight);
    } else if (field.value.includes(query)) {
      best = Math.max(best, 40 + field.weight);
    }
  }
  return best;
}

export function searchWorkspace(
  workspace: SearchableWorkspace,
  rawQuery: string,
  limitPerGroup = 5,
): GlobalSearchResults {
  const query = normalize(rawQuery);
  if (!query) {
    return { invoices: [], products: [], customers: [], flat: [], totalCount: 0 };
  }

  const numericQuery = query.startsWith('#') ? query.slice(1).trim() : query;
  const isNumeric = /^\d+$/.test(numericQuery);

  const scoredInvoices = workspace.invoices
    .map((inv) => {
      const score = scoreFields(query, isNumeric ? numericQuery : '', [
        { value: normalize(inv.id), weight: isNumeric ? 30 : 5 },
        { value: normalize(inv.invoiceNumber), weight: 25 },
        { value: normalize(inv.mushakChallanNo), weight: 20 },
        { value: normalize(inv.customerName), weight: 15 },
        { value: normalize(inv.notes), weight: 5 },
      ]);
      return { item: inv, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.item.id - a.item.id);

  const scoredProducts = workspace.products
    .map((prod) => {
      const score = scoreFields(query, isNumeric ? numericQuery : '', [
        { value: normalize(prod.id), weight: isNumeric ? 30 : 5 },
        { value: normalize(prod.sku), weight: 25 },
        { value: normalize(prod.barcode), weight: 25 },
        { value: normalize(prod.name), weight: 20 },
        { value: normalize(prod.nameBn), weight: 20 },
        { value: normalize(prod.brand), weight: 15 },
        { value: normalize(prod.category), weight: 10 },
        { value: normalize(prod.hsCode), weight: 10 },
      ]);
      return { item: prod, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));

  const scoredCustomers = workspace.customers
    .map((cust) => {
      const score = scoreFields(query, isNumeric ? numericQuery : '', [
        { value: normalize(cust.id), weight: isNumeric ? 30 : 5 },
        { value: normalize(cust.code), weight: 25 },
        { value: normalize(cust.name), weight: 25 },
        { value: normalize(cust.companyName), weight: 20 },
        { value: normalize(cust.phone), weight: 15 },
        { value: normalize(cust.binNumber), weight: 15 },
        { value: normalize(cust.email), weight: 10 },
      ]);
      return { item: cust, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));

  const invoices = scoredInvoices.slice(0, limitPerGroup).map((e) => e.item);
  const products = scoredProducts.slice(0, limitPerGroup).map((e) => e.item);
  const customers = scoredCustomers.slice(0, limitPerGroup).map((e) => e.item);

  const flat: GlobalSearchResultItem[] = [
    ...scoredInvoices.slice(0, limitPerGroup).map((e) => ({
      type: 'invoice' as const,
      id: `invoice-${e.item.id}`,
      item: e.item,
      score: e.score,
    })),
    ...scoredProducts.slice(0, limitPerGroup).map((e) => ({
      type: 'product' as const,
      id: `product-${e.item.id}`,
      item: e.item,
      score: e.score,
    })),
    ...scoredCustomers.slice(0, limitPerGroup).map((e) => ({
      type: 'customer' as const,
      id: `customer-${e.item.id}`,
      item: e.item,
      score: e.score,
    })),
  ];

  return {
    invoices,
    products,
    customers,
    flat,
    totalCount: scoredInvoices.length + scoredProducts.length + scoredCustomers.length,
  };
}

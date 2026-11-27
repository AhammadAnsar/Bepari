import type { Customer } from '../engine/types';

export function normalizeSearchDigits(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

/**
 * Filters customers by name, company, code, phone (ignoring punctuation/spaces),
 * BIN, or address for fast POS Counter and Invoice customer lookup.
 */
export function filterCustomersForPicker(customers: Customer[], query: string): Customer[] {
  const trimmed = query.trim();
  if (!trimmed) return customers;
  const qLower = trimmed.toLowerCase();
  const qDigits = normalizeSearchDigits(trimmed);

  return customers.filter((c) => {
    if (c.name.toLowerCase().includes(qLower)) return true;
    if (c.companyName && c.companyName.toLowerCase().includes(qLower)) return true;
    if (c.code && c.code.toLowerCase().includes(qLower)) return true;
    if (c.address && c.address.toLowerCase().includes(qLower)) return true;
    if (c.binNumber && c.binNumber.toLowerCase().includes(qLower)) return true;
    if (c.phone) {
      if (c.phone.toLowerCase().includes(qLower)) return true;
      if (qDigits.length >= 3 && normalizeSearchDigits(c.phone).includes(qDigits)) return true;
    }
    return false;
  });
}

/**
 * Checks whether the typed query already matches a customer's exact name or phone number.
 */
export function hasExactCustomerMatch(customers: Customer[], query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;
  const qLower = trimmed.toLowerCase();
  const qDigits = normalizeSearchDigits(trimmed);

  return customers.some((c) => {
    if (c.name.trim().toLowerCase() === qLower) return true;
    if (qDigits.length >= 6 && normalizeSearchDigits(c.phone || '').endsWith(qDigits)) return true;
    return false;
  });
}

/**
 * Splits a search query into smart prefill fields when opening the inline
 * "Create New Customer" panel (digits-only queries prefill phone; text prefills name).
 */
export function inferNewCustomerPrefill(query: string): { name: string; phone: string } {
  const trimmed = query.trim();
  if (!trimmed) return { name: '', phone: '' };
  const isPhoneLike = /^[+\d\s\-()]{5,}$/.test(trimmed);
  if (isPhoneLike) {
    return { name: '', phone: trimmed };
  }
  return { name: trimmed, phone: '' };
}

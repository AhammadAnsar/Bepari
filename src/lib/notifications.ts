import { formatDate, formatMoney, formatNumber } from '../engine/format';
import type { Invoice, Language, Product } from '../engine/types';
import type { WorkspacePayload } from './api';

export type NotificationCategory = 'inventory' | 'payment' | 'mushak';
export type NotificationSeverity = 'critical' | 'warning' | 'info';

export interface NotificationItem {
  id: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  titleEn: string;
  titleBn: string;
  detailEn: string;
  detailBn: string;
  metaEn: string;
  metaBn: string;
  actionLabelEn: string;
  actionLabelBn: string;
  invoice?: Invoice;
  product?: Product;
  targetSection: 'purchases' | 'sales' | 'vat';
  targetSubtab?: string;
}

const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTHS_BN = [
  'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
  'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর',
];

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function diffDays(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.round((b - a) / 86400000);
}

/**
 * Under Bangladesh NBR VAT & SD Act 2012, Mushak 9.1 monthly VAT return
 * for a given tax month must be submitted on or before the 15th of the next month.
 */
export function computeNextMushakDeadline(now: Date): {
  deadlineIso: string;
  daysRemaining: number;
  taxPeriodEn: string;
  taxPeriodBn: string;
} {
  const todayIso = toIsoDate(now);
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const day = now.getDate();

  let deadlineYear = year;
  let deadlineMonth = month;
  let periodYear = year;
  let periodMonth = month - 1;

  if (day <= 15) {
    // Current month's 15th is the filing deadline for the previous tax month
    if (periodMonth < 0) {
      periodMonth = 11;
      periodYear = year - 1;
    }
  } else {
    // Next month's 15th is the filing deadline for the current tax month
    deadlineMonth = month + 1;
    if (deadlineMonth > 11) {
      deadlineMonth = 0;
      deadlineYear = year + 1;
    }
    periodMonth = month;
    periodYear = year;
  }

  const deadlineDate = new Date(deadlineYear, deadlineMonth, 15);
  const deadlineIso = toIsoDate(deadlineDate);
  const daysRemaining = diffDays(todayIso, deadlineIso);

  return {
    deadlineIso,
    daysRemaining,
    taxPeriodEn: `${MONTHS_EN[periodMonth]} ${periodYear}`,
    taxPeriodBn: `${MONTHS_BN[periodMonth]} ${formatNumber(periodYear, 'bn').replace(/,/g, '')}`,
  };
}

export function buildNotifications(
  workspace: Pick<WorkspacePayload, 'organization' | 'products' | 'invoices' | 'reports'>,
  now: Date = new Date(),
): NotificationItem[] {
  const items: NotificationItem[] = [];
  const todayIso = toIsoDate(now);
  const sym = workspace.organization.currencySymbol || '৳';

  const moneyEn = (v: number) => formatMoney(v, 'en', sym);
  const moneyBn = (v: number) => formatMoney(v, 'bn', sym);

  // 1. Upcoming Mushak 9.1 Filing Deadline (Bangladesh NBR statutory 15th of month)
  const mushak = computeNextMushakDeadline(now);
  const netVat = workspace.reports.vatReturn.netVatPayable;
  const challans = workspace.reports.vatReturn.challanCount;
  const mushakSeverity: NotificationSeverity =
    mushak.daysRemaining <= 5 ? 'critical' : mushak.daysRemaining <= 15 ? 'warning' : 'info';

  items.push({
    id: `mushak-91-${mushak.deadlineIso}`,
    category: 'mushak',
    severity: mushakSeverity,
    titleEn: `Mushak 9.1 Filing Due (${mushak.taxPeriodEn})`,
    titleBn: `মূসক ৯.১ রিটার্ন দাখিলের সময়সীমা (${mushak.taxPeriodBn})`,
    detailEn:
      netVat > 0
        ? `Net VAT payable ${moneyEn(netVat)} across ${challans} Mushak 6.3 challans. Submit by ${formatDate(mushak.deadlineIso, 'en')}.`
        : `Return period covers ${challans} Mushak 6.3 challans (Net VAT ${moneyEn(netVat)}). Submit by ${formatDate(mushak.deadlineIso, 'en')}.`,
    detailBn:
      netVat > 0
        ? `${formatNumber(challans, 'bn')}টি মূসক ৬.৩ চালানে নিট প্রদেয় মূসক ${moneyBn(netVat)}। শেষ তারিখ ${formatDate(mushak.deadlineIso, 'bn')}।`
        : `${formatNumber(challans, 'bn')}টি মূসক ৬.৩ চালান সমন্বিত (নিট মূসক ${moneyBn(netVat)})। দাখিলের শেষ তারিখ ${formatDate(mushak.deadlineIso, 'bn')}।`,
    metaEn: mushak.daysRemaining === 0 ? 'Due today' : `${mushak.daysRemaining}d left`,
    metaBn: mushak.daysRemaining === 0 ? 'আজই শেষ দিন' : `${formatNumber(mushak.daysRemaining, 'bn')} দিন বাকি`,
    actionLabelEn: 'Open Mushak 9.1',
    actionLabelBn: 'মূসক ৯.১ দেখুন',
    targetSection: 'vat',
    targetSubtab: 'mushak91',
  });

  // 2. Low Inventory Levels
  for (const prod of workspace.products) {
    if (!prod.trackInventory) continue;
    const qty = prod.stockQty ?? 0;
    if (qty <= prod.reorderLevel) {
      const outOfStock = qty <= 0;
      items.push({
        id: `low-stock-${prod.id}`,
        category: 'inventory',
        severity: outOfStock ? 'critical' : 'warning',
        titleEn: outOfStock ? `Out of stock: ${prod.name}` : `Low inventory: ${prod.name}`,
        titleBn: outOfStock
          ? `স্টক শেষ: ${prod.nameBn || prod.name}`
          : `স্টক কম: ${prod.nameBn || prod.name}`,
        detailEn: `${qty} ${prod.unit} remaining (SKU ${prod.sku}, reorder threshold ${prod.reorderLevel}).`,
        detailBn: `অবশিষ্ট ${formatNumber(qty, 'bn')} ${prod.unit} (SKU ${prod.sku}, রিঅর্ডার সীমা ${formatNumber(prod.reorderLevel, 'bn')})।`,
        metaEn: outOfStock ? '0 left' : `${qty} ${prod.unit}`,
        metaBn: outOfStock ? 'স্টক শূন্য' : `${formatNumber(qty, 'bn')} ${prod.unit}`,
        actionLabelEn: 'View Stock',
        actionLabelBn: 'স্টক দেখুন',
        product: prod,
        targetSection: 'purchases',
        targetSubtab: 'inventory',
      });
    }
  }

  // 3. Pending & Overdue Customer Payments
  const unpaidInvoices = workspace.invoices
    .filter((inv) => inv.status !== 'void' && inv.balanceDue > 0.005)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  for (const inv of unpaidInvoices) {
    const daysDelta = diffDays(todayIso, inv.dueDate);
    const isOverdue = daysDelta < 0;
    const severity: NotificationSeverity = isOverdue ? 'critical' : daysDelta <= 7 ? 'warning' : 'info';

    items.push({
      id: `payment-due-${inv.id}`,
      category: 'payment',
      severity,
      titleEn: isOverdue
        ? `Overdue payment: ${inv.invoiceNumber}`
        : `Pending payment: ${inv.invoiceNumber}`,
      titleBn: isOverdue
        ? `মেয়াদোত্তীর্ণ বকেয়া: ${inv.invoiceNumber}`
        : `বকেয়া পেমেন্ট: ${inv.invoiceNumber}`,
      detailEn: `${inv.customerName} owes ${moneyEn(inv.balanceDue)} (due ${formatDate(inv.dueDate, 'en')}).`,
      detailBn: `${inv.customerName}-এর কাছে ${moneyBn(inv.balanceDue)} বকেয়া (তারিখ ${formatDate(inv.dueDate, 'bn')})।`,
      metaEn: isOverdue
        ? `${Math.abs(daysDelta)}d overdue`
        : daysDelta === 0
          ? 'Due today'
          : `Due in ${daysDelta}d`,
      metaBn: isOverdue
        ? `${formatNumber(Math.abs(daysDelta), 'bn')} দিন অতিক্রান্ত`
        : daysDelta === 0
          ? 'আজ নির্ধারিত'
          : `${formatNumber(daysDelta, 'bn')} দিন বাকি`,
      actionLabelEn: 'Receive Payment',
      actionLabelBn: 'পেমেন্ট নিন',
      invoice: inv,
      targetSection: 'sales',
      targetSubtab: 'invoices',
    });
  }

  const severityRank: Record<NotificationSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };

  return items.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}

export function filterNotifications(
  items: NotificationItem[],
  category: 'all' | NotificationCategory,
  dismissedIds: Set<string>,
): NotificationItem[] {
  return items.filter((item) => {
    if (dismissedIds.has(item.id)) return false;
    if (category === 'all') return true;
    return item.category === category;
  });
}

export function countUnreadNotifications(
  items: NotificationItem[],
  readIds: Set<string>,
  dismissedIds: Set<string>,
): number {
  let count = 0;
  for (const item of items) {
    if (!dismissedIds.has(item.id) && !readIds.has(item.id)) {
      count += 1;
    }
  }
  return count;
}

export function getNotificationText(item: NotificationItem, lang: Language) {
  const isBn = lang === 'bn';
  return {
    title: isBn ? item.titleBn : item.titleEn,
    detail: isBn ? item.detailBn : item.detailEn,
    meta: isBn ? item.metaBn : item.metaEn,
    actionLabel: isBn ? item.actionLabelBn : item.actionLabelEn,
  };
}

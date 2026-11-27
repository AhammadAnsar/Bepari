import { formatDate, formatMoney, formatNumber } from '../engine/format';
import type {
  Customer,
  FinancialReportSummary,
  Invoice,
  JournalEntry,
  Language,
  Organization,
  Product,
  Quotation,
  StatementRow,
} from '../engine/types';
import { renderCode128BSvg } from './barcode';
import {
  amountToWords,
  formatDocumentLineSpecs,
  renderCashMemoHtml,
  resolveCashMemoConfig,
  type CashMemoSettings,
  type CashMemoTemplateId,
} from './cashMemoTemplates';
import { computeProductMargin } from './productDirectory';

export type PdfExportSpec =
  | { type: 'invoice'; invoice: Invoice; includeVat?: boolean }
  | { type: 'delivery_challan'; invoice: Invoice }
  | { type: 'quotation'; quotation: Quotation }
  | { type: 'mushak_63'; invoice: Invoice }
  | {
      type: 'pos_receipt';
      invoice: Invoice;
      includeVat?: boolean;
      templateId?: CashMemoTemplateId;
      settings?: CashMemoSettings;
      paymentMethodLabel?: string;
    }
  | { type: 'statement'; customer: Customer; rows: StatementRow[]; closingBalance: number }
  | { type: 'pnl'; reports: FinancialReportSummary }
  | { type: 'balance_sheet'; reports: FinancialReportSummary }
  | { type: 'cash_flow'; reports: FinancialReportSummary }
  | { type: 'trial_balance'; reports: FinancialReportSummary }
  | { type: 'journal_ledger'; journals: JournalEntry[] }
  | { type: 'mushak_91'; reports: FinancialReportSummary }
  | { type: 'mushak_63_register'; invoices: Invoice[] }
  | { type: 'product_catalog'; products: Product[]; filterSummary?: string }
  | { type: 'barcode_labels'; items: { product: Product; copies: number }[] };

export interface RenderedPdfTemplate {
  filename: string;
  widthPx: number;
  pageFormat: 'a4' | [number, number];
  html: string;
}

export function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeFilePart(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'document';
}

function reportHeaderHtml(
  org: Organization,
  lang: Language,
  title: string,
  subtitle: string
): string {
  const isBn = lang === 'bn';
  const orgName = isBn ? org.nameBn || org.name : org.name;
  const generatedDate = formatDate(new Date().toISOString().slice(0, 10), lang);
  const orgInitials = (org.name || org.nameBn || 'OR')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'OR';
  const safeLogo =
    org.logoUrl && (/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(org.logoUrl) || org.logoUrl.startsWith('/src/assets/'))
      ? `<img src="${escapeHtml(org.logoUrl)}" alt="Organization Logo" style="width:42px;height:42px;object-fit:contain;border-radius:8px;border:1px solid #E2E8F0;padding:2px;background:#FFFFFF;flex-shrink:0;" />`
      : `<div style="width:42px;height:42px;border-radius:8px;background:#0F172A;color:#FFFFFF;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;letter-spacing:0.04em;flex-shrink:0;">${escapeHtml(orgInitials)}</div>`;

  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;border-bottom:2px solid #0F172A;padding-bottom:14px;margin-bottom:20px;">
      <div style="display:flex;align-items:flex-start;gap:12px;">
        ${safeLogo}
        <div>
          <div style="font-size:19px;font-weight:700;color:#0F172A;line-height:1.3;">${escapeHtml(orgName)}</div>
          ${org.tagline ? `<div style="font-size:11px;font-weight:600;color:#0F766E;margin-top:2px;">${escapeHtml(org.tagline)}</div>` : ''}
          ${org.proprietorName ? `<div style="font-size:11px;color:#334155;margin-top:2px;">${escapeHtml(org.proprietorName)}</div>` : ''}
          ${org.address ? `<div style="font-size:11px;color:#475569;margin-top:3px;">${escapeHtml(org.address)}</div>` : ''}
          <div style="font-size:11px;color:#475569;margin-top:2px;">
            BIN: <span style="font-weight:600;color:#0F172A;">${escapeHtml(org.binNumber || '—')}</span>
            &nbsp;·&nbsp;
            TIN: <span style="font-weight:600;color:#0F172A;">${escapeHtml(org.tinNumber || '—')}</span>
          </div>
          <div style="font-size:11px;color:#64748B;margin-top:2px;">${[org.phone, org.email, org.website].filter(Boolean).map((v) => escapeHtml(v)).join(' · ')}</div>
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-size:16px;font-weight:700;color:#0F766E;line-height:1.3;">${escapeHtml(title)}</div>
        <div style="font-size:11px;color:#475569;margin-top:3px;">${escapeHtml(subtitle)}</div>
        <div style="font-size:10px;color:#64748B;margin-top:4px;">${isBn ? 'প্রস্তুতির তারিখ' : 'Generated'}: ${escapeHtml(generatedDate)}</div>
      </div>
    </div>
  `;
}

function documentBrandFooterHtml(org: Organization, lang: Language): string {
  const { config, footerBrandLogos } = resolveCashMemoConfig(org.cashMemoSettings, undefined, org, lang);
  const noteHtml = config.footerNote
    ? `<div style="margin-top:14px;font-size:11px;color:#334155;font-weight:500;">${escapeHtml(config.footerNote)}</div>`
    : '';
  const sloganHtml =
    config.showFooterSlogan && config.slogan
      ? `<div style="margin-top:6px;text-align:center;font-size:11px;font-weight:600;color:#0F766E;">${escapeHtml(config.slogan)}</div>`
      : '';
  const logosHtml =
    config.showFooterBrandLogos && footerBrandLogos.length > 0
      ? `<div style="margin-top:12px;padding-top:10px;border-top:1px dashed #CBD5E1;display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;">
           ${footerBrandLogos
             .map(
               (logo) => `
               <div style="display:inline-flex;align-items:center;gap:6px;padding:3px 8px;border:1px solid #E2E8F0;border-radius:6px;background:#FFFFFF;">
                 <img src="${escapeHtml(logo.dataUrl)}" alt="${escapeHtml(logo.name || 'Brand')}" style="height:22px;max-width:78px;object-fit:contain;display:block;" />
                 ${logo.name ? `<span style="font-size:10px;font-weight:600;color:#334155;">${escapeHtml(logo.name)}</span>` : ''}
               </div>`,
             )
             .join('')}
         </div>`
      : '';
  return `${noteHtml}${sloganHtml}${logosHtml}`;
}

function reportFooterHtml(lang: Language): string {
  const isBn = lang === 'bn';
  return `
    <div style="margin-top:28px;padding-top:12px;border-top:1px solid #CBD5E1;display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#64748B;">
      <span>${isBn ? 'বেপারি (Bepari) — ডাবল-এন্ট্রি লেজার ও মূসক সমন্বিত রিপোর্ট' : 'Bepari — Double-Entry Ledger & VAT Reconciled Report'}</span>
      <span>${isBn ? 'সিস্টেম জেনারেটেড পিডিএফ' : 'System Generated PDF'}</span>
    </div>
  `;
}

export function buildPdfTemplate(
  spec: PdfExportSpec,
  org: Organization,
  lang: Language
): RenderedPdfTemplate {
  const isBn = lang === 'bn';
  const money = (v: number) => formatMoney(v, lang, org.currencySymbol);
  const dateTag = new Date().toISOString().slice(0, 10);

  const baseWrap = (inner: string, widthPx = 794) => `
    <div style="width:${widthPx}px;box-sizing:border-box;background:#FFFFFF;color:#0F172A;font-family:'Noto Sans Bengali','IBM Plex Sans',sans-serif;padding:${widthPx < 400 ? '18px 16px' : '34px 38px'};line-height:1.45;">
      ${inner}
    </div>
  `;

  switch (spec.type) {
    case 'invoice': {
      const inv = spec.invoice;
      const { config } = resolveCashMemoConfig(org.cashMemoSettings, undefined, org, lang);
      const includeVat = spec.includeVat ?? true;
      const challanNo = inv.challanNumber || inv.mushakChallanNo || '—';
      const challanDate = formatDate(inv.challanDate || inv.issueDate, lang);

      const rows = (inv.items || [])
        .map((line, idx) => {
          const specsText = formatDocumentLineSpecs(line, config, isBn);
          const grossWithoutVat = Number((line.taxableValue ?? line.quantity * line.unitPrice).toFixed(2));
          const displayLineTotal = includeVat ? line.lineTotal : grossWithoutVat;
          return `
            <tr>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:11px;color:#64748B;vertical-align:top;">${escapeHtml(formatNumber(idx + 1, lang))}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#0F172A;font-weight:500;vertical-align:top;">
                <div>${escapeHtml(line.description)}</div>
                ${specsText ? `<div style="font-size:10px;color:#475569;font-weight:400;margin-top:2px;">${escapeHtml(specsText)}</div>` : ''}
              </td>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;text-align:right;vertical-align:top;">${escapeHtml(formatNumber(line.quantity, lang))}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;text-align:right;vertical-align:top;">${escapeHtml(money(line.unitPrice))}</td>
              ${
                includeVat
                  ? `<td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:11px;text-align:right;color:#475569;vertical-align:top;">${escapeHtml(formatNumber(line.taxRate, lang))}%</td>
                     <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;text-align:right;vertical-align:top;">${escapeHtml(money(line.vatAmount))}</td>`
                  : ''
              }
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;text-align:right;font-weight:600;vertical-align:top;">${escapeHtml(money(displayLineTotal))}</td>
            </tr>
          `;
        })
        .join('');

      const payableTotal = includeVat ? inv.grandTotal : inv.subtotal;
      const paidAmount = Math.min(inv.paidAmount, payableTotal);
      const balanceDue = Number(Math.max(0, payableTotal - paidAmount).toFixed(2));

      const html = baseWrap(`
        ${reportHeaderHtml(
          org,
          lang,
          includeVat
            ? isBn
              ? 'ট্যাক্স ইনভয়েস'
              : 'TAX INVOICE'
            : isBn
              ? 'ইনভয়েস / বিল'
              : 'INVOICE / BILL',
          includeVat
            ? `${inv.invoiceNumber} · ${isBn ? 'মূসক ৬.৩' : 'Mushak 6.3'}: ${inv.mushakChallanNo}`
            : inv.invoiceNumber
        )}

        <div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:14px;font-size:12px;">
          <div style="max-width:55%;">
            <div style="font-size:10px;font-weight:700;color:#64748B;text-transform:uppercase;margin-bottom:4px;">${isBn ? 'ক্রেতা (Bill To)' : 'Bill To'}</div>
            <div style="font-size:14px;font-weight:700;color:#0F172A;">${escapeHtml(inv.customerName)}</div>
            ${inv.customerCompanyName ? `<div style="color:#334155;font-weight:500;margin-top:2px;">${escapeHtml(inv.customerCompanyName)}</div>` : ''}
            ${inv.customerAddress ? `<div style="color:#475569;margin-top:2px;">${escapeHtml(inv.customerAddress)}</div>` : ''}
            ${inv.customerPhone || inv.customerEmail ? `<div style="color:#475569;margin-top:2px;">${[inv.customerPhone, inv.customerEmail].filter(Boolean).map((v) => escapeHtml(v)).join(' · ')}</div>` : ''}
            ${inv.customerBin ? `<div style="color:#475569;margin-top:2px;">BIN: ${escapeHtml(inv.customerBin)}</div>` : ''}
          </div>
          <div style="text-align:right;">
            <div style="margin-bottom:4px;"><span style="color:#64748B;">${isBn ? 'ইস্যু তারিখ' : 'Issue Date'}:</span> <strong>${escapeHtml(formatDate(inv.issueDate, lang))}</strong></div>
            <div style="margin-bottom:4px;"><span style="color:#64748B;">${isBn ? 'পরিশোধের শেষ তারিখ' : 'Due Date'}:</span> <strong>${escapeHtml(formatDate(inv.dueDate, lang))}</strong></div>
            <div><span style="color:#64748B;">${isBn ? 'শাখা' : 'Branch'}:</span> <strong>${escapeHtml((isBn ? inv.branchNameBn || inv.branchName : inv.branchName) || '—')}</strong></div>
            ${inv.branchPhone ? `<div style="font-size:11px;color:#64748B;margin-top:2px;">${escapeHtml(inv.branchPhone)}</div>` : ''}
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;padding:7px 12px;margin-bottom:16px;border:1px solid #CBD5E1;background:#F8FAFC;border-radius:6px;font-size:11px;color:#0F172A;">
          <div><strong>P.O No:</strong> <span style="font-family:'IBM Plex Mono',monospace;font-weight:600;">${escapeHtml(inv.poNumber || '—')}</span></div>
          <div><strong>Challan No:</strong> <span style="font-family:'IBM Plex Mono',monospace;font-weight:600;">${escapeHtml(challanNo)}</span></div>
          <div><strong>Challan Date:</strong> <span style="font-weight:600;">${escapeHtml(challanDate)}</span></div>
        </div>

        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <thead>
            <tr style="background:#F8FAFC;border-top:1px solid #CBD5E1;border-bottom:1px solid #CBD5E1;font-size:11px;color:#475569;">
              <th style="padding:9px 10px;text-align:left;font-weight:600;">#</th>
              <th style="padding:9px 10px;text-align:left;font-weight:600;">${isBn ? 'বিবরণ' : 'Description'}</th>
              <th style="padding:9px 10px;text-align:right;font-weight:600;">${isBn ? 'পরিমাণ' : 'Qty'}</th>
              <th style="padding:9px 10px;text-align:right;font-weight:600;">${isBn ? 'দর' : 'Rate'}</th>
              ${
                includeVat
                  ? `<th style="padding:9px 10px;text-align:right;font-weight:600;">${isBn ? 'মূসক %' : 'VAT %'}</th>
                     <th style="padding:9px 10px;text-align:right;font-weight:600;">${isBn ? 'মূসক' : 'VAT'}</th>`
                  : ''
              }
              <th style="padding:9px 10px;text-align:right;font-weight:600;">${isBn ? 'মোট' : 'Amount'}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;">
          <div style="max-width:48%;font-size:11px;color:#475569;">
            <div style="margin-bottom:8px;">
              <strong style="color:#0F172A;">${isBn ? 'কথায়' : 'In Words'}:</strong> ${escapeHtml(amountToWords(payableTotal, lang))}
            </div>
            ${
              inv.notes
                ? `<div style="font-weight:600;color:#0F172A;margin-bottom:4px;">${isBn ? 'নোট ও শর্তাবলি' : 'Notes & Terms'}</div><div>${escapeHtml(inv.notes)}</div>`
                : ''
            }
          </div>
          <div style="width:270px;font-size:12px;">
            <div style="display:flex;justify-content:space-between;padding:5px 0;color:#475569;">
              <span>${isBn ? 'উপ-মোট মূল্য' : 'Subtotal'}</span>
              <span>${escapeHtml(money(inv.subtotal))}</span>
            </div>
            ${
              includeVat
                ? `<div style="display:flex;justify-content:space-between;padding:5px 0;color:#475569;">
                     <span>${isBn ? 'মোট মূসক (VAT)' : 'Total VAT'}</span>
                     <span>${escapeHtml(money(inv.vatTotal))}</span>
                   </div>`
                : ''
            }
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:1.5px solid #0F172A;font-size:14px;font-weight:700;color:#0F172A;">
              <span>${isBn ? 'সর্বমোট প্রদেয়' : 'Grand Total'}</span>
              <span>${escapeHtml(money(payableTotal))}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:11px;color:#475569;">
              <span>${isBn ? 'পরিশোধিত' : 'Paid'}</span>
              <span>${escapeHtml(money(paidAmount))}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:7px 0;border-top:1px solid #E2E8F0;font-size:13px;font-weight:700;color:#0F766E;">
              <span>${isBn ? 'বকেয়া পরিমাণ' : 'Balance Due'}</span>
              <span>${escapeHtml(money(balanceDue))}</span>
            </div>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:34px;font-size:11px;color:#334155;font-weight:600;">
          <div style="border-top:1px solid #334155;padding-top:5px;width:150px;text-align:center;">${escapeHtml(config.customerSignLabel || (isBn ? 'ক্রেতার স্বাক্ষর' : 'Customer Signature'))}</div>
          <div style="border-top:1px solid #334155;padding-top:5px;width:150px;text-align:center;">${escapeHtml(config.authorizedSignLabel || (isBn ? 'কর্তৃপক্ষের স্বাক্ষর' : 'Authorized Signature'))}</div>
        </div>

        ${documentBrandFooterHtml(org, lang)}
        ${reportFooterHtml(lang)}
      `);

      return {
        filename: `${sanitizeFilePart(inv.invoiceNumber)}${includeVat ? '' : '-no-mushak'}.pdf`,
        widthPx: 794,
        pageFormat: 'a4',
        html,
      };
    }

    case 'delivery_challan': {
      const inv = spec.invoice;
      const { config } = resolveCashMemoConfig(org.cashMemoSettings, undefined, org, lang);
      const challanNo = inv.challanNumber || inv.mushakChallanNo || `CHL-${inv.invoiceNumber}`;
      const challanDate = formatDate(inv.challanDate || inv.issueDate, lang);
      const totalQty = (inv.items || []).reduce((acc, item) => acc + Number(item.quantity || 0), 0);

      const rows = (inv.items || [])
        .map((line, idx) => {
          const specsText = formatDocumentLineSpecs(line, config, isBn);
          return `
            <tr>
              <td style="padding:9px 10px;border-bottom:1px solid #CBD5E1;font-size:11px;color:#475569;text-align:center;vertical-align:top;width:54px;">${escapeHtml(formatNumber(idx + 1, lang))}</td>
              <td style="padding:9px 10px;border-bottom:1px solid #CBD5E1;font-size:12px;color:#0F172A;font-weight:600;vertical-align:top;">
                <div>${escapeHtml(line.description)}</div>
                ${specsText ? `<div style="font-size:11px;color:#475569;font-weight:400;margin-top:2px;">${escapeHtml(specsText)}</div>` : ''}
              </td>
              <td style="padding:9px 10px;border-bottom:1px solid #CBD5E1;font-size:13px;font-weight:700;text-align:right;vertical-align:top;width:120px;">${escapeHtml(formatNumber(line.quantity, lang))}</td>
            </tr>
          `;
        })
        .join('');

      const html = baseWrap(`
        ${reportHeaderHtml(
          org,
          lang,
          isBn ? 'ডেলিভারি চালান (DELIVERY CHALLAN)' : 'DELIVERY CHALLAN',
          `${isBn ? 'চালান নং' : 'Challan No'}: ${challanNo} · ${isBn ? 'মেমো/ইনভয়েস' : 'Invoice Ref'}: ${inv.invoiceNumber}`
        )}

        <div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:14px;font-size:12px;">
          <div style="max-width:55%;">
            <div style="font-size:10px;font-weight:700;color:#64748B;text-transform:uppercase;margin-bottom:4px;">${isBn ? 'ডেলিভারি প্রাপক (Deliver To)' : 'Deliver To'}</div>
            <div style="font-size:14px;font-weight:700;color:#0F172A;">${escapeHtml(inv.customerName)}</div>
            ${inv.customerCompanyName ? `<div style="color:#334155;font-weight:500;margin-top:2px;">${escapeHtml(inv.customerCompanyName)}</div>` : ''}
            ${inv.customerAddress ? `<div style="color:#475569;margin-top:2px;">${escapeHtml(inv.customerAddress)}</div>` : ''}
            ${inv.customerPhone ? `<div style="color:#475569;margin-top:2px;">${isBn ? 'ফোন' : 'Phone'}: ${escapeHtml(inv.customerPhone)}</div>` : ''}
          </div>
          <div style="text-align:right;">
            <div style="margin-bottom:4px;"><span style="color:#64748B;">${isBn ? 'মেমো / বিল নং' : 'Invoice / Memo No'}:</span> <strong>${escapeHtml(inv.invoiceNumber)}</strong></div>
            <div style="margin-bottom:4px;"><span style="color:#64748B;">${isBn ? 'ইস্যু তারিখ' : 'Issue Date'}:</span> <strong>${escapeHtml(formatDate(inv.issueDate, lang))}</strong></div>
            <div><span style="color:#64748B;">${isBn ? 'শাখা / গুদাম' : 'Dispatch Branch'}:</span> <strong>${escapeHtml((isBn ? inv.branchNameBn || inv.branchName : inv.branchName) || '—')}</strong></div>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;padding:8px 12px;margin-bottom:18px;border:1px solid #0F766E;background:#F0FDFA;border-radius:6px;font-size:11px;color:#0F172A;">
          <div><strong>P.O No:</strong> <span style="font-family:'IBM Plex Mono',monospace;font-weight:700;">${escapeHtml(inv.poNumber || '—')}</span></div>
          <div><strong>Challan No:</strong> <span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:#0F766E;">${escapeHtml(challanNo)}</span></div>
          <div><strong>Challan Date:</strong> <span style="font-weight:700;">${escapeHtml(challanDate)}</span></div>
        </div>

        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;border:1px solid #CBD5E1;">
          <thead>
            <tr style="background:#0F172A;color:#FFFFFF;font-size:11px;">
              <th style="padding:9px 10px;text-align:center;font-weight:600;width:54px;">${isBn ? 'ক্রমিক' : 'SL'}</th>
              <th style="padding:9px 10px;text-align:left;font-weight:600;">${isBn ? 'পণ্যের বিবরণ ও স্পেসিফিকেশন' : 'Item Description & Specifications'}</th>
              <th style="padding:9px 10px;text-align:right;font-weight:600;width:120px;">${isBn ? 'পরিমাণ (Qty)' : 'Quantity'}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr style="background:#F8FAFC;font-weight:700;font-size:13px;">
              <td colspan="2" style="padding:10px;text-align:right;border-top:1.5px solid #0F172A;">${isBn ? 'মোট ডেলিভারি পরিমাণ' : 'Total Delivered Quantity'}</td>
              <td style="padding:10px;text-align:right;border-top:1.5px solid #0F172A;color:#0F766E;">${escapeHtml(formatNumber(totalQty, lang))}</td>
            </tr>
          </tfoot>
        </table>

        ${
          inv.notes
            ? `<div style="margin-bottom:20px;padding:10px 12px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;font-size:11px;color:#334155;">
                 <strong style="color:#0F172A;">${isBn ? 'ডেলিভারি নির্দেশনা / নোট:' : 'Delivery Instructions / Notes:'}</strong> ${escapeHtml(inv.notes)}
               </div>`
            : ''
        }

        <div style="font-size:11px;color:#475569;margin-bottom:38px;">
          ${isBn ? 'উপরোক্ত পণ্যসমূহ সঠিক ও অক্ষত অবস্থায় বুঝিয়া পাইলাম।' : 'Received the above goods in good order and condition.'}
        </div>

        <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:36px;font-size:11px;color:#0F172A;font-weight:600;">
          <div style="border-top:1.5px solid #334155;padding-top:5px;width:155px;text-align:center;">${isBn ? 'গ্রহীতার স্বাক্ষর (Received By)' : 'Received By (Signature)'}</div>
          <div style="border-top:1.5px solid #334155;padding-top:5px;width:155px;text-align:center;">${isBn ? 'যাচাইকারী (Checked By)' : 'Checked By'}</div>
          <div style="border-top:1.5px solid #334155;padding-top:5px;width:155px;text-align:center;">${isBn ? 'কর্তৃপক্ষের স্বাক্ষর (Authorized)' : 'Authorized Signature'}</div>
        </div>

        ${documentBrandFooterHtml(org, lang)}
        ${reportFooterHtml(lang)}
      `);

      return {
        filename: `Delivery-Challan-${sanitizeFilePart(challanNo)}.pdf`,
        widthPx: 794,
        pageFormat: 'a4',
        html,
      };
    }

    case 'quotation': {
      const q = spec.quotation;
      const { config } = resolveCashMemoConfig(org.cashMemoSettings, undefined, org, lang);

      const rows = (q.items || [])
        .map((line, idx) => {
          const specsText = formatDocumentLineSpecs(line, config, isBn);
          return `
            <tr>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:11px;color:#64748B;vertical-align:top;">${escapeHtml(formatNumber(idx + 1, lang))}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#0F172A;font-weight:500;vertical-align:top;">
                <div>${escapeHtml(line.description)}</div>
                ${specsText ? `<div style="font-size:10px;color:#475569;font-weight:400;margin-top:2px;">${escapeHtml(specsText)}</div>` : ''}
              </td>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;text-align:right;vertical-align:top;">${escapeHtml(formatNumber(line.quantity, lang))}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;text-align:right;vertical-align:top;">${escapeHtml(money(line.unitPrice))}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:11px;text-align:right;color:#475569;vertical-align:top;">${escapeHtml(formatNumber(line.taxRate, lang))}%</td>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;text-align:right;vertical-align:top;">${escapeHtml(money(line.vatAmount))}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;text-align:right;font-weight:600;vertical-align:top;">${escapeHtml(money(line.lineTotal))}</td>
            </tr>
          `;
        })
        .join('');

      const html = baseWrap(`
        ${reportHeaderHtml(
          org,
          lang,
          isBn ? 'মূল্য প্রস্তাবনা / কোটেশন (QUOTATION)' : 'PRICE QUOTATION',
          `${q.quotationNumber} · ${isBn ? 'মেয়াদ' : 'Valid Until'}: ${formatDate(q.validUntil, lang)}`
        )}

        <div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:16px;font-size:12px;">
          <div style="max-width:55%;">
            <div style="font-size:10px;font-weight:700;color:#64748B;text-transform:uppercase;margin-bottom:4px;">${isBn ? 'গ্রাহক / প্রতিষ্ঠান (Prepared For)' : 'Prepared For'}</div>
            <div style="font-size:14px;font-weight:700;color:#0F172A;">${escapeHtml(q.customerName)}</div>
            ${q.customerCompanyName ? `<div style="color:#334155;font-weight:500;margin-top:2px;">${escapeHtml(q.customerCompanyName)}</div>` : ''}
            ${q.customerAddress ? `<div style="color:#475569;margin-top:2px;">${escapeHtml(q.customerAddress)}</div>` : ''}
            ${q.customerPhone || q.customerEmail ? `<div style="color:#475569;margin-top:2px;">${[q.customerPhone, q.customerEmail].filter(Boolean).map((v) => escapeHtml(v)).join(' · ')}</div>` : ''}
            ${q.customerBin ? `<div style="color:#475569;margin-top:2px;">BIN: ${escapeHtml(q.customerBin)}</div>` : ''}
          </div>
          <div style="text-align:right;">
            <div style="margin-bottom:4px;"><span style="color:#64748B;">${isBn ? 'কোটেশন নং' : 'Quotation No'}:</span> <strong>${escapeHtml(q.quotationNumber)}</strong></div>
            <div style="margin-bottom:4px;"><span style="color:#64748B;">${isBn ? 'ইস্যু তারিখ' : 'Issue Date'}:</span> <strong>${escapeHtml(formatDate(q.issueDate, lang))}</strong></div>
            <div style="margin-bottom:4px;"><span style="color:#64748B;">${isBn ? 'মেয়াদ উত্তীর্ণের তারিখ' : 'Valid Until'}:</span> <strong>${escapeHtml(formatDate(q.validUntil, lang))}</strong></div>
            ${q.poNumber ? `<div style="margin-bottom:4px;"><span style="color:#64748B;">P.O / Ref No:</span> <strong>${escapeHtml(q.poNumber)}</strong></div>` : ''}
            <div><span style="color:#64748B;">${isBn ? 'শাখা' : 'Branch'}:</span> <strong>${escapeHtml((isBn ? q.branchNameBn || q.branchName : q.branchName) || '—')}</strong></div>
          </div>
        </div>

        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <thead>
            <tr style="background:#F8FAFC;border-top:1px solid #CBD5E1;border-bottom:1px solid #CBD5E1;font-size:11px;color:#475569;">
              <th style="padding:9px 10px;text-align:left;font-weight:600;">#</th>
              <th style="padding:9px 10px;text-align:left;font-weight:600;">${isBn ? 'পণ্য বা সেবার বিবরণ' : 'Description'}</th>
              <th style="padding:9px 10px;text-align:right;font-weight:600;">${isBn ? 'পরিমাণ' : 'Qty'}</th>
              <th style="padding:9px 10px;text-align:right;font-weight:600;">${isBn ? 'একক দর' : 'Unit Price'}</th>
              <th style="padding:9px 10px;text-align:right;font-weight:600;">${isBn ? 'মূসক %' : 'VAT %'}</th>
              <th style="padding:9px 10px;text-align:right;font-weight:600;">${isBn ? 'মূসক' : 'VAT'}</th>
              <th style="padding:9px 10px;text-align:right;font-weight:600;">${isBn ? 'মোট' : 'Total'}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;">
          <div style="max-width:50%;font-size:11px;color:#475569;">
            <div style="margin-bottom:8px;">
              <strong style="color:#0F172A;">${isBn ? 'কথায়' : 'In Words'}:</strong> ${escapeHtml(amountToWords(q.grandTotal, lang))}
            </div>
            ${
              q.notes
                ? `<div style="font-weight:600;color:#0F172A;margin-bottom:4px;">${isBn ? 'শর্তাবলি ও নোট' : 'Terms & Conditions'}</div><div>${escapeHtml(q.notes)}</div>`
                : ''
            }
          </div>
          <div style="width:270px;font-size:12px;">
            <div style="display:flex;justify-content:space-between;padding:5px 0;color:#475569;">
              <span>${isBn ? 'উপ-মোট' : 'Subtotal'}</span>
              <span>${escapeHtml(money(q.subtotal))}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:5px 0;color:#475569;">
              <span>${isBn ? 'মোট মূসক (VAT)' : 'Total VAT'}</span>
              <span>${escapeHtml(money(q.vatTotal))}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:1.5px solid #0F172A;font-size:14px;font-weight:700;color:#0F766E;">
              <span>${isBn ? 'সর্বমোট প্রস্তাবিত মূল্য' : 'Total Quoted Amount'}</span>
              <span>${escapeHtml(money(q.grandTotal))}</span>
            </div>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:38px;font-size:11px;color:#334155;font-weight:600;">
          <div style="border-top:1px solid #334155;padding-top:5px;width:165px;text-align:center;">${isBn ? 'গ্রাহকের সম্মতি স্বাক্ষর' : 'Customer Acceptance'}</div>
          <div style="border-top:1px solid #334155;padding-top:5px;width:165px;text-align:center;">${isBn ? 'প্রস্তুতকারীর স্বাক্ষর' : 'Prepared & Authorized By'}</div>
        </div>

        ${documentBrandFooterHtml(org, lang)}
        ${reportFooterHtml(lang)}
      `);

      return {
        filename: `Quotation-${sanitizeFilePart(q.quotationNumber)}.pdf`,
        widthPx: 794,
        pageFormat: 'a4',
        html,
      };
    }

    case 'mushak_63': {
      const inv = spec.invoice;
      const rows = (inv.items || [])
        .map(
          (line, idx) => `
            <tr>
              <td style="border:1px solid #94A3B8;padding:7px;font-size:11px;">${escapeHtml(formatNumber(idx + 1, 'bn'))}</td>
              <td style="border:1px solid #94A3B8;padding:7px;font-size:11px;">${escapeHtml(line.description)}</td>
              <td style="border:1px solid #94A3B8;padding:7px;font-size:11px;text-align:right;">${escapeHtml(formatNumber(line.quantity, 'bn'))}</td>
              <td style="border:1px solid #94A3B8;padding:7px;font-size:11px;text-align:right;">${escapeHtml(formatMoney(line.unitPrice, 'bn', ''))}</td>
              <td style="border:1px solid #94A3B8;padding:7px;font-size:11px;text-align:right;">${escapeHtml(formatMoney(line.taxableValue, 'bn', ''))}</td>
              <td style="border:1px solid #94A3B8;padding:7px;font-size:11px;text-align:right;">${escapeHtml(formatNumber(line.taxRate, 'bn'))}%</td>
              <td style="border:1px solid #94A3B8;padding:7px;font-size:11px;text-align:right;">${escapeHtml(formatMoney(line.vatAmount, 'bn', ''))}</td>
              <td style="border:1px solid #94A3B8;padding:7px;font-size:11px;text-align:right;font-weight:600;">${escapeHtml(formatMoney(line.lineTotal, 'bn', ''))}</td>
            </tr>
          `
        )
        .join('');

      const html = baseWrap(`
        <div style="border:1.5px solid #334155;padding:22px;">
          <div style="text-align:center;border-bottom:1.5px solid #334155;padding-bottom:12px;margin-bottom:14px;">
            <div style="font-size:11px;color:#475569;">গণপ্রজাতন্ত্রী বাংলাদেশ সরকার · জাতীয় রাজস্ব বোর্ড (NBR)</div>
            <div style="font-size:18px;font-weight:700;color:#0F172A;margin-top:4px;">কর চালানপত্র · মূসক-৬.৩</div>
            <div style="font-size:10px;color:#475569;margin-top:2px;">[বিধি ৪০ এর উপ-বিধি (১) এর দফা (গ) ও দফা (চ) দ্রষ্টব্য]</div>
          </div>

          <div style="display:flex;justify-content:space-between;gap:20px;font-size:11px;border-bottom:1px solid #CBD5E1;padding-bottom:12px;margin-bottom:14px;">
            <div style="width:52%;">
              <div style="margin-bottom:3px;"><span style="color:#64748B;">নিবন্ধিত ব্যক্তির নাম:</span> <strong>${escapeHtml(org.nameBn || org.name)}</strong></div>
              <div style="margin-bottom:3px;"><span style="color:#64748B;">নিবন্ধিত ব্যক্তির বিআইএন (BIN):</span> <strong>${escapeHtml(org.binNumber)}</strong></div>
              <div><span style="color:#64748B;">চালানপত্র ইস্যুর ঠিকানা:</span> ${escapeHtml(org.address)}</div>
            </div>
            <div style="width:45%;">
              <div style="margin-bottom:3px;"><span style="color:#64748B;">চালানপত্র নম্বর:</span> <strong>${escapeHtml(inv.mushakChallanNo)}</strong></div>
              <div style="margin-bottom:3px;"><span style="color:#64748B;">ইস্যুর তারিখ:</span> ${escapeHtml(formatDate(inv.issueDate, 'bn'))}</div>
              <div style="margin-bottom:3px;"><span style="color:#64748B;">ক্রেতার নাম:</span> <strong>${escapeHtml(inv.customerName)}</strong></div>
              <div><span style="color:#64748B;">ক্রেতার বিআইএন:</span> ${escapeHtml(inv.customerBin || 'প্রযোজ্য নয়')}</div>
            </div>
          </div>

          <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
            <thead>
              <tr style="background:#F8FAFC;font-size:10px;color:#0F172A;">
                <th style="border:1px solid #94A3B8;padding:7px;text-align:left;">ক্রমিক</th>
                <th style="border:1px solid #94A3B8;padding:7px;text-align:left;">পণ্য বা সেবার বর্ণনা</th>
                <th style="border:1px solid #94A3B8;padding:7px;text-align:right;">পরিমাণ</th>
                <th style="border:1px solid #94A3B8;padding:7px;text-align:right;">একক মূল্য (টাকা)</th>
                <th style="border:1px solid #94A3B8;padding:7px;text-align:right;">মোট মূল্য (টাকা)</th>
                <th style="border:1px solid #94A3B8;padding:7px;text-align:right;">মূসকের হার (%)</th>
                <th style="border:1px solid #94A3B8;padding:7px;text-align:right;">মূসকের পরিমাণ (টাকা)</th>
                <th style="border:1px solid #94A3B8;padding:7px;text-align:right;">সকল করসহ মূল্য</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr style="background:#F8FAFC;font-weight:700;font-size:11px;">
                <td colspan="4" style="border:1px solid #94A3B8;padding:8px;text-align:right;">সর্বমোট</td>
                <td style="border:1px solid #94A3B8;padding:8px;text-align:right;">${escapeHtml(formatMoney(inv.subtotal, 'bn', ''))}</td>
                <td style="border:1px solid #94A3B8;padding:8px;"></td>
                <td style="border:1px solid #94A3B8;padding:8px;text-align:right;">${escapeHtml(formatMoney(inv.vatTotal, 'bn', ''))}</td>
                <td style="border:1px solid #94A3B8;padding:8px;text-align:right;">${escapeHtml(formatMoney(inv.grandTotal, 'bn', '৳'))}</td>
              </tr>
            </tfoot>
          </table>

          <div style="display:flex;justify-content:space-between;align-items:flex-end;padding-top:26px;font-size:11px;color:#475569;">
            <div>
              <div style="border-top:1px solid #475569;padding-top:5px;width:200px;">প্রতিষ্ঠান কর্তৃপক্ষের স্বাক্ষর ও সিল</div>
            </div>
            <div style="text-align:right;">
              <div>সিস্টেম জেনারেটেড মূসক ৬.৩ চালান</div>
              <div style="font-size:10px;color:#64748B;">Ref: ${escapeHtml(inv.invoiceNumber)}</div>
            </div>
          </div>
        </div>
      `);

      return {
        filename: `${sanitizeFilePart(inv.mushakChallanNo || `Mushak-6.3-${inv.invoiceNumber}`)}.pdf`,
        widthPx: 794,
        pageFormat: 'a4',
        html,
      };
    }

    case 'pos_receipt': {
      const inv = spec.invoice;
      const { config } = resolveCashMemoConfig(
        spec.settings ?? org.cashMemoSettings,
        spec.templateId,
        org,
        lang
      );
      const includeVat = spec.includeVat ?? config.defaultIncludeVat;
      const memoHtml = renderCashMemoHtml(inv, org, lang, {
        includeVat,
        templateId: spec.templateId,
        settings: spec.settings,
        paymentMethodLabel: spec.paymentMethodLabel,
      });

      const html = `
        <div style="width:760px;box-sizing:border-box;background:#FFFFFF;padding:20px;display:flex;justify-content:center;">
          ${memoHtml}
        </div>
      `;

      const vatSuffix = includeVat ? 'mushak' : 'no-mushak';
      return {
        filename: `Cash-Memo-${sanitizeFilePart(inv.invoiceNumber)}-${vatSuffix}.pdf`,
        widthPx: 760,
        pageFormat: 'a4',
        html,
      };
    }

    case 'statement': {
      const rowsHtml = spec.rows
        .map(
          (r) => `
            <tr>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:11px;color:#475569;white-space:nowrap;">${escapeHtml(r.date ? formatDate(r.date, lang) : '—')}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:11px;font-weight:600;">${escapeHtml(r.reference)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;">${escapeHtml(r.description)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;text-align:right;">${escapeHtml(r.debit > 0 ? money(r.debit) : '—')}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;text-align:right;color:#047857;">${escapeHtml(r.credit > 0 ? money(r.credit) : '—')}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;text-align:right;font-weight:600;">${escapeHtml(money(r.runningBalance))}</td>
            </tr>
          `
        )
        .join('');

      const html = baseWrap(`
        ${reportHeaderHtml(
          org,
          lang,
          isBn ? 'কাস্টমার লেজার স্টেটমেন্ট' : 'CUSTOMER STATEMENT',
          spec.customer.companyName ? `${spec.customer.name} (${spec.customer.companyName})` : spec.customer.name
        )}

        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <thead>
            <tr style="background:#F8FAFC;border-top:1px solid #CBD5E1;border-bottom:1px solid #CBD5E1;font-size:11px;color:#475569;">
              <th style="padding:9px 10px;text-align:left;font-weight:600;">${isBn ? 'তারিখ' : 'Date'}</th>
              <th style="padding:9px 10px;text-align:left;font-weight:600;">${isBn ? 'রেফারেন্স' : 'Reference'}</th>
              <th style="padding:9px 10px;text-align:left;font-weight:600;">${isBn ? 'বিবরণ' : 'Description'}</th>
              <th style="padding:9px 10px;text-align:right;font-weight:600;">${isBn ? 'ডেবিট (বিল)' : 'Debit'}</th>
              <th style="padding:9px 10px;text-align:right;font-weight:600;">${isBn ? 'ক্রেডিট (জমা)' : 'Credit'}</th>
              <th style="padding:9px 10px;text-align:right;font-weight:600;">${isBn ? 'চলতি জের' : 'Running Balance'}</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>

        <div style="display:flex;justify-content:flex-end;">
          <div style="width:260px;border-top:2px solid #0F172A;padding-top:10px;display:flex;justify-content:space-between;font-size:14px;font-weight:700;">
            <span>${isBn ? 'সমাপনী পাওনা' : 'Closing Balance'}</span>
            <span style="color:#0F766E;">${escapeHtml(money(spec.closingBalance))}</span>
          </div>
        </div>

        ${reportFooterHtml(lang)}
      `);

      return {
        filename: `Statement-${sanitizeFilePart(spec.customer.name)}-${dateTag}.pdf`,
        widthPx: 794,
        pageFormat: 'a4',
        html,
      };
    }

    case 'pnl': {
      const { profitAndLoss } = spec.reports;
      const revRows = profitAndLoss.revenue
        .map(
          (r) => `
            <tr>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:11px;color:#64748B;width:80px;">${escapeHtml(r.code)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;">${escapeHtml(isBn ? r.nameBn : r.name)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;text-align:right;font-weight:600;">${escapeHtml(money(r.amount))}</td>
            </tr>
          `
        )
        .join('');

      const expRows = profitAndLoss.expenses
        .map(
          (ex) => `
            <tr>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:11px;color:#64748B;width:80px;">${escapeHtml(ex.code)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;">${escapeHtml(isBn ? ex.nameBn : ex.name)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;text-align:right;font-weight:600;">${escapeHtml(money(ex.amount))}</td>
            </tr>
          `
        )
        .join('');

      const html = baseWrap(`
        ${reportHeaderHtml(
          org,
          lang,
          isBn ? 'লাভ-ক্ষতি বিবরণী (Profit & Loss)' : 'PROFIT & LOSS STATEMENT',
          isBn ? 'পোস্টেড ডাবল-এন্ট্রি লেজার থেকে সরাসরি প্রস্তুতকৃত' : 'Computed live from posted double-entry general ledger'
        )}

        <div style="font-size:12px;font-weight:700;color:#475569;margin-bottom:6px;">${isBn ? 'আয় (Revenue)' : 'Revenue'}</div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
          <tbody>
            ${revRows || `<tr><td colspan="3" style="padding:10px;color:#64748B;font-size:11px;">${isBn ? 'কোনো আয় লিপিবদ্ধ নেই' : 'No revenue posted'}</td></tr>`}
          </tbody>
          <tfoot>
            <tr style="background:#F8FAFC;font-weight:700;font-size:12px;">
              <td colspan="2" style="padding:9px 10px;border-top:1px solid #CBD5E1;">${isBn ? 'মোট আয়' : 'Total Revenue'}</td>
              <td style="padding:9px 10px;border-top:1px solid #CBD5E1;text-align:right;">${escapeHtml(money(profitAndLoss.totalRevenue))}</td>
            </tr>
          </tfoot>
        </table>

        <div style="font-size:12px;font-weight:700;color:#475569;margin-bottom:6px;">${isBn ? 'ব্যয় ও বিক্রীত পণ্যের খরচ (COGS & Expenses)' : 'Cost of Goods Sold & Operating Expenses'}</div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <tbody>
            ${expRows || `<tr><td colspan="3" style="padding:10px;color:#64748B;font-size:11px;">${isBn ? 'কোনো ব্যয় লিপিবদ্ধ নেই' : 'No expenses posted'}</td></tr>`}
          </tbody>
          <tfoot>
            <tr style="background:#F8FAFC;font-weight:700;font-size:12px;">
              <td colspan="2" style="padding:9px 10px;border-top:1px solid #CBD5E1;">${isBn ? 'মোট ব্যয়' : 'Total Expenses'}</td>
              <td style="padding:9px 10px;border-top:1px solid #CBD5E1;text-align:right;">${escapeHtml(money(profitAndLoss.totalExpenses))}</td>
            </tr>
          </tfoot>
        </table>

        <div style="border-top:2px solid #0F172A;padding-top:12px;display:flex;justify-content:space-between;font-size:16px;font-weight:700;">
          <span>${isBn ? 'নিট মুনাফা / (ক্ষতি)' : 'Net Profit / (Loss)'}</span>
          <span style="color:${profitAndLoss.netProfit >= 0 ? '#047857' : '#BE123C'};">${escapeHtml(money(profitAndLoss.netProfit))}</span>
        </div>

        ${reportFooterHtml(lang)}
      `);

      return {
        filename: `Profit-and-Loss-${dateTag}.pdf`,
        widthPx: 794,
        pageFormat: 'a4',
        html,
      };
    }

    case 'balance_sheet': {
      const { balanceSheet } = spec.reports;
      const renderRows = (items: { code: string; name: string; nameBn: string; amount: number }[]) =>
        items
          .map(
            (item) => `
              <tr>
                <td style="padding:7px 10px;border-bottom:1px solid #E2E8F0;font-size:11px;color:#64748B;width:72px;">${escapeHtml(item.code)}</td>
                <td style="padding:7px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;">${escapeHtml(isBn ? item.nameBn : item.name)}</td>
                <td style="padding:7px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;text-align:right;font-weight:600;">${escapeHtml(money(item.amount))}</td>
              </tr>
            `
          )
          .join('');

      const html = baseWrap(`
        ${reportHeaderHtml(
          org,
          lang,
          isBn ? 'ব্যালেন্স শিট (Balance Sheet)' : 'BALANCE SHEET',
          isBn ? 'সম্পদ = দায় + মালিকানা স্বত্ব' : 'Assets = Liabilities + Equity'
        )}

        <div style="font-size:13px;font-weight:700;color:#0F172A;margin-bottom:6px;">${isBn ? 'সম্পদ (Assets)' : 'Assets'}</div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
          <tbody>${renderRows(balanceSheet.assets)}</tbody>
          <tfoot>
            <tr style="background:#F8FAFC;font-weight:700;font-size:13px;">
              <td colspan="2" style="padding:9px 10px;border-top:2px solid #0F172A;">${isBn ? 'মোট সম্পদ' : 'Total Assets'}</td>
              <td style="padding:9px 10px;border-top:2px solid #0F172A;text-align:right;">${escapeHtml(money(balanceSheet.totalAssets))}</td>
            </tr>
          </tfoot>
        </table>

        <div style="font-size:13px;font-weight:700;color:#0F172A;margin-bottom:6px;">${isBn ? 'দায় (Liabilities)' : 'Liabilities'}</div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
          <tbody>${renderRows(balanceSheet.liabilities)}</tbody>
          <tfoot>
            <tr style="background:#F8FAFC;font-weight:700;font-size:12px;">
              <td colspan="2" style="padding:8px 10px;border-top:1px solid #CBD5E1;">${isBn ? 'মোট দায়' : 'Total Liabilities'}</td>
              <td style="padding:8px 10px;border-top:1px solid #CBD5E1;text-align:right;">${escapeHtml(money(balanceSheet.totalLiabilities))}</td>
            </tr>
          </tfoot>
        </table>

        <div style="font-size:13px;font-weight:700;color:#0F172A;margin-bottom:6px;">${isBn ? 'মালিকানা স্বত্ব (Equity)' : 'Equity'}</div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
          <tbody>
            ${renderRows(balanceSheet.equity)}
            <tr>
              <td style="padding:7px 10px;border-bottom:1px solid #E2E8F0;font-size:11px;color:#64748B;">—</td>
              <td style="padding:7px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;">${isBn ? 'চলতি নিট মুনাফা (Retained Earnings)' : 'Current Period Net Profit'}</td>
              <td style="padding:7px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;text-align:right;font-weight:600;">${escapeHtml(money(balanceSheet.retainedEarnings))}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr style="background:#F8FAFC;font-weight:700;font-size:13px;">
              <td colspan="2" style="padding:9px 10px;border-top:2px solid #0F172A;">${isBn ? 'মোট দায় ও মালিকানা স্বত্ব' : 'Total Liabilities & Equity'}</td>
              <td style="padding:9px 10px;border-top:2px solid #0F172A;text-align:right;color:#0F766E;">${escapeHtml(money(balanceSheet.totalLiabilities + balanceSheet.totalEquity))}</td>
            </tr>
          </tfoot>
        </table>

        ${reportFooterHtml(lang)}
      `);

      return {
        filename: `Balance-Sheet-${dateTag}.pdf`,
        widthPx: 794,
        pageFormat: 'a4',
        html,
      };
    }

    case 'cash_flow': {
      const { cashFlow } = spec.reports;
      const html = baseWrap(`
        ${reportHeaderHtml(
          org,
          lang,
          isBn ? 'ক্যাশ ফ্লো বিবরণী (Cash Flow)' : 'CASH FLOW STATEMENT',
          isBn ? 'নগদ, ব্যাংক ও MFS (বিকাশ/নগদ/SSLCommerz) প্রবাহ' : 'Cash, Bank & MFS Inflows and Outflows'
        )}

        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px;">
          <tbody>
            <tr>
              <td style="padding:12px 10px;border-bottom:1px solid #E2E8F0;">${isBn ? 'মোট নগদ, ব্যাংক ও MFS জমা (Inflows)' : 'Cash, Bank & MFS Inflows'}</td>
              <td style="padding:12px 10px;border-bottom:1px solid #E2E8F0;text-align:right;font-weight:600;color:#047857;">${escapeHtml(money(cashFlow.operatingInflows))}</td>
            </tr>
            <tr>
              <td style="padding:12px 10px;border-bottom:1px solid #E2E8F0;">${isBn ? 'মোট নগদ ও ব্যাংক ব্যয় (Outflows)' : 'Cash & Bank Outflows'}</td>
              <td style="padding:12px 10px;border-bottom:1px solid #E2E8F0;text-align:right;font-weight:600;color:#BE123C;">(${escapeHtml(money(cashFlow.operatingOutflows))})</td>
            </tr>
          </tbody>
          <tfoot>
            <tr style="background:#F8FAFC;font-weight:700;font-size:15px;">
              <td style="padding:14px 10px;border-top:2px solid #0F172A;">${isBn ? 'সমাপনী নগদ ও ব্যাংক স্থিতি' : 'Ending Cash & Bank Balance'}</td>
              <td style="padding:14px 10px;border-top:2px solid #0F172A;text-align:right;color:#0F766E;">${escapeHtml(money(cashFlow.endingCashBalance))}</td>
            </tr>
          </tfoot>
        </table>

        ${reportFooterHtml(lang)}
      `);

      return {
        filename: `Cash-Flow-${dateTag}.pdf`,
        widthPx: 794,
        pageFormat: 'a4',
        html,
      };
    }

    case 'trial_balance': {
      const { trialBalance } = spec.reports;
      const rowsHtml = trialBalance.rows
        .map(
          (r) => `
            <tr>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:11px;color:#64748B;">${escapeHtml(r.accountCode)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;font-weight:500;">${escapeHtml(isBn ? r.accountNameBn : r.accountName)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:11px;color:#475569;text-transform:capitalize;">${escapeHtml(r.accountType)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;text-align:right;">${escapeHtml(r.debit > 0 ? money(r.debit) : '—')}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;text-align:right;">${escapeHtml(r.credit > 0 ? money(r.credit) : '—')}</td>
            </tr>
          `
        )
        .join('');

      const html = baseWrap(`
        ${reportHeaderHtml(
          org,
          lang,
          isBn ? 'রেওয়ামিল (Trial Balance)' : 'TRIAL BALANCE',
          trialBalance.isBalanced
            ? isBn
              ? 'সমন্বিত (মোট ডেবিট = মোট ক্রেডিট)'
              : 'Balanced (Total Debit = Total Credit)'
            : isBn
              ? 'অসমন্বিত'
              : 'Unbalanced'
        )}

        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <thead>
            <tr style="background:#F8FAFC;border-top:1px solid #CBD5E1;border-bottom:1px solid #CBD5E1;font-size:11px;color:#475569;">
              <th style="padding:9px 10px;text-align:left;font-weight:600;">${isBn ? 'কোড' : 'Code'}</th>
              <th style="padding:9px 10px;text-align:left;font-weight:600;">${isBn ? 'হিসাবের শিরোনাম' : 'Account'}</th>
              <th style="padding:9px 10px;text-align:left;font-weight:600;">${isBn ? 'ধরন' : 'Type'}</th>
              <th style="padding:9px 10px;text-align:right;font-weight:600;">${isBn ? 'ডেবিট' : 'Debit'}</th>
              <th style="padding:9px 10px;text-align:right;font-weight:600;">${isBn ? 'ক্রেডিট' : 'Credit'}</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
          <tfoot>
            <tr style="background:#F8FAFC;font-weight:700;font-size:13px;">
              <td colspan="3" style="padding:10px;border-top:2px solid #0F172A;text-align:right;">${isBn ? 'সর্বমোট' : 'Total'}</td>
              <td style="padding:10px;border-top:2px solid #0F172A;text-align:right;">${escapeHtml(money(trialBalance.totalDebit))}</td>
              <td style="padding:10px;border-top:2px solid #0F172A;text-align:right;">${escapeHtml(money(trialBalance.totalCredit))}</td>
            </tr>
          </tfoot>
        </table>

        ${reportFooterHtml(lang)}
      `);

      return {
        filename: `Trial-Balance-${dateTag}.pdf`,
        widthPx: 794,
        pageFormat: 'a4',
        html,
      };
    }

    case 'journal_ledger': {
      const blocks = spec.journals
        .map(
          (je) => `
            <div style="border:1px solid #CBD5E1;border-radius:6px;margin-bottom:12px;overflow:hidden;">
              <div style="background:#F8FAFC;padding:7px 10px;border-bottom:1px solid #CBD5E1;font-size:11px;display:flex;justify-content:space-between;">
                <span><strong>${escapeHtml(je.entryNumber)}</strong> · ${escapeHtml(formatDate(je.entryDate, lang))} · ${escapeHtml(je.description)}</span>
                <span style="font-weight:600;color:${je.status === 'reversed' ? '#B45309' : '#047857'};">${escapeHtml(je.status.toUpperCase())}</span>
              </div>
              <table style="width:100%;border-collapse:collapse;font-size:11px;">
                <tbody>
                  ${je.lines
                    .map(
                      (l) => `
                        <tr>
                          <td style="padding:6px 10px;border-bottom:1px solid #F1F5F9;width:65px;color:#64748B;">${escapeHtml(l.accountCode)}</td>
                          <td style="padding:6px 10px;border-bottom:1px solid #F1F5F9;font-weight:500;">${escapeHtml(l.accountName)}</td>
                          <td style="padding:6px 10px;border-bottom:1px solid #F1F5F9;color:#64748B;">${escapeHtml(l.memo)}</td>
                          <td style="padding:6px 10px;border-bottom:1px solid #F1F5F9;text-align:right;width:110px;">${escapeHtml(l.debit > 0 ? money(l.debit) : '')}</td>
                          <td style="padding:6px 10px;border-bottom:1px solid #F1F5F9;text-align:right;width:110px;">${escapeHtml(l.credit > 0 ? money(l.credit) : '')}</td>
                        </tr>
                      `
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
          `
        )
        .join('');

      const html = baseWrap(`
        ${reportHeaderHtml(
          org,
          lang,
          isBn ? 'অপরিবর্তনীয় ডাবল-এন্ট্রি জার্নাল লেজার' : 'DOUBLE-ENTRY JOURNAL LEDGER',
          isBn ? `মোট এন্ট্রি: ${formatNumber(spec.journals.length, 'bn')}` : `${spec.journals.length} Posted Journal Entries`
        )}
        ${blocks}
        ${reportFooterHtml(lang)}
      `);

      return {
        filename: `Journal-Ledger-${dateTag}.pdf`,
        widthPx: 794,
        pageFormat: 'a4',
        html,
      };
    }

    case 'mushak_91': {
      const { vatReturn } = spec.reports;
      const html = baseWrap(`
        ${reportHeaderHtml(
          org,
          lang,
          isBn ? 'মূসক-৯.১ মাসিক রিটার্ন ওয়ার্কশিট' : 'MUSHAK 9.1 VAT RETURN WORKSHEET',
          isBn
            ? `মোট ইস্যুকৃত মূসক ৬.৩ চালান: ${formatNumber(vatReturn.challanCount, 'bn')}`
            : `${vatReturn.challanCount} Mushak 6.3 Challans Issued`
        )}

        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <thead>
            <tr style="background:#F8FAFC;border-top:1px solid #CBD5E1;border-bottom:1px solid #CBD5E1;font-size:11px;color:#475569;">
              <th style="padding:9px 10px;text-align:left;font-weight:600;">${isBn ? 'নোট' : 'Note'}</th>
              <th style="padding:9px 10px;text-align:left;font-weight:600;">${isBn ? 'বিবরণ' : 'Return Line Item'}</th>
              <th style="padding:9px 10px;text-align:right;font-weight:600;">${isBn ? 'মূল্য (ক)' : 'Value (A)'}</th>
              <th style="padding:9px 10px;text-align:right;font-weight:600;">${isBn ? 'মূসক (খ)' : 'VAT (B)'}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:10px;border-bottom:1px solid #E2E8F0;font-size:11px;color:#64748B;">Part 3 · Note 4</td>
              <td style="padding:10px;border-bottom:1px solid #E2E8F0;font-size:12px;">${isBn ? 'আদর্শ ও হ্রাসকৃত হারে সরবরাহ (মূসক ৬.২/৬.৩)' : 'Standard & Truncated Rated Supplies (Sales Register 6.2)'}</td>
              <td style="padding:10px;border-bottom:1px solid #E2E8F0;font-size:12px;text-align:right;">${escapeHtml(money(vatReturn.taxableSales))}</td>
              <td style="padding:10px;border-bottom:1px solid #E2E8F0;font-size:12px;text-align:right;font-weight:600;">${escapeHtml(money(vatReturn.outputVat))}</td>
            </tr>
            <tr>
              <td style="padding:10px;border-bottom:1px solid #E2E8F0;font-size:11px;color:#64748B;">Part 4 · Note 14</td>
              <td style="padding:10px;border-bottom:1px solid #E2E8F0;font-size:12px;">${isBn ? 'স্থানীয় ক্রয় ও উপকরণ কর রেয়াত (মূসক ৬.১)' : 'Local Purchases & Input VAT Credit (Purchase Register 6.1)'}</td>
              <td style="padding:10px;border-bottom:1px solid #E2E8F0;font-size:12px;text-align:right;">${escapeHtml(money(vatReturn.taxablePurchases))}</td>
              <td style="padding:10px;border-bottom:1px solid #E2E8F0;font-size:12px;text-align:right;font-weight:600;color:#047857;">(${escapeHtml(money(vatReturn.inputVat))})</td>
            </tr>
            <tr>
              <td style="padding:10px;border-bottom:1px solid #E2E8F0;font-size:11px;color:#64748B;">Part 5 · SD</td>
              <td style="padding:10px;border-bottom:1px solid #E2E8F0;font-size:12px;">${isBn ? 'সম্পূরক শুল্ক (SD)' : 'Supplementary Duty (SD)'}</td>
              <td style="padding:10px;border-bottom:1px solid #E2E8F0;font-size:12px;text-align:right;">—</td>
              <td style="padding:10px;border-bottom:1px solid #E2E8F0;font-size:12px;text-align:right;">${escapeHtml(money(vatReturn.sdPayable))}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr style="background:#F8FAFC;font-weight:700;font-size:13px;">
              <td style="padding:12px 10px;border-top:2px solid #0F172A;">Part 7 · Net</td>
              <td style="padding:12px 10px;border-top:2px solid #0F172A;">${isBn ? 'ট্রেজারি জমার জন্য নিট প্রদেয় মূসক' : 'Net Payable VAT for Treasury Deposit'}</td>
              <td style="padding:12px 10px;border-top:2px solid #0F172A;"></td>
              <td style="padding:12px 10px;border-top:2px solid #0F172A;text-align:right;color:#0F766E;">${escapeHtml(money(vatReturn.netVatPayable + vatReturn.sdPayable))}</td>
            </tr>
          </tfoot>
        </table>

        ${reportFooterHtml(lang)}
      `);

      return {
        filename: `Mushak-9.1-Return-${dateTag}.pdf`,
        widthPx: 794,
        pageFormat: 'a4',
        html,
      };
    }

    case 'mushak_63_register': {
      const rowsHtml = spec.invoices
        .map(
          (inv) => `
            <tr>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:11px;font-weight:600;">${escapeHtml(inv.mushakChallanNo)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;">${escapeHtml(inv.customerName)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:11px;color:#475569;white-space:nowrap;">${escapeHtml(formatDate(inv.issueDate, lang))}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;text-align:right;">${escapeHtml(money(inv.subtotal))}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;text-align:right;color:#0F766E;font-weight:600;">${escapeHtml(money(inv.vatTotal))}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;text-align:right;font-weight:600;">${escapeHtml(money(inv.grandTotal))}</td>
            </tr>
          `
        )
        .join('');

      const html = baseWrap(`
        ${reportHeaderHtml(
          org,
          lang,
          isBn ? 'মূসক-৬.৩ চালান রেজিস্টার' : 'MUSHAK 6.3 CHALLAN REGISTER',
          isBn ? `মোট চালান: ${formatNumber(spec.invoices.length, 'bn')}` : `${spec.invoices.length} Challans`
        )}
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <thead>
            <tr style="background:#F8FAFC;border-top:1px solid #CBD5E1;border-bottom:1px solid #CBD5E1;font-size:11px;color:#475569;">
              <th style="padding:9px 10px;text-align:left;font-weight:600;">${isBn ? 'মূসক ৬.৩ নম্বর' : 'Mushak 6.3 No.'}</th>
              <th style="padding:9px 10px;text-align:left;font-weight:600;">${isBn ? 'কাস্টমার' : 'Customer'}</th>
              <th style="padding:9px 10px;text-align:left;font-weight:600;">${isBn ? 'তারিখ' : 'Date'}</th>
              <th style="padding:9px 10px;text-align:right;font-weight:600;">${isBn ? 'উপ-মোট' : 'Subtotal'}</th>
              <th style="padding:9px 10px;text-align:right;font-weight:600;">${isBn ? 'মূসক' : 'VAT'}</th>
              <th style="padding:9px 10px;text-align:right;font-weight:600;">${isBn ? 'সর্বমোট' : 'Total'}</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        ${reportFooterHtml(lang)}
      `);

      return {
        filename: `Mushak-6.3-Register-${dateTag}.pdf`,
        widthPx: 794,
        pageFormat: 'a4',
        html,
      };
    }

    case 'product_catalog': {
      const totalStockVal = spec.products.reduce((acc, p) => acc + (p.trackInventory ? (p.stockValue ?? 0) : 0), 0);
      const rowsHtml = spec.products
        .map((p) => {
          const margin = computeProductMargin(p.salePrice, p.costPrice);
          const displayName = isBn && p.nameBn ? p.nameBn : p.name;
          const secondaryName = isBn && p.nameBn && p.nameBn !== p.name ? p.name : '';
          return `
            <tr>
              <td style="padding:8px 9px;border-bottom:1px solid #E2E8F0;font-size:10px;color:#475569;font-family:'JetBrains Mono',monospace;">
                <div style="font-weight:600;color:#0F172A;">${escapeHtml(p.sku)}</div>
                ${p.barcode ? `<div style="color:#64748B;font-size:9px;">${escapeHtml(p.barcode)}</div>` : ''}
              </td>
              <td style="padding:8px 9px;border-bottom:1px solid #E2E8F0;font-size:11px;">
                <div style="font-weight:600;color:#0F172A;">${escapeHtml(displayName)}</div>
                ${secondaryName ? `<div style="font-size:10px;color:#64748B;">${escapeHtml(secondaryName)}</div>` : ''}
                <div style="font-size:10px;color:#475569;margin-top:2px;">
                  ${escapeHtml([p.brand, p.category].filter(Boolean).join(' · ') || '—')}
                </div>
              </td>
              <td style="padding:8px 9px;border-bottom:1px solid #E2E8F0;font-size:10px;color:#475569;">
                <div>${escapeHtml(formatNumber(p.taxRate ?? 15, lang))}%</div>
                ${p.hsCode ? `<div style="font-size:9px;color:#64748B;font-family:'JetBrains Mono',monospace;">HS ${escapeHtml(p.hsCode)}</div>` : ''}
              </td>
              <td style="padding:8px 9px;border-bottom:1px solid #E2E8F0;font-size:11px;text-align:right;color:#475569;">${escapeHtml(money(p.costPrice))}</td>
              <td style="padding:8px 9px;border-bottom:1px solid #E2E8F0;font-size:11px;text-align:right;font-weight:600;color:#0F172A;">${escapeHtml(money(p.salePrice))}</td>
              <td style="padding:8px 9px;border-bottom:1px solid #E2E8F0;font-size:11px;text-align:right;color:${margin.marginPct >= 20 ? '#047857' : '#B45309'};font-weight:600;">${escapeHtml(formatNumber(margin.marginPct, lang))}%</td>
              <td style="padding:8px 9px;border-bottom:1px solid #E2E8F0;font-size:11px;text-align:right;color:#0F172A;">
                ${p.trackInventory ? `${escapeHtml(formatNumber(p.stockQty ?? 0, lang))} ${escapeHtml(p.unit)}` : isBn ? 'সেবা' : 'Service'}
              </td>
              <td style="padding:8px 9px;border-bottom:1px solid #E2E8F0;font-size:11px;text-align:right;font-weight:600;color:#0F172A;">
                ${p.trackInventory ? escapeHtml(money(p.stockValue ?? 0)) : '—'}
              </td>
            </tr>
          `;
        })
        .join('');

      const subtitle = spec.filterSummary
        ? `${spec.filterSummary} · ${isBn ? `মোট ${formatNumber(spec.products.length, 'bn')}টি পণ্য` : `${spec.products.length} items`}`
        : isBn
          ? `মোট ${formatNumber(spec.products.length, 'bn')}টি পণ্য ও সেবা`
          : `${spec.products.length} Products & Services`;

      const html = baseWrap(`
        ${reportHeaderHtml(
          org,
          lang,
          isBn ? 'প্রোডাক্ট ডাইরেক্টরি ও মূল্য তালিকা' : 'PRODUCT DIRECTORY & PRICE LIST',
          subtitle
        )}

        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <thead>
            <tr style="background:#F8FAFC;border-top:1px solid #CBD5E1;border-bottom:1px solid #CBD5E1;font-size:10px;color:#475569;">
              <th style="padding:8px 9px;text-align:left;font-weight:600;">SKU / ${isBn ? 'বারকোড' : 'Barcode'}</th>
              <th style="padding:8px 9px;text-align:left;font-weight:600;">${isBn ? 'পণ্য, ব্র্যান্ড ও ক্যাটাগরি' : 'Product / Brand / Category'}</th>
              <th style="padding:8px 9px;text-align:left;font-weight:600;">${isBn ? 'মূসক / HS' : 'VAT / HS'}</th>
              <th style="padding:8px 9px;text-align:right;font-weight:600;">${isBn ? 'ক্রয় দর' : 'Cost'}</th>
              <th style="padding:8px 9px;text-align:right;font-weight:600;">${isBn ? 'বিক্রয় দর' : 'Sale'}</th>
              <th style="padding:8px 9px;text-align:right;font-weight:600;">${isBn ? 'লাভ %' : 'Margin'}</th>
              <th style="padding:8px 9px;text-align:right;font-weight:600;">${isBn ? 'মজুদ' : 'Stock'}</th>
              <th style="padding:8px 9px;text-align:right;font-weight:600;">${isBn ? 'মোট মূল্য' : 'Value'}</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || `<tr><td colspan="8" style="padding:16px;text-align:center;color:#64748B;font-size:11px;">${isBn ? 'কোনো পণ্য পাওয়া যায়নি' : 'No products matched'}</td></tr>`}
          </tbody>
          <tfoot>
            <tr style="background:#F8FAFC;font-weight:700;font-size:12px;">
              <td colspan="7" style="padding:10px 9px;border-top:2px solid #0F172A;text-align:right;">${isBn ? 'মোট মজুদ পণ্যের মূল্য' : 'Total Inventory Valuation'}</td>
              <td style="padding:10px 9px;border-top:2px solid #0F172A;text-align:right;color:#0F766E;">${escapeHtml(money(totalStockVal))}</td>
            </tr>
          </tfoot>
        </table>

        ${reportFooterHtml(lang)}
      `);

      return {
        filename: `Product-Catalog-${dateTag}.pdf`,
        widthPx: 794,
        pageFormat: 'a4',
        html,
      };
    }

    case 'barcode_labels': {
      const expanded: Product[] = [];
      for (const entry of spec.items) {
        const copies = Math.max(1, Math.min(30, Math.round(entry.copies || 1)));
        for (let i = 0; i < copies; i++) {
          expanded.push(entry.product);
        }
      }

      const cardsHtml = expanded
        .map((p) => {
          const codeValue = p.barcode || p.sku;
          const svg = renderCode128BSvg(codeValue, {
            height: 36,
            moduleWidth: 1.25,
            quietZone: 6,
            showText: true,
          });
          const title = isBn && p.nameBn ? p.nameBn : p.name;
          return `
            <div style="border:1px dashed #94A3B8;border-radius:6px;padding:10px 10px 8px;background:#FFFFFF;display:flex;flex-direction:column;justify-content:space-between;min-height:118px;box-sizing:border-box;">
              <div style="text-align:center;">
                <div style="font-size:9px;color:#64748B;font-weight:600;letter-spacing:0.03em;text-transform:uppercase;">${escapeHtml(isBn ? org.nameBn || org.name : org.name)}</div>
                <div style="font-size:11px;font-weight:700;color:#0F172A;margin-top:2px;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(title)}</div>
              </div>
              <div style="margin:6px 0 4px;">${svg}</div>
              <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid #E2E8F0;padding-top:5px;font-size:10px;">
                <span style="font-family:'JetBrains Mono',monospace;color:#475569;">${escapeHtml(p.sku)}</span>
                <span style="font-weight:700;color:#0F766E;font-size:11px;">${escapeHtml(money(p.salePrice))}</span>
              </div>
            </div>
          `;
        })
        .join('');

      const html = baseWrap(`
        <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:1.5px solid #0F172A;padding-bottom:10px;margin-bottom:16px;">
          <div>
            <div style="font-size:15px;font-weight:700;color:#0F172A;">${isBn ? 'বারকোড ও SKU প্রাইস লেবেল শিট' : 'BARCODE & SKU PRICE LABEL SHEET'}</div>
            <div style="font-size:10px;color:#64748B;margin-top:2px;">${escapeHtml(isBn ? org.nameBn || org.name : org.name)} · Code-128B · ${isBn ? `মোট ${formatNumber(expanded.length, 'bn')}টি লেবেল` : `${expanded.length} labels`}</div>
          </div>
          <div style="font-size:10px;color:#64748B;">${escapeHtml(formatDate(dateTag, lang))}</div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;">
          ${cardsHtml}
        </div>
      `);

      return {
        filename: `Barcode-Labels-${dateTag}.pdf`,
        widthPx: 794,
        pageFormat: 'a4',
        html,
      };
    }
  }
}

import { useEffect, useState } from 'react';
import { Download, Loader2, Printer, X } from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import { formatDate, formatMoney, formatNumber } from '../engine/format';
import type { Customer, Invoice, Language, Organization, StatementRow } from '../engine/types';
import { CASH_MEMO_TEMPLATES, resolveCashMemoConfig } from '../lib/cashMemoTemplates';
import { downloadPdfDocument, printThermalReceipt } from '../lib/pdfExport';
import { CashMemoPreviewFrame } from './CashMemoPreviewFrame';
import { OrganizationLogo } from './OrganizationLogo';

export type PreviewDocument =
  | { type: 'invoice'; invoice: Invoice }
  | { type: 'mushak_63'; invoice: Invoice }
  | { type: 'pos_receipt'; invoice: Invoice }
  | { type: 'statement'; customer: Customer; rows: StatementRow[]; closingBalance: number };

interface Props {
  doc: PreviewDocument | null;
  org: Organization;
  lang: Language;
  onClose: () => void;
}

export function DocumentPreviewModal({ doc, org, lang, onClose }: Props) {
  const { notify } = useFeedback();
  const [downloadingKey, setDownloadingKey] = useState<'default' | 'vat' | 'novat' | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const resolvedMemo = resolveCashMemoConfig(org.cashMemoSettings, undefined, org, lang);
  const [cashMemoIncludeVat, setCashMemoIncludeVat] = useState<boolean>(
    resolvedMemo.config.defaultIncludeVat
  );

  useEffect(() => {
    if (doc?.type === 'pos_receipt') {
      const next = resolveCashMemoConfig(org.cashMemoSettings, undefined, org, lang);
      setCashMemoIncludeVat(next.config.defaultIncludeVat);
      setDownloadError(null);
    }
  }, [doc, org, lang]);

  if (!doc) return null;

  const isBn = lang === 'bn';
  const money = (v: number) => formatMoney(v, lang, org.currencySymbol);
  const numClass = isBn ? 'tabular-nums' : 'font-mono tabular-nums';
  const downloading = downloadingKey !== null;
  const activeTemplateMeta = CASH_MEMO_TEMPLATES[resolvedMemo.templateId];

  const handleDownloadPdf = async (vatMode?: 'vat' | 'novat') => {
    const key = vatMode ?? 'default';
    setDownloadingKey(key);
    setDownloadError(null);
    try {
      if (doc.type === 'pos_receipt') {
        const includeVat = vatMode === 'vat' ? true : vatMode === 'novat' ? false : cashMemoIncludeVat;
        await downloadPdfDocument(
          { type: 'pos_receipt', invoice: doc.invoice, includeVat },
          org,
          lang
        );
        notify({
          title: isBn
            ? includeVat
              ? 'ক্যাশ মেমো (মূসক সহ) ডাউনলোড হয়েছে।'
              : 'ক্যাশ মেমো (মূসক ছাড়া) ডাউনলোড হয়েছে।'
            : includeVat
              ? 'Cash Memo (With Mushak) downloaded.'
              : 'Cash Memo (No Mushak) downloaded.',
          description: doc.invoice.invoiceNumber,
          variant: 'info',
          sound: 'export',
        });
      } else {
        await downloadPdfDocument(doc, org, lang);
        notify({
          title: isBn ? 'ডকুমেন্ট পিডিএফ ডাউনলোড হয়েছে।' : 'Document PDF downloaded.',
          variant: 'info',
          sound: 'export',
        });
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : isBn
            ? 'পিডিএফ তৈরি করা যায়নি।'
            : 'Unable to generate PDF.';
      setDownloadError(msg);
      notify({ title: msg, variant: 'error' });
    } finally {
      setDownloadingKey(null);
    }
  };

  const handleTerminalPrint = () => {
    if (doc.type !== 'pos_receipt') return;
    setDownloadError(null);
    printThermalReceipt(doc.invoice, org, lang, {
      includeVat: cashMemoIncludeVat,
    });
    notify({
      title: isBn ? 'টার্মিনাল প্রিন্ট প্রস্তুত হয়েছে।' : 'Terminal print dialog opened.',
      description: doc.invoice.invoiceNumber,
      variant: 'info',
      sound: 'export',
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-[2px] p-0 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Document Preview"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-4xl rounded-t-3xl sm:rounded-xl border border-slate-200 h-[92dvh] sm:h-auto sm:max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile grab handle */}
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center bg-slate-50">
          <div className="w-10 h-1.5 bg-slate-300 rounded-full" />
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-slate-200 bg-slate-50">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 truncate">
              {doc.type === 'invoice' &&
                (isBn ? `ট্যাক্স ইনভয়েস — ${doc.invoice.invoiceNumber}` : `Tax Invoice — ${doc.invoice.invoiceNumber}`)}
              {doc.type === 'mushak_63' &&
                (isBn ? `মূসক ৬.৩ — ${doc.invoice.mushakChallanNo}` : `Mushak 6.3 — ${doc.invoice.mushakChallanNo}`)}
              {doc.type === 'pos_receipt' &&
                (isBn ? `ক্যাশ মেমো — ${doc.invoice.invoiceNumber}` : `Cash Memo — ${doc.invoice.invoiceNumber}`)}
              {doc.type === 'statement' &&
                (isBn ? `স্টেটমেন্ট — ${doc.customer.name}` : `Statement — ${doc.customer.name}`)}
            </div>
            {doc.type === 'pos_receipt' && (
              <div className="text-[11px] text-slate-500 truncate mt-0.5">
                {isBn ? activeTemplateMeta.nameBn : activeTemplateMeta.nameEn}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {doc.type === 'pos_receipt' ? (
              <div className="hidden sm:flex items-center gap-2">
                <button
                  type="button"
                  data-testid="cash-memo-terminal-print"
                  onClick={handleTerminalPrint}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-600" />
                  <span>{isBn ? 'টার্মিনাল প্রিন্ট' : 'Terminal Print'}</span>
                </button>
                <button
                  type="button"
                  data-testid="cash-memo-download-novat"
                  disabled={downloading}
                  onClick={() => handleDownloadPdf('novat')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
                >
                  {downloadingKey === 'novat' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5 text-slate-600" />
                  )}
                  <span>{isBn ? 'ডাউনলোড (মূসক ছাড়া)' : 'Download (No Mushak)'}</span>
                </button>
                <button
                  type="button"
                  data-testid="cash-memo-download-vat"
                  disabled={downloading}
                  onClick={() => handleDownloadPdf('vat')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#115E59] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
                >
                  {downloadingKey === 'vat' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>{isBn ? 'ডাউনলোড (মূসক সহ)' : 'Download (With Mushak)'}</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={downloading}
                onClick={() => handleDownloadPdf()}
                className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#0F766E] hover:bg-[#115E59] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
              >
                {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                {downloading
                  ? isBn
                    ? 'তৈরি হচ্ছে...'
                    : 'Generating...'
                  : isBn
                    ? 'PDF ডাউনলোড'
                    : 'Download PDF'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close document preview"
              className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:p-2 inline-flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 rounded-xl sm:rounded-lg transition-colors"
            >
              <X className="w-5 h-5 sm:w-4 sm:h-4" />
            </button>
          </div>
        </div>

        {/* Cash Memo Live Preview VAT Toggle Strip */}
        {doc.type === 'pos_receipt' && (
          <div className="px-4 sm:px-5 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-slate-600">
              {isBn ? 'প্রিভিউ মোড (মূসক নির্ধারণ করুন):' : 'Preview Mode (Mushak / VAT):'}
            </span>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs">
              <button
                type="button"
                data-testid="cash-memo-vat-toggle-on"
                onClick={() => setCashMemoIncludeVat(true)}
                className={`px-3 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                  cashMemoIncludeVat ? 'bg-[#0F766E] text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {isBn ? 'মূসক সহ' : 'With Mushak'}
              </button>
              <button
                type="button"
                data-testid="cash-memo-vat-toggle-off"
                onClick={() => setCashMemoIncludeVat(false)}
                className={`px-3 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                  !cashMemoIncludeVat ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {isBn ? 'মূসক ছাড়া' : 'No Mushak'}
              </button>
            </div>
          </div>
        )}

        {downloadError && (
          <div role="alert" className="mx-4 mt-3 p-2.5 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
            {downloadError}
          </div>
        )}

        {/* Document Body */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-8 bg-white text-slate-900">
          {doc.type === 'invoice' && (
            <div className="space-y-6 max-w-3xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-200 pb-5">
                <div className="flex items-start gap-3 min-w-0">
                  <OrganizationLogo logoUrl={org.logoUrl} orgName={isBn ? org.nameBn || org.name : org.name} size="md" />
                  <div className="min-w-0">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900">{isBn ? org.nameBn || org.name : org.name}</h2>
                    {org.tagline && <p className="text-xs font-medium text-[#0F766E] mt-0.5">{org.tagline}</p>}
                    {org.proprietorName && <p className="text-xs text-slate-600 mt-0.5">{org.proprietorName}</p>}
                    {org.address && <p className="text-xs text-slate-600 mt-1">{org.address}</p>}
                    <p className="text-xs text-slate-600 mt-0.5">
                      BIN: <span className="font-mono">{org.binNumber || '—'}</span> · TIN:{' '}
                      <span className="font-mono">{org.tinNumber || '—'}</span>
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {[org.phone, org.email, org.website].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
                <div className="sm:text-right">
                  <div className="text-base sm:text-lg font-semibold tracking-tight text-slate-900">
                    {isBn ? 'ট্যাক্স ইনভয়েস' : 'TAX INVOICE'}
                  </div>
                  <div className="font-mono text-sm font-medium text-[#0F766E] mt-0.5">
                    {doc.invoice.invoiceNumber}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {isBn ? 'মূসক চালান নং' : 'Mushak 6.3'}:{' '}
                    <span className="font-mono">{doc.invoice.mushakChallanNo}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs font-medium text-slate-500 mb-1">{isBn ? 'ক্রেতা (Bill To)' : 'Bill To'}</div>
                  <div className="font-semibold text-slate-900">{doc.invoice.customerName}</div>
                  {doc.invoice.customerCompanyName && (
                    <div className="text-xs font-medium text-slate-700 mt-0.5">{doc.invoice.customerCompanyName}</div>
                  )}
                  {doc.invoice.customerAddress && <div className="text-xs text-slate-600 mt-0.5">{doc.invoice.customerAddress}</div>}
                  {(doc.invoice.customerPhone || doc.invoice.customerEmail) && (
                    <div className="text-xs text-slate-600 mt-0.5">
                      {[doc.invoice.customerPhone, doc.invoice.customerEmail].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  {doc.invoice.customerBin && (
                    <div className="text-xs text-slate-600 mt-0.5">
                      BIN: <span className="font-mono">{doc.invoice.customerBin}</span>
                    </div>
                  )}
                </div>
                <div className="sm:text-right space-y-1 text-xs">
                  <div>
                    <span className="text-slate-500">{isBn ? 'ইস্যু তারিখ' : 'Issue Date'}:</span>{' '}
                    <span className="font-medium text-slate-900">{formatDate(doc.invoice.issueDate, lang)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">{isBn ? 'পরিশোধের শেষ তারিখ' : 'Due Date'}:</span>{' '}
                    <span className="font-medium text-slate-900">{formatDate(doc.invoice.dueDate, lang)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">{isBn ? 'শাখা' : 'Branch'}:</span>{' '}
                    <span className="font-medium text-slate-900">
                      {isBn ? doc.invoice.branchNameBn || doc.invoice.branchName : doc.invoice.branchName}
                    </span>
                  </div>
                </div>
              </div>

              {/* Desktop Table */}
              <div className="hidden sm:block">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-y border-slate-200 bg-slate-50 text-xs text-slate-600">
                      <th className="py-2.5 px-3 text-left font-medium">#</th>
                      <th className="py-2.5 px-3 text-left font-medium">{isBn ? 'বিবরণ' : 'Description'}</th>
                      <th className="py-2.5 px-3 text-right font-medium">{isBn ? 'পরিমাণ' : 'Qty'}</th>
                      <th className="py-2.5 px-3 text-right font-medium">{isBn ? 'দর' : 'Rate'}</th>
                      <th className="py-2.5 px-3 text-right font-medium">{isBn ? 'মূসক %' : 'VAT %'}</th>
                      <th className="py-2.5 px-3 text-right font-medium">{isBn ? 'মূসক' : 'VAT'}</th>
                      <th className="py-2.5 px-3 text-right font-medium">{isBn ? 'মোট' : 'Amount'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(doc.invoice.items || []).map((line, idx) => (
                      <tr key={idx}>
                        <td className="py-2.5 px-3 font-mono text-xs text-slate-500">{idx + 1}</td>
                        <td className="py-2.5 px-3 text-slate-900">{line.description}</td>
                        <td className={`py-2.5 px-3 text-right ${numClass}`}>{formatNumber(line.quantity, lang)}</td>
                        <td className={`py-2.5 px-3 text-right ${numClass}`}>{money(line.unitPrice)}</td>
                        <td className={`py-2.5 px-3 text-right text-xs text-slate-600 ${numClass}`}>{formatNumber(line.taxRate, lang)}%</td>
                        <td className={`py-2.5 px-3 text-right ${numClass}`}>{money(line.vatAmount)}</td>
                        <td className={`py-2.5 px-3 text-right font-medium ${numClass}`}>{money(line.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Stacked Line Items (Zero horizontal scroll) */}
              <div className="sm:hidden border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
                {(doc.invoice.items || []).map((line, idx) => (
                  <div key={idx} className="p-3.5 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-slate-900">{line.description}</span>
                      <span className={`text-sm font-semibold text-slate-900 shrink-0 ${numClass}`}>
                        {money(line.lineTotal)}
                      </span>
                    </div>
                    <div className={`text-xs text-slate-500 flex items-center justify-between ${numClass}`}>
                      <span>
                        {formatNumber(line.quantity, lang)} × {money(line.unitPrice)}
                      </span>
                      <span>
                        {isBn ? 'মূসক' : 'VAT'} {formatNumber(line.taxRate, lang)}%: {money(line.vatAmount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row justify-between gap-6 pt-2">
                <div className="text-xs text-slate-600 max-w-sm">
                  {doc.invoice.notes && (
                    <>
                      <div className="font-medium text-slate-800 mb-1">{isBn ? 'নোট ও শর্তাবলি' : 'Notes & Terms'}</div>
                      <p>{doc.invoice.notes}</p>
                    </>
                  )}
                </div>
                <div className="w-full sm:w-72 space-y-2 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>{isBn ? 'করযোগ্য মূল্য' : 'Taxable Subtotal'}</span>
                    <span className={numClass}>{money(doc.invoice.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>{isBn ? 'মোট মূসক (VAT)' : 'Total VAT'}</span>
                    <span className={numClass}>{money(doc.invoice.vatTotal)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-slate-900 pt-2 border-t border-slate-200">
                    <span>{isBn ? 'সর্বমোট প্রদেয়' : 'Grand Total'}</span>
                    <span className={numClass}>{money(doc.invoice.grandTotal)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>{isBn ? 'পরিশোধিত' : 'Paid'}</span>
                    <span className={numClass}>{money(doc.invoice.paidAmount)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold text-[#0F766E] pt-1 border-t border-slate-100">
                    <span>{isBn ? 'বকেয়া পরিমাণ' : 'Balance Due'}</span>
                    <span className={numClass}>{money(doc.invoice.balanceDue)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {doc.type === 'mushak_63' && (
            <div className="space-y-5 max-w-3xl mx-auto border border-slate-300 rounded-xl sm:rounded-none p-4 sm:p-6">
              <div className="text-center border-b border-slate-300 pb-4">
                <div className="text-xs text-slate-600">গণপ্রজাতন্ত্রী বাংলাদেশ সরকার · জাতীয় রাজস্ব বোর্ড (NBR)</div>
                <div className="text-lg font-bold text-slate-900 mt-1">কর চালানপত্র · মূসক-৬.৩</div>
                <div className="text-xs text-slate-600 mt-0.5">[বিধি ৪০ এর উপ-বিধি (১) এর দফা (গ) ও দফা (চ) দ্রষ্টব্য]</div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs border-b border-slate-200 pb-4">
                <div className="space-y-1">
                  <div><span className="text-slate-500">নিবন্ধিত ব্যক্তির নাম:</span> <span className="font-semibold">{org.nameBn}</span></div>
                  <div><span className="text-slate-500">নিবন্ধিত ব্যক্তির বিআইএন (BIN):</span> <span className="font-mono font-semibold">{org.binNumber}</span></div>
                  <div><span className="text-slate-500">চালানপত্র ইস্যুর ঠিকানা:</span> {org.address}</div>
                </div>
                <div className="space-y-1">
                  <div><span className="text-slate-500">চালানপত্র নম্বর:</span> <span className="font-mono font-semibold">{doc.invoice.mushakChallanNo}</span></div>
                  <div><span className="text-slate-500">ইস্যুর তারিখ:</span> <span className="tabular-nums">{formatDate(doc.invoice.issueDate, 'bn')}</span></div>
                  <div><span className="text-slate-500">ক্রেতার নাম:</span> <span className="font-semibold">{doc.invoice.customerName}</span></div>
                  <div><span className="text-slate-500">ক্রেতার বিআইএন:</span> <span className="font-mono">{doc.invoice.customerBin || 'প্রযোজ্য নয়'}</span></div>
                </div>
              </div>

              {/* Desktop Mushak 6.3 Table */}
              <div className="hidden sm:block">
                <table className="w-full text-xs border border-slate-300 border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="border border-slate-300 p-2 text-left">ক্রমিক</th>
                      <th className="border border-slate-300 p-2 text-left">পণ্য বা সেবার বর্ণনা</th>
                      <th className="border border-slate-300 p-2 text-right">পরিমাণ</th>
                      <th className="border border-slate-300 p-2 text-right">একক মূল্য (টাকা)</th>
                      <th className="border border-slate-300 p-2 text-right">মোট মূল্য (টাকা)</th>
                      <th className="border border-slate-300 p-2 text-right">মূসকের হার (%)</th>
                      <th className="border border-slate-300 p-2 text-right">মূসকের পরিমাণ (টাকা)</th>
                      <th className="border border-slate-300 p-2 text-right">সকল করসহ মূল্য</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(doc.invoice.items || []).map((line, i) => (
                      <tr key={i}>
                        <td className="border border-slate-300 p-2 tabular-nums">{formatNumber(i + 1, 'bn')}</td>
                        <td className="border border-slate-300 p-2">{line.description}</td>
                        <td className="border border-slate-300 p-2 text-right tabular-nums">{formatNumber(line.quantity, 'bn')}</td>
                        <td className="border border-slate-300 p-2 text-right tabular-nums">{formatMoney(line.unitPrice, 'bn', '')}</td>
                        <td className="border border-slate-300 p-2 text-right tabular-nums">{formatMoney(line.taxableValue, 'bn', '')}</td>
                        <td className="border border-slate-300 p-2 text-right tabular-nums">{formatNumber(line.taxRate, 'bn')}%</td>
                        <td className="border border-slate-300 p-2 text-right tabular-nums">{formatMoney(line.vatAmount, 'bn', '')}</td>
                        <td className="border border-slate-300 p-2 text-right tabular-nums font-medium">{formatMoney(line.lineTotal, 'bn', '')}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-semibold">
                      <td colSpan={4} className="border border-slate-300 p-2 text-right">সর্বমোট</td>
                      <td className="border border-slate-300 p-2 text-right tabular-nums">{formatMoney(doc.invoice.subtotal, 'bn', '')}</td>
                      <td className="border border-slate-300 p-2"></td>
                      <td className="border border-slate-300 p-2 text-right tabular-nums">{formatMoney(doc.invoice.vatTotal, 'bn', '')}</td>
                      <td className="border border-slate-300 p-2 text-right tabular-nums">{formatMoney(doc.invoice.grandTotal, 'bn', '৳')}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Mobile Stacked Mushak 6.3 Lines */}
              <div className="sm:hidden border border-slate-200 rounded-xl divide-y divide-slate-200 text-xs">
                {(doc.invoice.items || []).map((line, i) => (
                  <div key={i} className="p-3 space-y-1">
                    <div className="flex justify-between gap-2 font-medium text-slate-900">
                      <span>{formatNumber(i + 1, 'bn')}. {line.description}</span>
                      <span className="tabular-nums shrink-0">{formatMoney(line.lineTotal, 'bn', '৳')}</span>
                    </div>
                    <div className="flex justify-between text-slate-500 tabular-nums">
                      <span>পরিমাণ: {formatNumber(line.quantity, 'bn')} × {formatMoney(line.unitPrice, 'bn', '৳')}</span>
                      <span>মূসক ({formatNumber(line.taxRate, 'bn')}%): {formatMoney(line.vatAmount, 'bn', '৳')}</span>
                    </div>
                  </div>
                ))}
                <div className="p-3 bg-slate-50 space-y-1 font-semibold">
                  <div className="flex justify-between tabular-nums">
                    <span>করযোগ্য মোট মূল্য</span>
                    <span>{formatMoney(doc.invoice.subtotal, 'bn', '৳')}</span>
                  </div>
                  <div className="flex justify-between tabular-nums">
                    <span>মোট মূসক</span>
                    <span>{formatMoney(doc.invoice.vatTotal, 'bn', '৳')}</span>
                  </div>
                  <div className="flex justify-between tabular-nums text-[#0F766E] pt-1 border-t border-slate-200">
                    <span>সর্বমোট করসহ মূল্য</span>
                    <span>{formatMoney(doc.invoice.grandTotal, 'bn', '৳')}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-between gap-4 pt-4 text-xs text-slate-600">
                <div>
                  <div className="border-t border-slate-400 pt-1.5 w-48">প্রতিষ্ঠান কর্তৃপক্ষের স্বাক্ষর ও সিল</div>
                </div>
                <div className="sm:text-right">
                  <div>সিস্টেম জেনারেটেড মূসক ৬.৩ চালান</div>
                  <div className="font-mono text-[11px] text-slate-500 mt-0.5">Ref: {doc.invoice.invoiceNumber}</div>
                </div>
              </div>
            </div>
          )}

          {doc.type === 'pos_receipt' && (
            <div className="max-w-3xl mx-auto">
              <CashMemoPreviewFrame
                invoice={doc.invoice}
                org={org}
                lang={lang}
                includeVat={cashMemoIncludeVat}
              />
            </div>
          )}

          {doc.type === 'statement' && (
            <div className="space-y-5 max-w-3xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-200 pb-4">
                <div className="flex items-start gap-3 min-w-0">
                  <OrganizationLogo logoUrl={org.logoUrl} orgName={isBn ? org.nameBn || org.name : org.name} size="md" />
                  <div className="min-w-0">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900">{isBn ? org.nameBn || org.name : org.name}</h2>
                    {org.tagline && <p className="text-xs font-medium text-[#0F766E] mt-0.5">{org.tagline}</p>}
                    {org.address && <p className="text-xs text-slate-600 mt-1">{org.address}</p>}
                    {(org.phone || org.website) && (
                      <p className="text-xs text-slate-500 mt-0.5">{[org.phone, org.website].filter(Boolean).join(' · ')}</p>
                    )}
                  </div>
                </div>
                <div className="sm:text-right">
                  <div className="text-base sm:text-lg font-semibold text-slate-900">
                    {isBn ? 'কাস্টমার লেজার স্টেটমেন্ট' : 'CUSTOMER STATEMENT'}
                  </div>
                  <div className="text-sm font-medium text-slate-800 mt-0.5">{doc.customer.name}</div>
                  {doc.customer.companyName && <div className="text-xs text-slate-500">{doc.customer.companyName}</div>}
                </div>
              </div>

              {/* Desktop Statement Table */}
              <div className="hidden sm:block">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-y border-slate-200 bg-slate-50 text-xs text-slate-600">
                      <th className="py-2.5 px-3 text-left font-medium">{isBn ? 'তারিখ' : 'Date'}</th>
                      <th className="py-2.5 px-3 text-left font-medium">{isBn ? 'রেফারেন্স' : 'Reference'}</th>
                      <th className="py-2.5 px-3 text-left font-medium">{isBn ? 'বিবরণ' : 'Description'}</th>
                      <th className="py-2.5 px-3 text-right font-medium">{isBn ? 'ডেবিট (বিল)' : 'Debit (Invoiced)'}</th>
                      <th className="py-2.5 px-3 text-right font-medium">{isBn ? 'ক্রেডিট (জমা)' : 'Credit (Paid)'}</th>
                      <th className="py-2.5 px-3 text-right font-medium">{isBn ? 'চলতি জের' : 'Running Balance'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {doc.rows.map((r, idx) => (
                      <tr key={idx}>
                        <td className="py-2.5 px-3 text-xs text-slate-600 whitespace-nowrap">{r.date ? formatDate(r.date, lang) : '—'}</td>
                        <td className="py-2.5 px-3 font-mono text-xs text-slate-800">{r.reference}</td>
                        <td className="py-2.5 px-3 text-slate-800">{r.description}</td>
                        <td className={`py-2.5 px-3 text-right ${numClass}`}>{r.debit > 0 ? money(r.debit) : '—'}</td>
                        <td className={`py-2.5 px-3 text-right text-emerald-700 ${numClass}`}>{r.credit > 0 ? money(r.credit) : '—'}</td>
                        <td className={`py-2.5 px-3 text-right font-medium ${numClass}`}>{money(r.runningBalance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Stacked Statement Cards */}
              <div className="sm:hidden border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
                {doc.rows.map((r, idx) => (
                  <div key={idx} className="p-3.5 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-mono font-semibold text-slate-900">{r.reference}</div>
                        <div className="text-xs text-slate-600 truncate">{r.description}</div>
                      </div>
                      <div className={`text-xs font-semibold text-slate-900 shrink-0 ${numClass}`}>
                        {money(r.runningBalance)}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>{r.date ? formatDate(r.date, lang) : '—'}</span>
                      <div className={`flex gap-3 ${numClass}`}>
                        {r.debit > 0 && <span>{isBn ? 'বিল' : 'Dr'}: {money(r.debit)}</span>}
                        {r.credit > 0 && <span className="text-emerald-700">{isBn ? 'জমা' : 'Cr'}: {money(r.credit)}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-2">
                <div className="w-full sm:w-64 border-t border-slate-300 pt-3 flex justify-between text-sm font-semibold">
                  <span>{isBn ? 'সমাপনী পাওনা' : 'Closing Balance'}</span>
                  <span className={`text-[#0F766E] ${numClass}`}>{money(doc.closingBalance)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mobile Sticky Bottom CTA */}
        <div className="sm:hidden px-3 py-3 pb-safe border-t border-slate-200 bg-white">
          {doc.type === 'pos_receipt' ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={downloading}
                  onClick={() => handleDownloadPdf('vat')}
                  className="h-11 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-[#0F766E] active:scale-[0.98] disabled:opacity-60 rounded-xl transition-transform whitespace-nowrap"
                >
                  {downloadingKey === 'vat' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>{isBn ? 'মূসক সহ PDF' : 'With Mushak'}</span>
                </button>
                <button
                  type="button"
                  disabled={downloading}
                  onClick={() => handleDownloadPdf('novat')}
                  className="h-11 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-900 bg-slate-100 border border-slate-300 active:scale-[0.98] disabled:opacity-60 rounded-xl transition-transform whitespace-nowrap"
                >
                  {downloadingKey === 'novat' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>{isBn ? 'মূসক ছাড়া PDF' : 'No Mushak'}</span>
                </button>
              </div>
              <button
                type="button"
                onClick={handleTerminalPrint}
                className="w-full h-10 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 active:scale-[0.98] rounded-xl transition-transform whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5 text-slate-600" />
                <span>{isBn ? 'টার্মিনাল প্রিন্ট (POS)' : 'Terminal Print (POS)'}</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={downloading}
              onClick={() => handleDownloadPdf()}
              className="w-full h-12 inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-[#0F766E] active:scale-[0.98] disabled:opacity-60 rounded-xl transition-transform"
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {downloading
                ? isBn
                  ? 'পিডিএফ তৈরি হচ্ছে...'
                  : 'Generating PDF...'
                : isBn
                  ? 'PDF ডাউনলোড করুন'
                  : 'Download PDF'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

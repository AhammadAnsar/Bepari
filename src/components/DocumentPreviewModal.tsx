import { useEffect, useState } from 'react';
import { ArrowRightLeft, Download, FileCheck2, Loader2, Printer, Truck, X } from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import { formatDate, formatMoney, formatNumber } from '../engine/format';
import type { Customer, Invoice, Language, Organization, Quotation, StatementRow } from '../engine/types';
import {
  CASH_MEMO_TEMPLATES,
  amountToWords,
  formatDocumentLineSpecs,
  resolveCashMemoConfig,
} from '../lib/cashMemoTemplates';
import { downloadPdfDocument, printThermalReceipt } from '../lib/pdfExport';
import { CashMemoPreviewFrame } from './CashMemoPreviewFrame';
import { OrganizationLogo } from './OrganizationLogo';

export type PreviewDocument =
  | { type: 'invoice'; invoice: Invoice }
  | { type: 'delivery_challan'; invoice: Invoice }
  | { type: 'quotation'; quotation: Quotation; onConvertToInvoice?: (quotation: Quotation) => void }
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
  const [downloadingKey, setDownloadingKey] = useState<'default' | 'vat' | 'novat' | 'challan' | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const defaultDocLang: Language = org.documentLanguage || org.defaultLanguage || lang;
  const [docLang, setDocLang] = useState<Language>(defaultDocLang);
  const [challanOverride, setChallanOverride] = useState(false);

  const resolvedMemo = resolveCashMemoConfig(org.cashMemoSettings, undefined, org, docLang);
  const [cashMemoIncludeVat, setCashMemoIncludeVat] = useState<boolean>(
    resolvedMemo.config.defaultIncludeVat
  );

  useEffect(() => {
    const nextDocLang: Language = org.documentLanguage || org.defaultLanguage || lang;
    setDocLang(nextDocLang);
    setChallanOverride(false);
    const next = resolveCashMemoConfig(org.cashMemoSettings, undefined, org, nextDocLang);
    if (doc?.type === 'pos_receipt') {
      setCashMemoIncludeVat(next.config.defaultIncludeVat);
    } else if (doc?.type === 'invoice') {
      setCashMemoIncludeVat(true);
    }
    setDownloadError(null);
  }, [doc, org, lang]);

  if (!doc) return null;

  const isUiBn = lang === 'bn';
  const isDocBn = docLang === 'bn';
  const money = (v: number) => formatMoney(v, docLang, org.currencySymbol);
  const numClass = isDocBn ? 'tabular-nums' : 'font-mono tabular-nums';
  const downloading = downloadingKey !== null;
  const activeTemplateMeta = CASH_MEMO_TEMPLATES[resolvedMemo.templateId];

  const effectiveDoc: PreviewDocument =
    challanOverride && (doc.type === 'pos_receipt' || doc.type === 'invoice')
      ? { type: 'delivery_challan', invoice: doc.invoice }
      : doc;

  const canToggleChallan =
    doc.type === 'pos_receipt' || doc.type === 'invoice' || doc.type === 'delivery_challan';

  const handleDownloadPdf = async (mode?: 'vat' | 'novat' | 'challan') => {
    const key = mode ?? 'default';
    setDownloadingKey(key);
    setDownloadError(null);
    try {
      if (mode === 'challan' && (doc.type === 'pos_receipt' || doc.type === 'invoice' || doc.type === 'delivery_challan')) {
        await downloadPdfDocument(
          { type: 'delivery_challan', invoice: doc.invoice },
          org,
          docLang
        );
        notify({
          title: isUiBn ? 'ডেলিভারি চালান ডাউনলোড হয়েছে।' : 'Delivery Challan downloaded.',
          description: doc.invoice.challanNumber || doc.invoice.invoiceNumber,
          variant: 'info',
          sound: 'export',
        });
      } else if (effectiveDoc.type === 'pos_receipt') {
        const includeVat = mode === 'vat' ? true : mode === 'novat' ? false : cashMemoIncludeVat;
        await downloadPdfDocument(
          { type: 'pos_receipt', invoice: effectiveDoc.invoice, includeVat },
          org,
          docLang
        );
        notify({
          title: isUiBn
            ? includeVat
              ? 'ক্যাশ মেমো (মূসক সহ) ডাউনলোড হয়েছে।'
              : 'ক্যাশ মেমো (মূসক ছাড়া) ডাউনলোড হয়েছে।'
            : includeVat
              ? 'Cash Memo (With Mushak) downloaded.'
              : 'Cash Memo (No Mushak) downloaded.',
          description: effectiveDoc.invoice.invoiceNumber,
          variant: 'info',
          sound: 'export',
        });
      } else if (effectiveDoc.type === 'invoice') {
        const includeVat = mode === 'vat' ? true : mode === 'novat' ? false : cashMemoIncludeVat;
        await downloadPdfDocument(
          { type: 'invoice', invoice: effectiveDoc.invoice, includeVat },
          org,
          docLang
        );
        notify({
          title: isUiBn ? 'ইনভয়েস পিডিএফ ডাউনলোড হয়েছে।' : 'Invoice PDF downloaded.',
          description: effectiveDoc.invoice.invoiceNumber,
          variant: 'info',
          sound: 'export',
        });
      } else if (effectiveDoc.type === 'delivery_challan') {
        await downloadPdfDocument(
          { type: 'delivery_challan', invoice: effectiveDoc.invoice },
          org,
          docLang
        );
        notify({
          title: isUiBn ? 'ডেলিভারি চালান ডাউনলোড হয়েছে।' : 'Delivery Challan downloaded.',
          description: effectiveDoc.invoice.challanNumber || effectiveDoc.invoice.invoiceNumber,
          variant: 'info',
          sound: 'export',
        });
      } else if (effectiveDoc.type === 'quotation') {
        await downloadPdfDocument(
          { type: 'quotation', quotation: effectiveDoc.quotation },
          org,
          docLang
        );
        notify({
          title: isUiBn ? 'কোটেশন পিডিএফ ডাউনলোড হয়েছে।' : 'Quotation PDF downloaded.',
          description: effectiveDoc.quotation.quotationNumber,
          variant: 'info',
          sound: 'export',
        });
      } else {
        await downloadPdfDocument(effectiveDoc, org, docLang);
        notify({
          title: isUiBn ? 'ডকুমেন্ট পিডিএফ ডাউনলোড হয়েছে।' : 'Document PDF downloaded.',
          variant: 'info',
          sound: 'export',
        });
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : isUiBn
            ? 'পিডিএফ তৈরি করা যায়নি।'
            : 'Unable to generate PDF.';
      setDownloadError(msg);
      notify({ title: msg, variant: 'error' });
    } finally {
      setDownloadingKey(null);
    }
  };

  const handleTerminalPrint = () => {
    if (effectiveDoc.type !== 'pos_receipt') return;
    setDownloadError(null);
    printThermalReceipt(effectiveDoc.invoice, org, docLang, {
      includeVat: cashMemoIncludeVat,
    });
    notify({
      title: isUiBn ? 'টার্মিনাল প্রিন্ট প্রস্তুত হয়েছে।' : 'Terminal print dialog opened.',
      description: effectiveDoc.invoice.invoiceNumber,
      variant: 'info',
      sound: 'export',
    });
  };

  const renderFooterExtras = () => {
    const { config, footerBrandLogos } = resolvedMemo;
    return (
      <div className="pt-4 space-y-2.5">
        {config.footerNote && (
          <div className="text-xs text-slate-600 font-medium">{config.footerNote}</div>
        )}
        {config.showFooterSlogan && config.slogan && (
          <div className="text-center text-xs font-semibold text-[#0F766E]">{config.slogan}</div>
        )}
        {config.showFooterBrandLogos && footerBrandLogos.length > 0 && (
          <div className="pt-2.5 border-t border-dashed border-slate-200 flex items-center justify-center gap-3 flex-wrap">
            {footerBrandLogos.map((logo) => (
              <div
                key={logo.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 bg-white"
              >
                <img
                  src={logo.dataUrl}
                  alt={logo.name || 'Brand'}
                  className="h-5 max-w-[76px] object-contain"
                />
                {logo.name && <span className="text-[11px] font-semibold text-slate-700">{logo.name}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
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
              {effectiveDoc.type === 'invoice' &&
                (isUiBn ? `ট্যাক্স ইনভয়েস — ${effectiveDoc.invoice.invoiceNumber}` : `Tax Invoice — ${effectiveDoc.invoice.invoiceNumber}`)}
              {effectiveDoc.type === 'delivery_challan' &&
                (isUiBn
                  ? `ডেলিভারি চালান — ${effectiveDoc.invoice.challanNumber || effectiveDoc.invoice.mushakChallanNo || effectiveDoc.invoice.invoiceNumber}`
                  : `Delivery Challan — ${effectiveDoc.invoice.challanNumber || effectiveDoc.invoice.mushakChallanNo || effectiveDoc.invoice.invoiceNumber}`)}
              {effectiveDoc.type === 'quotation' &&
                (isUiBn ? `কোটেশন — ${effectiveDoc.quotation.quotationNumber}` : `Quotation — ${effectiveDoc.quotation.quotationNumber}`)}
              {effectiveDoc.type === 'mushak_63' &&
                (isUiBn ? `মূসক ৬.৩ — ${effectiveDoc.invoice.mushakChallanNo}` : `Mushak 6.3 — ${effectiveDoc.invoice.mushakChallanNo}`)}
              {effectiveDoc.type === 'pos_receipt' &&
                (isUiBn ? `ক্যাশ মেমো — ${effectiveDoc.invoice.invoiceNumber}` : `Cash Memo — ${effectiveDoc.invoice.invoiceNumber}`)}
              {effectiveDoc.type === 'statement' &&
                (isUiBn ? `স্টেটমেন্ট — ${effectiveDoc.customer.name}` : `Statement — ${effectiveDoc.customer.name}`)}
            </div>
            {effectiveDoc.type === 'pos_receipt' && (
              <div className="text-[11px] text-slate-500 truncate mt-0.5">
                {isUiBn ? activeTemplateMeta.nameBn : activeTemplateMeta.nameEn}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {effectiveDoc.type === 'pos_receipt' ? (
              <div className="hidden sm:flex items-center gap-2">
                <button
                  type="button"
                  data-testid="cash-memo-delivery-challan-btn"
                  onClick={() => setChallanOverride(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Truck className="w-3.5 h-3.5 text-teal-700" />
                  <span>{isUiBn ? 'ডেলিভারি চালান' : 'Delivery Challan'}</span>
                </button>
                <button
                  type="button"
                  data-testid="cash-memo-terminal-print"
                  onClick={handleTerminalPrint}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-600" />
                  <span>{isUiBn ? 'টার্মিনাল প্রিন্ট' : 'Terminal Print'}</span>
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
                  <span>{isUiBn ? 'ডাউনলোড (মূসক ছাড়া)' : 'Download (No Mushak)'}</span>
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
                  <span>{isUiBn ? 'ডাউনলোড (মূসক সহ)' : 'Download (With Mushak)'}</span>
                </button>
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-2">
                {effectiveDoc.type === 'invoice' && (
                  <button
                    type="button"
                    data-testid="invoice-delivery-challan-btn"
                    onClick={() => setChallanOverride(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Truck className="w-3.5 h-3.5 text-teal-700" />
                    <span>{isUiBn ? 'ডেলিভারি চালান' : 'Delivery Challan'}</span>
                  </button>
                )}
                {challanOverride && (doc.type === 'pos_receipt' || doc.type === 'invoice') && (
                  <button
                    type="button"
                    onClick={() => setChallanOverride(false)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5 text-slate-600" />
                    <span>{isUiBn ? 'মেমো/ইনভয়েসে ফিরুন' : 'Back to Memo/Invoice'}</span>
                  </button>
                )}
                {effectiveDoc.type === 'quotation' &&
                  effectiveDoc.onConvertToInvoice &&
                  effectiveDoc.quotation.status !== 'converted' && (
                    <button
                      type="button"
                      onClick={() => effectiveDoc.onConvertToInvoice?.(effectiveDoc.quotation)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-900 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <FileCheck2 className="w-3.5 h-3.5" />
                      <span>{isUiBn ? 'ইনভয়েসে রূপান্তর করুন' : 'Convert to Invoice'}</span>
                    </button>
                  )}
                <button
                  type="button"
                  disabled={downloading}
                  onClick={() => handleDownloadPdf()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#0F766E] hover:bg-[#115E59] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
                >
                  {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  {downloading
                    ? isUiBn
                      ? 'তৈরি হচ্ছে...'
                      : 'Generating...'
                    : isUiBn
                      ? 'PDF ডাউনলোড'
                      : 'Download PDF'}
                </button>
              </div>
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

        {/* Document Controls Strip: Document Language + Mushak Toggle + Challan Switch */}
        <div className="px-4 sm:px-5 py-2 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">
              {isUiBn ? 'ডকুমেন্ট ভাষা:' : 'Document Lang:'}
            </span>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs">
              <button
                type="button"
                data-testid="doc-preview-lang-bn"
                onClick={() => setDocLang('bn')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  docLang === 'bn' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                বাংলা
              </button>
              <button
                type="button"
                data-testid="doc-preview-lang-en"
                onClick={() => setDocLang('en')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  docLang === 'en' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                English
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(effectiveDoc.type === 'pos_receipt' || effectiveDoc.type === 'invoice') && (
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs">
                <button
                  type="button"
                  data-testid="cash-memo-vat-toggle-on"
                  onClick={() => setCashMemoIncludeVat(true)}
                  className={`px-3 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                    cashMemoIncludeVat ? 'bg-[#0F766E] text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {isUiBn ? 'মূসক সহ' : 'With Mushak'}
                </button>
                <button
                  type="button"
                  data-testid="cash-memo-vat-toggle-off"
                  onClick={() => setCashMemoIncludeVat(false)}
                  className={`px-3 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                    !cashMemoIncludeVat ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {isUiBn ? 'মূসক ছাড়া' : 'No Mushak'}
                </button>
              </div>
            )}

            {canToggleChallan && doc.type !== 'delivery_challan' && (
              <button
                type="button"
                onClick={() => setChallanOverride((prev) => !prev)}
                className={`sm:hidden inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium ${
                  challanOverride
                    ? 'bg-teal-700 text-white border-teal-700'
                    : 'bg-teal-50 text-teal-800 border-teal-200'
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                <span>{challanOverride ? (isUiBn ? 'মেমো' : 'Memo') : (isUiBn ? 'চালান' : 'Challan')}</span>
              </button>
            )}
          </div>
        </div>

        {downloadError && (
          <div role="alert" className="mx-4 mt-3 p-2.5 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
            {downloadError}
          </div>
        )}

        {/* Document Body */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-8 bg-white text-slate-900">
          {effectiveDoc.type === 'invoice' && (
            <div className="space-y-5 max-w-3xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-200 pb-5">
                <div className="flex items-start gap-3 min-w-0">
                  <OrganizationLogo logoUrl={org.logoUrl} orgName={isDocBn ? org.nameBn || org.name : org.name} size="md" />
                  <div className="min-w-0">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900">{isDocBn ? org.nameBn || org.name : org.name}</h2>
                    {org.tagline && <p className="text-xs font-medium text-[#0F766E] mt-0.5">{org.tagline}</p>}
                    {org.proprietorName && <p className="text-xs text-slate-600 mt-0.5">{org.proprietorName}</p>}
                    {org.address && <p className="text-xs text-slate-600 mt-1">{org.address}</p>}
                    <p className="text-xs text-slate-600 mt-0.5">
                      BIN: <span className="font-mono font-semibold text-slate-800">{org.binNumber || '—'}</span> · TIN:{' '}
                      <span className="font-mono">{org.tinNumber || '—'}</span>
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {[org.phone, org.email, org.website].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
                <div className="sm:text-right">
                  <div className="text-base sm:text-lg font-semibold tracking-tight text-slate-900">
                    {cashMemoIncludeVat
                      ? isDocBn
                        ? 'ট্যাক্স ইনভয়েস'
                        : 'TAX INVOICE'
                      : isDocBn
                        ? 'ইনভয়েস / বিল'
                        : 'INVOICE / BILL'}
                  </div>
                  <div className="font-mono text-sm font-medium text-[#0F766E] mt-0.5">
                    {effectiveDoc.invoice.invoiceNumber}
                  </div>
                  {cashMemoIncludeVat && (
                    <div className="text-xs text-slate-500 mt-0.5">
                      {isDocBn ? 'মূসক চালান নং' : 'Mushak 6.3'}:{' '}
                      <span className="font-mono">{effectiveDoc.invoice.mushakChallanNo}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs font-medium text-slate-500 mb-1">{isDocBn ? 'ক্রেতা (Bill To)' : 'Bill To'}</div>
                  <div className="font-semibold text-slate-900">{effectiveDoc.invoice.customerName}</div>
                  {effectiveDoc.invoice.customerCompanyName && (
                    <div className="text-xs font-medium text-slate-700 mt-0.5">{effectiveDoc.invoice.customerCompanyName}</div>
                  )}
                  {effectiveDoc.invoice.customerAddress && <div className="text-xs text-slate-600 mt-0.5">{effectiveDoc.invoice.customerAddress}</div>}
                  {(effectiveDoc.invoice.customerPhone || effectiveDoc.invoice.customerEmail) && (
                    <div className="text-xs text-slate-600 mt-0.5">
                      {[effectiveDoc.invoice.customerPhone, effectiveDoc.invoice.customerEmail].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  {effectiveDoc.invoice.customerBin && (
                    <div className="text-xs text-slate-600 mt-0.5">
                      BIN: <span className="font-mono">{effectiveDoc.invoice.customerBin}</span>
                    </div>
                  )}
                </div>
                <div className="sm:text-right space-y-1 text-xs">
                  <div>
                    <span className="text-slate-500">{isDocBn ? 'ইস্যু তারিখ' : 'Issue Date'}:</span>{' '}
                    <span className="font-medium text-slate-900">{formatDate(effectiveDoc.invoice.issueDate, docLang)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">{isDocBn ? 'পরিশোধের শেষ তারিখ' : 'Due Date'}:</span>{' '}
                    <span className="font-medium text-slate-900">{formatDate(effectiveDoc.invoice.dueDate, docLang)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">{isDocBn ? 'শাখা' : 'Branch'}:</span>{' '}
                    <span className="font-medium text-slate-900">
                      {isDocBn ? effectiveDoc.invoice.branchNameBn || effectiveDoc.invoice.branchName : effectiveDoc.invoice.branchName}
                    </span>
                  </div>
                </div>
              </div>

              {/* P.O No / Challan No / Challan Date Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-800">
                <div>
                  <span className="font-semibold text-slate-600">P.O No:</span>{' '}
                  <span className="font-mono font-semibold">{effectiveDoc.invoice.poNumber || '—'}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-600">Challan No:</span>{' '}
                  <span className="font-mono font-semibold">
                    {effectiveDoc.invoice.challanNumber || effectiveDoc.invoice.mushakChallanNo || '—'}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-slate-600">Challan Date:</span>{' '}
                  <span className="font-medium">
                    {formatDate(effectiveDoc.invoice.challanDate || effectiveDoc.invoice.issueDate, docLang)}
                  </span>
                </div>
              </div>

              {/* Desktop Table */}
              <div className="hidden sm:block">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-y border-slate-200 bg-slate-50 text-xs text-slate-600">
                      <th className="py-2.5 px-3 text-left font-medium">#</th>
                      <th className="py-2.5 px-3 text-left font-medium">{isDocBn ? 'বিবরণ' : 'Description'}</th>
                      <th className="py-2.5 px-3 text-right font-medium">{isDocBn ? 'পরিমাণ' : 'Qty'}</th>
                      <th className="py-2.5 px-3 text-right font-medium">{isDocBn ? 'দর' : 'Rate'}</th>
                      {cashMemoIncludeVat && (
                        <>
                          <th className="py-2.5 px-3 text-right font-medium">{isDocBn ? 'মূসক %' : 'VAT %'}</th>
                          <th className="py-2.5 px-3 text-right font-medium">{isDocBn ? 'মূসক' : 'VAT'}</th>
                        </>
                      )}
                      <th className="py-2.5 px-3 text-right font-medium">{isDocBn ? 'মোট' : 'Amount'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(effectiveDoc.invoice.items || []).map((line, idx) => {
                      const specsText = formatDocumentLineSpecs(line, resolvedMemo.config, isDocBn);
                      const grossWithoutVat = Number((line.taxableValue ?? line.quantity * line.unitPrice).toFixed(2));
                      const displayAmount = cashMemoIncludeVat ? line.lineTotal : grossWithoutVat;
                      return (
                        <tr key={idx}>
                          <td className="py-2.5 px-3 font-mono text-xs text-slate-500 align-top">{idx + 1}</td>
                          <td className="py-2.5 px-3 text-slate-900 align-top">
                            <div className="font-medium">{line.description}</div>
                            {specsText && <div className="text-xs text-slate-500 mt-0.5">{specsText}</div>}
                          </td>
                          <td className={`py-2.5 px-3 text-right align-top ${numClass}`}>{formatNumber(line.quantity, docLang)}</td>
                          <td className={`py-2.5 px-3 text-right align-top ${numClass}`}>{money(line.unitPrice)}</td>
                          {cashMemoIncludeVat && (
                            <>
                              <td className={`py-2.5 px-3 text-right text-xs text-slate-600 align-top ${numClass}`}>
                                {formatNumber(line.taxRate, docLang)}%
                              </td>
                              <td className={`py-2.5 px-3 text-right align-top ${numClass}`}>{money(line.vatAmount)}</td>
                            </>
                          )}
                          <td className={`py-2.5 px-3 text-right font-medium align-top ${numClass}`}>{money(displayAmount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Stacked Line Items */}
              <div className="sm:hidden border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
                {(effectiveDoc.invoice.items || []).map((line, idx) => {
                  const specsText = formatDocumentLineSpecs(line, resolvedMemo.config, isDocBn);
                  const grossWithoutVat = Number((line.taxableValue ?? line.quantity * line.unitPrice).toFixed(2));
                  const displayAmount = cashMemoIncludeVat ? line.lineTotal : grossWithoutVat;
                  return (
                    <div key={idx} className="p-3.5 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-sm font-medium text-slate-900">{line.description}</span>
                          {specsText && <div className="text-xs text-slate-500 mt-0.5">{specsText}</div>}
                        </div>
                        <span className={`text-sm font-semibold text-slate-900 shrink-0 ${numClass}`}>
                          {money(displayAmount)}
                        </span>
                      </div>
                      <div className={`text-xs text-slate-500 flex items-center justify-between ${numClass}`}>
                        <span>
                          {formatNumber(line.quantity, docLang)} × {money(line.unitPrice)}
                        </span>
                        {cashMemoIncludeVat && (
                          <span>
                            {isDocBn ? 'মূসক' : 'VAT'} {formatNumber(line.taxRate, docLang)}%: {money(line.vatAmount)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {(() => {
                const payableTotal = cashMemoIncludeVat ? effectiveDoc.invoice.grandTotal : effectiveDoc.invoice.subtotal;
                const paidAmount = Math.min(effectiveDoc.invoice.paidAmount, payableTotal);
                const balanceDue = Number(Math.max(0, payableTotal - paidAmount).toFixed(2));
                return (
                  <div className="flex flex-col sm:flex-row justify-between gap-6 pt-2">
                    <div className="text-xs text-slate-600 max-w-sm space-y-2">
                      <div>
                        <span className="font-semibold text-slate-800">{isDocBn ? 'কথায়' : 'In Words'}:</span>{' '}
                        {amountToWords(payableTotal, docLang)}
                      </div>
                      {effectiveDoc.invoice.notes && (
                        <div>
                          <div className="font-medium text-slate-800 mb-0.5">{isDocBn ? 'নোট ও শর্তাবলি' : 'Notes & Terms'}</div>
                          <p>{effectiveDoc.invoice.notes}</p>
                        </div>
                      )}
                    </div>
                    <div className="w-full sm:w-72 space-y-2 text-sm">
                      <div className="flex justify-between text-slate-600">
                        <span>{isDocBn ? 'উপ-মোট মূল্য' : 'Subtotal'}</span>
                        <span className={numClass}>{money(effectiveDoc.invoice.subtotal)}</span>
                      </div>
                      {cashMemoIncludeVat && (
                        <div className="flex justify-between text-slate-600">
                          <span>{isDocBn ? 'মোট মূসক (VAT)' : 'Total VAT'}</span>
                          <span className={numClass}>{money(effectiveDoc.invoice.vatTotal)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-semibold text-slate-900 pt-2 border-t border-slate-200">
                        <span>{isDocBn ? 'সর্বমোট প্রদেয়' : 'Grand Total'}</span>
                        <span className={numClass}>{money(payableTotal)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-600">
                        <span>{isDocBn ? 'পরিশোধিত' : 'Paid'}</span>
                        <span className={numClass}>{money(paidAmount)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-semibold text-[#0F766E] pt-1 border-t border-slate-100">
                        <span>{isDocBn ? 'বকেয়া পরিমাণ' : 'Balance Due'}</span>
                        <span className={numClass}>{money(balanceDue)}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {renderFooterExtras()}
            </div>
          )}

          {effectiveDoc.type === 'delivery_challan' && (
            <div className="space-y-5 max-w-3xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-200 pb-5">
                <div className="flex items-start gap-3 min-w-0">
                  <OrganizationLogo logoUrl={org.logoUrl} orgName={isDocBn ? org.nameBn || org.name : org.name} size="md" />
                  <div className="min-w-0">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900">{isDocBn ? org.nameBn || org.name : org.name}</h2>
                    {org.tagline && <p className="text-xs font-medium text-[#0F766E] mt-0.5">{org.tagline}</p>}
                    {org.address && <p className="text-xs text-slate-600 mt-1">{org.address}</p>}
                    <p className="text-xs text-slate-600 mt-0.5">
                      BIN: <span className="font-mono font-semibold text-slate-800">{org.binNumber || '—'}</span> · TIN:{' '}
                      <span className="font-mono">{org.tinNumber || '—'}</span>
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {[org.phone, org.email, org.website].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
                <div className="sm:text-right">
                  <div className="text-base sm:text-lg font-bold tracking-tight text-[#0F766E]">
                    {isDocBn ? 'ডেলিভারি চালান' : 'DELIVERY CHALLAN'}
                  </div>
                  <div className="font-mono text-sm font-semibold text-slate-900 mt-0.5">
                    {effectiveDoc.invoice.challanNumber || effectiveDoc.invoice.mushakChallanNo || `CHL-${effectiveDoc.invoice.invoiceNumber}`}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {isDocBn ? 'মেমো/বিল নং' : 'Invoice Ref'}:{' '}
                    <span className="font-mono font-medium">{effectiveDoc.invoice.invoiceNumber}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs font-medium text-slate-500 mb-1">{isDocBn ? 'ডেলিভারি প্রাপক (Deliver To)' : 'Deliver To'}</div>
                  <div className="font-semibold text-slate-900">{effectiveDoc.invoice.customerName}</div>
                  {effectiveDoc.invoice.customerCompanyName && (
                    <div className="text-xs font-medium text-slate-700 mt-0.5">{effectiveDoc.invoice.customerCompanyName}</div>
                  )}
                  {effectiveDoc.invoice.customerAddress && <div className="text-xs text-slate-600 mt-0.5">{effectiveDoc.invoice.customerAddress}</div>}
                  {effectiveDoc.invoice.customerPhone && (
                    <div className="text-xs text-slate-600 mt-0.5">{effectiveDoc.invoice.customerPhone}</div>
                  )}
                </div>
                <div className="sm:text-right space-y-1 text-xs">
                  <div>
                    <span className="text-slate-500">{isDocBn ? 'চালান তারিখ' : 'Challan Date'}:</span>{' '}
                    <span className="font-medium text-slate-900">
                      {formatDate(effectiveDoc.invoice.challanDate || effectiveDoc.invoice.issueDate, docLang)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">{isDocBn ? 'শাখা / গুদাম' : 'Dispatch Branch'}:</span>{' '}
                    <span className="font-medium text-slate-900">
                      {isDocBn ? effectiveDoc.invoice.branchNameBn || effectiveDoc.invoice.branchName : effectiveDoc.invoice.branchName}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2 rounded-lg border border-teal-200 bg-teal-50/70 text-xs text-slate-900">
                <div>
                  <span className="font-semibold text-slate-600">P.O No:</span>{' '}
                  <span className="font-mono font-semibold">{effectiveDoc.invoice.poNumber || '—'}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-600">Challan No:</span>{' '}
                  <span className="font-mono font-bold text-[#0F766E]">
                    {effectiveDoc.invoice.challanNumber || effectiveDoc.invoice.mushakChallanNo || `CHL-${effectiveDoc.invoice.invoiceNumber}`}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-slate-600">Challan Date:</span>{' '}
                  <span className="font-semibold">
                    {formatDate(effectiveDoc.invoice.challanDate || effectiveDoc.invoice.issueDate, docLang)}
                  </span>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white text-xs">
                      <th className="py-2.5 px-3 text-center font-medium w-14">{isDocBn ? 'ক্রমিক' : 'SL'}</th>
                      <th className="py-2.5 px-3 text-left font-medium">{isDocBn ? 'পণ্যের বিবরণ ও স্পেসিফিকেশন' : 'Item Description & Specifications'}</th>
                      <th className="py-2.5 px-3 text-right font-medium w-28">{isDocBn ? 'পরিমাণ (Qty)' : 'Quantity'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {(effectiveDoc.invoice.items || []).map((line, idx) => {
                      const specsText = formatDocumentLineSpecs(line, resolvedMemo.config, isDocBn);
                      return (
                        <tr key={idx}>
                          <td className="py-2.5 px-3 text-center font-mono text-xs text-slate-500 align-top">
                            {formatNumber(idx + 1, docLang)}
                          </td>
                          <td className="py-2.5 px-3 text-slate-900 align-top">
                            <div className="font-semibold">{line.description}</div>
                            {specsText && <div className="text-xs text-slate-500 mt-0.5">{specsText}</div>}
                          </td>
                          <td className={`py-2.5 px-3 text-right font-bold text-slate-900 align-top ${numClass}`}>
                            {formatNumber(line.quantity, docLang)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-bold text-sm border-t border-slate-300">
                      <td colSpan={2} className="py-2.5 px-3 text-right">
                        {isDocBn ? 'মোট ডেলিভারি পরিমাণ' : 'Total Delivered Quantity'}
                      </td>
                      <td className={`py-2.5 px-3 text-right text-[#0F766E] ${numClass}`}>
                        {formatNumber(
                          (effectiveDoc.invoice.items || []).reduce((acc, item) => acc + Number(item.quantity || 0), 0),
                          docLang
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-8 text-xs font-semibold text-slate-700 text-center">
                <div className="border-t border-slate-400 pt-1.5">{isDocBn ? 'গ্রহীতার স্বাক্ষর' : 'Received By'}</div>
                <div className="border-t border-slate-400 pt-1.5">{isDocBn ? 'যাচাইকারী' : 'Checked By'}</div>
                <div className="border-t border-slate-400 pt-1.5">{isDocBn ? 'কর্তৃপক্ষের স্বাক্ষর' : 'Authorized Signature'}</div>
              </div>

              {renderFooterExtras()}
            </div>
          )}

          {effectiveDoc.type === 'quotation' && (
            <div className="space-y-5 max-w-3xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-200 pb-5">
                <div className="flex items-start gap-3 min-w-0">
                  <OrganizationLogo logoUrl={org.logoUrl} orgName={isDocBn ? org.nameBn || org.name : org.name} size="md" />
                  <div className="min-w-0">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900">{isDocBn ? org.nameBn || org.name : org.name}</h2>
                    {org.tagline && <p className="text-xs font-medium text-[#0F766E] mt-0.5">{org.tagline}</p>}
                    {org.address && <p className="text-xs text-slate-600 mt-1">{org.address}</p>}
                    <p className="text-xs text-slate-600 mt-0.5">
                      BIN: <span className="font-mono font-semibold text-slate-800">{org.binNumber || '—'}</span> · TIN:{' '}
                      <span className="font-mono">{org.tinNumber || '—'}</span>
                    </p>
                  </div>
                </div>
                <div className="sm:text-right">
                  <div className="text-base sm:text-lg font-bold tracking-tight text-[#0F766E]">
                    {isDocBn ? 'মূল্য প্রস্তাবনা / কোটেশন' : 'PRICE QUOTATION'}
                  </div>
                  <div className="font-mono text-sm font-semibold text-slate-900 mt-0.5">
                    {effectiveDoc.quotation.quotationNumber}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {isDocBn ? 'মেয়াদ' : 'Valid Until'}:{' '}
                    <span className="font-medium">{formatDate(effectiveDoc.quotation.validUntil, docLang)}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs font-medium text-slate-500 mb-1">{isDocBn ? 'গ্রাহক / প্রতিষ্ঠান' : 'Prepared For'}</div>
                  <div className="font-semibold text-slate-900">{effectiveDoc.quotation.customerName}</div>
                  {effectiveDoc.quotation.customerCompanyName && (
                    <div className="text-xs font-medium text-slate-700 mt-0.5">{effectiveDoc.quotation.customerCompanyName}</div>
                  )}
                  {effectiveDoc.quotation.customerAddress && <div className="text-xs text-slate-600 mt-0.5">{effectiveDoc.quotation.customerAddress}</div>}
                  {effectiveDoc.quotation.customerPhone && <div className="text-xs text-slate-600 mt-0.5">{effectiveDoc.quotation.customerPhone}</div>}
                </div>
                <div className="sm:text-right space-y-1 text-xs">
                  <div>
                    <span className="text-slate-500">{isDocBn ? 'ইস্যু তারিখ' : 'Issue Date'}:</span>{' '}
                    <span className="font-medium text-slate-900">{formatDate(effectiveDoc.quotation.issueDate, docLang)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">{isDocBn ? 'মেয়াদ উত্তীর্ণের তারিখ' : 'Valid Until'}:</span>{' '}
                    <span className="font-medium text-slate-900">{formatDate(effectiveDoc.quotation.validUntil, docLang)}</span>
                  </div>
                  {effectiveDoc.quotation.poNumber && (
                    <div>
                      <span className="text-slate-500">P.O / Ref No:</span>{' '}
                      <span className="font-mono font-medium text-slate-900">{effectiveDoc.quotation.poNumber}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                      <th className="py-2.5 px-3 text-left font-medium">#</th>
                      <th className="py-2.5 px-3 text-left font-medium">{isDocBn ? 'বিবরণ' : 'Description'}</th>
                      <th className="py-2.5 px-3 text-right font-medium">{isDocBn ? 'পরিমাণ' : 'Qty'}</th>
                      <th className="py-2.5 px-3 text-right font-medium">{isDocBn ? 'একক দর' : 'Rate'}</th>
                      <th className="py-2.5 px-3 text-right font-medium">{isDocBn ? 'মূসক' : 'VAT'}</th>
                      <th className="py-2.5 px-3 text-right font-medium">{isDocBn ? 'মোট' : 'Total'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(effectiveDoc.quotation.items || []).map((line, idx) => {
                      const specsText = formatDocumentLineSpecs(line, resolvedMemo.config, isDocBn);
                      return (
                        <tr key={idx}>
                          <td className="py-2.5 px-3 font-mono text-xs text-slate-500 align-top">{idx + 1}</td>
                          <td className="py-2.5 px-3 text-slate-900 align-top">
                            <div className="font-medium">{line.description}</div>
                            {specsText && <div className="text-xs text-slate-500 mt-0.5">{specsText}</div>}
                          </td>
                          <td className={`py-2.5 px-3 text-right align-top ${numClass}`}>{formatNumber(line.quantity, docLang)}</td>
                          <td className={`py-2.5 px-3 text-right align-top ${numClass}`}>{money(line.unitPrice)}</td>
                          <td className={`py-2.5 px-3 text-right align-top ${numClass}`}>{money(line.vatAmount)}</td>
                          <td className={`py-2.5 px-3 text-right font-semibold align-top ${numClass}`}>{money(line.lineTotal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col sm:flex-row justify-between gap-6 pt-2">
                <div className="text-xs text-slate-600 max-w-sm space-y-2">
                  <div>
                    <span className="font-semibold text-slate-800">{isDocBn ? 'কথায়' : 'In Words'}:</span>{' '}
                    {amountToWords(effectiveDoc.quotation.grandTotal, docLang)}
                  </div>
                  {effectiveDoc.quotation.notes && (
                    <div>
                      <div className="font-medium text-slate-800 mb-0.5">{isDocBn ? 'শর্তাবলি ও নোট' : 'Terms & Conditions'}</div>
                      <p>{effectiveDoc.quotation.notes}</p>
                    </div>
                  )}
                </div>
                <div className="w-full sm:w-72 space-y-2 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>{isDocBn ? 'উপ-মোট' : 'Subtotal'}</span>
                    <span className={numClass}>{money(effectiveDoc.quotation.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>{isDocBn ? 'মোট মূসক (VAT)' : 'Total VAT'}</span>
                    <span className={numClass}>{money(effectiveDoc.quotation.vatTotal)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-[#0F766E] pt-2 border-t border-slate-200">
                    <span>{isDocBn ? 'সর্বমোট প্রস্তাবিত মূল্য' : 'Total Quoted'}</span>
                    <span className={numClass}>{money(effectiveDoc.quotation.grandTotal)}</span>
                  </div>
                </div>
              </div>

              {renderFooterExtras()}
            </div>
          )}

          {effectiveDoc.type === 'mushak_63' && (
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
                  <div><span className="text-slate-500">চালানপত্র নম্বর:</span> <span className="font-mono font-semibold">{effectiveDoc.invoice.mushakChallanNo}</span></div>
                  <div><span className="text-slate-500">ইস্যুর তারিখ:</span> <span className="tabular-nums">{formatDate(effectiveDoc.invoice.issueDate, 'bn')}</span></div>
                  <div><span className="text-slate-500">ক্রেতার নাম:</span> <span className="font-semibold">{effectiveDoc.invoice.customerName}</span></div>
                  <div><span className="text-slate-500">ক্রেতার বিআইএন:</span> <span className="font-mono">{effectiveDoc.invoice.customerBin || 'প্রযোজ্য নয়'}</span></div>
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
                    {(effectiveDoc.invoice.items || []).map((line, i) => (
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
                      <td className="border border-slate-300 p-2 text-right tabular-nums">{formatMoney(effectiveDoc.invoice.subtotal, 'bn', '')}</td>
                      <td className="border border-slate-300 p-2"></td>
                      <td className="border border-slate-300 p-2 text-right tabular-nums">{formatMoney(effectiveDoc.invoice.vatTotal, 'bn', '')}</td>
                      <td className="border border-slate-300 p-2 text-right tabular-nums">{formatMoney(effectiveDoc.invoice.grandTotal, 'bn', '৳')}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Mobile Stacked Mushak 6.3 Lines */}
              <div className="sm:hidden border border-slate-200 rounded-xl divide-y divide-slate-200 text-xs">
                {(effectiveDoc.invoice.items || []).map((line, i) => (
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
                    <span>{formatMoney(effectiveDoc.invoice.subtotal, 'bn', '৳')}</span>
                  </div>
                  <div className="flex justify-between tabular-nums">
                    <span>মোট মূসক</span>
                    <span>{formatMoney(effectiveDoc.invoice.vatTotal, 'bn', '৳')}</span>
                  </div>
                  <div className="flex justify-between tabular-nums text-[#0F766E] pt-1 border-t border-slate-200">
                    <span>সর্বমোট করসহ মূল্য</span>
                    <span>{formatMoney(effectiveDoc.invoice.grandTotal, 'bn', '৳')}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-between gap-4 pt-4 text-xs text-slate-600">
                <div>
                  <div className="border-t border-slate-400 pt-1.5 w-48">প্রতিষ্ঠান কর্তৃপক্ষের স্বাক্ষর ও সিল</div>
                </div>
                <div className="sm:text-right">
                  <div>সিস্টেম জেনারেটেড মূসক ৬.৩ চালান</div>
                  <div className="font-mono text-[11px] text-slate-500 mt-0.5">Ref: {effectiveDoc.invoice.invoiceNumber}</div>
                </div>
              </div>
            </div>
          )}

          {effectiveDoc.type === 'pos_receipt' && (
            <div className="max-w-3xl mx-auto">
              <CashMemoPreviewFrame
                invoice={effectiveDoc.invoice}
                org={org}
                lang={docLang}
                includeVat={cashMemoIncludeVat}
              />
            </div>
          )}

          {effectiveDoc.type === 'statement' && (
            <div className="space-y-5 max-w-3xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-200 pb-4">
                <div className="flex items-start gap-3 min-w-0">
                  <OrganizationLogo logoUrl={org.logoUrl} orgName={isDocBn ? org.nameBn || org.name : org.name} size="md" />
                  <div className="min-w-0">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900">{isDocBn ? org.nameBn || org.name : org.name}</h2>
                    {org.tagline && <p className="text-xs font-medium text-[#0F766E] mt-0.5">{org.tagline}</p>}
                    {org.address && <p className="text-xs text-slate-600 mt-1">{org.address}</p>}
                    {(org.phone || org.website) && (
                      <p className="text-xs text-slate-500 mt-0.5">{[org.phone, org.website].filter(Boolean).join(' · ')}</p>
                    )}
                  </div>
                </div>
                <div className="sm:text-right">
                  <div className="text-base sm:text-lg font-semibold text-slate-900">
                    {isDocBn ? 'কাস্টমার লেজার স্টেটমেন্ট' : 'CUSTOMER STATEMENT'}
                  </div>
                  <div className="text-sm font-medium text-slate-800 mt-0.5">{effectiveDoc.customer.name}</div>
                  {effectiveDoc.customer.companyName && <div className="text-xs text-slate-500">{effectiveDoc.customer.companyName}</div>}
                </div>
              </div>

              {/* Desktop Statement Table */}
              <div className="hidden sm:block">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-y border-slate-200 bg-slate-50 text-xs text-slate-600">
                      <th className="py-2.5 px-3 text-left font-medium">{isDocBn ? 'তারিখ' : 'Date'}</th>
                      <th className="py-2.5 px-3 text-left font-medium">{isDocBn ? 'রেফারেন্স' : 'Reference'}</th>
                      <th className="py-2.5 px-3 text-left font-medium">{isDocBn ? 'বিবরণ' : 'Description'}</th>
                      <th className="py-2.5 px-3 text-right font-medium">{isDocBn ? 'ডেবিট (বিল)' : 'Debit (Invoiced)'}</th>
                      <th className="py-2.5 px-3 text-right font-medium">{isDocBn ? 'ক্রেডিট (জমা)' : 'Credit (Paid)'}</th>
                      <th className="py-2.5 px-3 text-right font-medium">{isDocBn ? 'চলতি জের' : 'Running Balance'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {effectiveDoc.rows.map((r, idx) => (
                      <tr key={idx}>
                        <td className="py-2.5 px-3 text-xs text-slate-600 whitespace-nowrap">{r.date ? formatDate(r.date, docLang) : '—'}</td>
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
                {effectiveDoc.rows.map((r, idx) => (
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
                      <span>{r.date ? formatDate(r.date, docLang) : '—'}</span>
                      <div className={`flex gap-3 ${numClass}`}>
                        {r.debit > 0 && <span>{isDocBn ? 'বিল' : 'Dr'}: {money(r.debit)}</span>}
                        {r.credit > 0 && <span className="text-emerald-700">{isDocBn ? 'জমা' : 'Cr'}: {money(r.credit)}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-2">
                <div className="w-full sm:w-64 border-t border-slate-300 pt-3 flex justify-between text-sm font-semibold">
                  <span>{isDocBn ? 'সমাপনী পাওনা' : 'Closing Balance'}</span>
                  <span className={`text-[#0F766E] ${numClass}`}>{money(effectiveDoc.closingBalance)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mobile Sticky Bottom CTA */}
        <div className="sm:hidden px-3 py-3 pb-safe border-t border-slate-200 bg-white">
          {effectiveDoc.type === 'pos_receipt' ? (
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
                  <span>{isUiBn ? 'মূসক সহ PDF' : 'With Mushak'}</span>
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
                  <span>{isUiBn ? 'মূসক ছাড়া PDF' : 'No Mushak'}</span>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleTerminalPrint}
                  className="h-10 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 active:scale-[0.98] rounded-xl transition-transform whitespace-nowrap"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-600" />
                  <span>{isUiBn ? 'টার্মিনাল প্রিন্ট' : 'Terminal Print'}</span>
                </button>
                <button
                  type="button"
                  disabled={downloading}
                  onClick={() => handleDownloadPdf('challan')}
                  className="h-10 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 active:scale-[0.98] rounded-xl transition-transform whitespace-nowrap"
                >
                  <Truck className="w-3.5 h-3.5 text-teal-700" />
                  <span>{isUiBn ? 'ডেলিভারি চালান' : 'Delivery Challan'}</span>
                </button>
              </div>
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
                ? isUiBn
                  ? 'পিডিএফ তৈরি হচ্ছে...'
                  : 'Generating PDF...'
                : isUiBn
                  ? 'PDF ডাউনলোড করুন'
                  : 'Download PDF'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

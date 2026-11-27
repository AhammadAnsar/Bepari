import { useMemo, useState } from 'react';
import { Download, Eye, FileSpreadsheet, FileText, Loader2, Receipt, RotateCcw, Search } from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import { formatDate, formatMoney } from '../engine/format';
import type { Invoice, Language } from '../engine/types';
import { DICT } from '../i18n/translations';
import { apiRequest, type WorkspacePayload } from '../lib/api';
import { downloadPdfDocument } from '../lib/pdfExport';
import type { PdfExportSpec } from '../lib/pdfTemplates';

interface Props {
  data: WorkspacePayload;
  lang: Language;
  subtab: string;
  onSubtabChange: (tab: string) => void;
  onPreviewInvoice?: (invoice: Invoice) => void;
  onPreviewMushak?: (invoice: Invoice) => void;
  onRefresh: () => Promise<void>;
}

export function AccountingReportsWorkspace({
  data,
  lang,
  subtab,
  onSubtabChange,
  onPreviewInvoice,
  onPreviewMushak,
  onRefresh,
}: Props) {
  const t = DICT[lang];
  const isBn = lang === 'bn';
  const { notify } = useFeedback();
  const money = (v: number) => formatMoney(v, lang, data.organization.currencySymbol);
  const numClass = isBn ? 'tabular-nums' : 'font-mono tabular-nums';
  const { profitAndLoss, balanceSheet, cashFlow, trialBalance } = data.reports;

  const [reversingId, setReversingId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [vaultQuery, setVaultQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const filteredDocuments = useMemo(() => {
    const q = vaultQuery.trim().toLowerCase();
    if (!q) return data.documents;
    return data.documents.filter(
      (doc) =>
        doc.title.toLowerCase().includes(q) ||
        doc.referenceNumber.toLowerCase().includes(q) ||
        doc.partyName.toLowerCase().includes(q),
    );
  }, [data.documents, vaultQuery]);

  const triggerVaultPdf = async (key: string, spec: PdfExportSpec) => {
    setBusyKey(key);
    setError(null);
    try {
      await downloadPdfDocument(spec, data.organization, lang);
      notify({ title: isBn ? 'ডকুমেন্ট PDF ডাউনলোড হয়েছে।' : 'Document PDF downloaded.', variant: 'info', sound: 'export' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to download PDF.';
      setError(msg);
      notify({ title: msg, variant: 'error' });
    } finally {
      setBusyKey(null);
    }
  };

  const openDocumentPreview = (docType: string, entityId: number) => {
    const inv = data.invoices.find((i) => i.id === entityId);
    if (!inv) return;
    if (docType === 'mushak_63') {
      onPreviewMushak?.(inv);
    } else {
      onPreviewInvoice?.(inv);
    }
  };

  const handleReverse = async (id: number) => {
    setReversingId(id);
    setError(null);
    try {
      await apiRequest(`/api/journals/${id}/reverse`, {
        method: 'POST',
        body: { reason: isBn ? 'অ্যাকাউন্টিং সমন্বয় রিভার্সাল' : 'Ledger adjustment reversal' },
      });
      notify({
        title: isBn ? 'জার্নাল রিভার্সাল এন্ট্রি পোস্ট হয়েছে।' : 'Journal reversal entry posted.',
        variant: 'warning',
        sound: 'save',
      });
      await onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reverse entry.';
      setError(msg);
      notify({ title: msg, variant: 'error' });
    } finally {
      setReversingId(null);
    }
  };

  const handleDownloadActiveReport = async () => {
    setExporting(true);
    setError(null);
    try {
      const spec: PdfExportSpec =
        subtab === 'balanceSheet'
          ? { type: 'balance_sheet', reports: data.reports }
          : subtab === 'cashFlow'
            ? { type: 'cash_flow', reports: data.reports }
            : subtab === 'trialBalance'
              ? { type: 'trial_balance', reports: data.reports }
              : subtab === 'ledger'
                ? { type: 'journal_ledger', journals: data.journals }
                : { type: 'pnl', reports: data.reports };
      await downloadPdfDocument(spec, data.organization, lang);
      notify({ title: isBn ? 'রিপোর্ট PDF ডাউনলোড হয়েছে।' : 'Financial report PDF downloaded.', variant: 'info', sound: 'export' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to download report PDF.';
      setError(msg);
      notify({ title: msg, variant: 'error' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'pnl', label: t.tabs.pnl },
            { id: 'balanceSheet', label: t.tabs.balanceSheet },
            { id: 'cashFlow', label: t.tabs.cashFlow },
            { id: 'trialBalance', label: t.tabs.trialBalance },
            { id: 'ledger', label: t.tabs.ledger },
            { id: 'vault', label: t.tabs.vault },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSubtabChange(tab.id)}
              className={`min-h-[38px] sm:min-h-0 px-3 py-2 text-xs font-medium rounded-xl sm:rounded-lg transition-colors whitespace-nowrap active:scale-[0.98] ${
                subtab === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-white sm:bg-transparent border border-slate-200 sm:border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
          <span className={`text-xs font-medium whitespace-nowrap ${trialBalance.isBalanced ? 'text-emerald-700' : 'text-rose-700'}`}>
            {trialBalance.isBalanced ? t.labels.balanced : t.labels.unbalanced}
          </span>
          {subtab !== 'vault' && (
            <button
              type="button"
              disabled={exporting}
              onClick={handleDownloadActiveReport}
              className="min-h-[40px] sm:min-h-0 inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#0F766E] hover:bg-[#115E59] disabled:opacity-60 rounded-xl sm:rounded-lg transition-colors whitespace-nowrap active:scale-[0.98]"
            >
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {exporting ? (isBn ? 'তৈরি হচ্ছে...' : 'Exporting...') : t.actions.print}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl">
          {error}
        </div>
      )}

      {/* PROFIT & LOSS */}
      {subtab === 'pnl' && (
        <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl overflow-hidden max-w-3xl">
          <div className="px-4 sm:px-5 py-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">{t.tabs.pnl}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isBn ? 'পোস্টেড ডাবল-এন্ট্রি লেজার থেকে সরাসরি প্রস্তুতকৃত' : 'Computed live from posted double-entry general ledger'}
            </p>
          </div>
          <div className="p-4 sm:p-5 space-y-6 text-sm">
            <div>
              <div className="text-xs font-semibold text-slate-500 pb-2 border-b border-slate-200">
                {isBn ? 'আয় (Revenue)' : 'Revenue'}
              </div>
              <div className="divide-y divide-slate-100">
                {profitAndLoss.revenue.map((r) => (
                  <div key={r.code} className="py-2.5 flex justify-between gap-3">
                    <span className="text-slate-800 min-w-0">
                      <span className="font-mono text-xs text-slate-400 mr-2">{r.code}</span>
                      {isBn ? r.nameBn : r.name}
                    </span>
                    <span className={`font-medium shrink-0 ${numClass}`}>{money(r.amount)}</span>
                  </div>
                ))}
                {profitAndLoss.revenue.length === 0 && (
                  <div className="py-3 text-xs text-slate-400">{isBn ? 'কোনো আয় লিপিবদ্ধ নেই' : 'No revenue posted'}</div>
                )}
              </div>
              <div className="flex justify-between font-semibold text-slate-900 pt-2 border-t border-slate-200">
                <span>{isBn ? 'মোট আয়' : 'Total Revenue'}</span>
                <span className={numClass}>{money(profitAndLoss.totalRevenue)}</span>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-500 pb-2 border-b border-slate-200">
                {isBn ? 'ব্যয় ও বিক্রীত পণ্যের খরচ (COGS & Expenses)' : 'Cost of Goods Sold & Operating Expenses'}
              </div>
              <div className="divide-y divide-slate-100">
                {profitAndLoss.expenses.map((ex) => (
                  <div key={ex.code} className="py-2.5 flex justify-between gap-3">
                    <span className="text-slate-800 min-w-0">
                      <span className="font-mono text-xs text-slate-400 mr-2">{ex.code}</span>
                      {isBn ? ex.nameBn : ex.name}
                    </span>
                    <span className={`shrink-0 ${numClass}`}>{money(ex.amount)}</span>
                  </div>
                ))}
                {profitAndLoss.expenses.length === 0 && (
                  <div className="py-3 text-xs text-slate-400">{isBn ? 'কোনো ব্যয় লিপিবদ্ধ নেই' : 'No expenses posted'}</div>
                )}
              </div>
              <div className="flex justify-between font-semibold text-slate-900 pt-2 border-t border-slate-200">
                <span>{isBn ? 'মোট ব্যয়' : 'Total Expenses'}</span>
                <span className={numClass}>{money(profitAndLoss.totalExpenses)}</span>
              </div>
            </div>

            <div className="pt-3 border-t-2 border-slate-900 flex justify-between text-base font-bold">
              <span>{t.metrics.netProfit}</span>
              <span className={`${numClass} ${profitAndLoss.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {money(profitAndLoss.netProfit)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* BALANCE SHEET */}
      {subtab === 'balanceSheet' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-start">
          <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl p-4 sm:p-5 space-y-4">
            <div className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-200">
              {isBn ? 'সম্পদ (Assets)' : 'Assets'}
            </div>
            <div className="divide-y divide-slate-100 text-sm">
              {balanceSheet.assets.map((a) => (
                <div key={a.code} className="py-2.5 flex justify-between gap-3">
                  <span className="min-w-0">
                    <span className="font-mono text-xs text-slate-400 mr-2">{a.code}</span>
                    {isBn ? a.nameBn : a.name}
                  </span>
                  <span className={`font-medium shrink-0 ${numClass}`}>{money(a.amount)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between font-bold text-slate-900 pt-3 border-t-2 border-slate-900">
              <span>{isBn ? 'মোট সম্পদ' : 'Total Assets'}</span>
              <span className={numClass}>{money(balanceSheet.totalAssets)}</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl p-4 sm:p-5 space-y-5">
            <div>
              <div className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-200">
                {isBn ? 'দায় (Liabilities)' : 'Liabilities'}
              </div>
              <div className="divide-y divide-slate-100 text-sm">
                {balanceSheet.liabilities.map((l) => (
                  <div key={l.code} className="py-2.5 flex justify-between gap-3">
                    <span className="min-w-0">
                      <span className="font-mono text-xs text-slate-400 mr-2">{l.code}</span>
                      {isBn ? l.nameBn : l.name}
                    </span>
                    <span className={`font-medium shrink-0 ${numClass}`}>{money(l.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between font-semibold text-slate-800 pt-2 border-t border-slate-200 text-sm">
                <span>{isBn ? 'মোট দায়' : 'Total Liabilities'}</span>
                <span className={numClass}>{money(balanceSheet.totalLiabilities)}</span>
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-200">
                {isBn ? 'মালিকানা স্বত্ব (Equity)' : 'Equity'}
              </div>
              <div className="divide-y divide-slate-100 text-sm">
                {balanceSheet.equity.map((eq) => (
                  <div key={eq.code} className="py-2.5 flex justify-between gap-3">
                    <span className="min-w-0">
                      <span className="font-mono text-xs text-slate-400 mr-2">{eq.code}</span>
                      {isBn ? eq.nameBn : eq.name}
                    </span>
                    <span className={`font-medium shrink-0 ${numClass}`}>{money(eq.amount)}</span>
                  </div>
                ))}
                <div className="py-2.5 flex justify-between gap-3">
                  <span className="text-slate-700">{isBn ? 'চলতি নিট মুনাফা (Retained Earnings)' : 'Current Period Net Profit'}</span>
                  <span className={`font-medium shrink-0 ${numClass}`}>{money(balanceSheet.retainedEarnings)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-between font-bold text-slate-900 pt-3 border-t-2 border-slate-900">
              <span>{isBn ? 'মোট দায় ও মালিকানা স্বত্ব' : 'Total Liabilities & Equity'}</span>
              <span className={`text-[#0F766E] shrink-0 ${numClass}`}>
                {money(balanceSheet.totalLiabilities + balanceSheet.totalEquity)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* CASH FLOW */}
      {subtab === 'cashFlow' && (
        <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl p-4 sm:p-6 max-w-2xl space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-200">
            {t.tabs.cashFlow}
          </h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-slate-600">{isBn ? 'মোট নগদ, ব্যাংক ও MFS জমা (Inflows)' : 'Cash, Bank & MFS Inflows'}</span>
              <span className={`font-medium text-emerald-700 shrink-0 ${numClass}`}>{money(cashFlow.operatingInflows)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-600">{isBn ? 'মোট নগদ ও ব্যাংক ব্যয় (Outflows)' : 'Cash & Bank Outflows'}</span>
              <span className={`font-medium text-rose-700 shrink-0 ${numClass}`}>({money(cashFlow.operatingOutflows)})</span>
            </div>
            <div className="flex justify-between gap-3 font-bold text-base pt-3 border-t border-slate-200">
              <span>{isBn ? 'সমাপনী নগদ ও ব্যাংক স্থিতি' : 'Ending Cash & Bank Balance'}</span>
              <span className={`text-[#0F766E] shrink-0 ${numClass}`}>{money(cashFlow.endingCashBalance)}</span>
            </div>
          </div>
        </div>
      )}

      {/* TRIAL BALANCE */}
      {subtab === 'trialBalance' && (
        <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden md:block">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                  <th className="py-2.5 px-4 text-left font-medium">{isBn ? 'কোড' : 'Code'}</th>
                  <th className="py-2.5 px-4 text-left font-medium">{isBn ? 'হিসাবের শিরোনাম' : 'Account'}</th>
                  <th className="py-2.5 px-4 text-left font-medium">{isBn ? 'ধরন' : 'Type'}</th>
                  <th className="py-2.5 px-4 text-right font-medium">{t.labels.debit}</th>
                  <th className="py-2.5 px-4 text-right font-medium">{t.labels.credit}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trialBalance.rows.map((r) => (
                  <tr key={r.accountCode}>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-500">{r.accountCode}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-900">{isBn ? r.accountNameBn : r.accountName}</td>
                    <td className="py-2.5 px-4 text-xs capitalize text-slate-500">{r.accountType}</td>
                    <td className={`py-2.5 px-4 text-right ${numClass}`}>{r.debit > 0 ? money(r.debit) : '—'}</td>
                    <td className={`py-2.5 px-4 text-right ${numClass}`}>{r.credit > 0 ? money(r.credit) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-900 bg-slate-50 font-bold">
                  <td colSpan={3} className="py-3 px-4 text-right">{t.labels.total}</td>
                  <td className={`py-3 px-4 text-right ${numClass}`}>{money(trialBalance.totalDebit)}</td>
                  <td className={`py-3 px-4 text-right ${numClass}`}>{money(trialBalance.totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile Card Rows (Zero Horizontal Scroll) */}
          <div className="md:hidden divide-y divide-slate-100">
            {trialBalance.rows.map((r) => (
              <div key={r.accountCode} className="p-4 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900">
                      <span className="font-mono text-xs text-slate-400 mr-1.5">{r.accountCode}</span>
                      {isBn ? r.accountNameBn : r.accountName}
                    </div>
                    <div className="text-[11px] capitalize text-slate-500">{r.accountType}</div>
                  </div>
                </div>
                <div className={`grid grid-cols-2 gap-2 pt-1 text-xs ${numClass}`}>
                  <div>
                    <span className="text-slate-500">{t.labels.debit}: </span>
                    <span className="font-medium text-slate-900">{r.debit > 0 ? money(r.debit) : '—'}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500">{t.labels.credit}: </span>
                    <span className="font-medium text-slate-900">{r.credit > 0 ? money(r.credit) : '—'}</span>
                  </div>
                </div>
              </div>
            ))}
            <div className="p-4 bg-slate-50 border-t-2 border-slate-900 grid grid-cols-2 gap-2 text-xs font-bold">
              <div className={numClass}>
                <div className="text-slate-500 font-medium">{t.labels.debit} ({t.labels.total})</div>
                <div className="text-sm text-slate-900 mt-0.5">{money(trialBalance.totalDebit)}</div>
              </div>
              <div className={`text-right ${numClass}`}>
                <div className="text-slate-500 font-medium">{t.labels.credit} ({t.labels.total})</div>
                <div className="text-sm text-slate-900 mt-0.5">{money(trialBalance.totalCredit)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* IMMUTABLE DOUBLE-ENTRY JOURNAL LEDGER */}
      {subtab === 'ledger' && (
        <div className="space-y-3">
          {data.journals.map((je) => (
            <div key={je.id} className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                  <span className="font-mono font-semibold text-slate-900">{je.entryNumber}</span>
                  <span className="text-slate-300" aria-hidden="true">·</span>
                  <span className="text-slate-600">{formatDate(je.entryDate, lang)}</span>
                  <span className="text-slate-300" aria-hidden="true">·</span>
                  <span className="text-slate-800 font-medium">{je.description}</span>
                  <span className="text-slate-300" aria-hidden="true">·</span>
                  <span className={je.status === 'reversed' ? 'text-amber-700 font-medium' : 'text-emerald-700 font-medium'}>
                    {t.status[je.status]}
                  </span>
                </div>
                {je.status === 'posted' && je.sourceType !== 'reversal' && (
                  <button
                    type="button"
                    disabled={reversingId === je.id}
                    onClick={() => handleReverse(je.id)}
                    className="min-h-[36px] sm:min-h-0 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 hover:text-rose-700 hover:bg-rose-50 border border-slate-200 rounded-lg whitespace-nowrap"
                  >
                    <RotateCcw className="w-3 h-3" />
                    {t.actions.reverse}
                  </button>
                )}
              </div>

              {/* Desktop Journal Lines */}
              <div className="hidden md:block">
                <table className="w-full text-xs border-collapse">
                  <tbody className="divide-y divide-slate-100">
                    {je.lines.map((line, i) => (
                      <tr key={i}>
                        <td className="py-2 px-4 font-mono text-slate-500 w-20">{line.accountCode}</td>
                        <td className="py-2 px-4 text-slate-900">{line.accountName}</td>
                        <td className="py-2 px-4 text-slate-500">{line.memo}</td>
                        <td className={`py-2 px-4 text-right w-32 ${numClass}`}>
                          {line.debit > 0 ? money(line.debit) : ''}
                        </td>
                        <td className={`py-2 px-4 text-right w-32 ${numClass}`}>
                          {line.credit > 0 ? money(line.credit) : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Stacked Journal Lines */}
              <div className="md:hidden divide-y divide-slate-100 text-xs">
                {je.lines.map((line, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900">
                        <span className="font-mono text-slate-400 mr-1.5">{line.accountCode}</span>
                        {line.accountName}
                      </div>
                      {line.memo && <div className="text-[11px] text-slate-500 truncate mt-0.5">{line.memo}</div>}
                    </div>
                    <div className={`text-right shrink-0 ${numClass}`}>
                      {line.debit > 0 ? (
                        <div className="font-medium text-slate-900">
                          <span className="text-[10px] text-slate-400 mr-1">{t.labels.debit}</span>
                          {money(line.debit)}
                        </div>
                      ) : (
                        <div className="font-medium text-[#0F766E]">
                          <span className="text-[10px] text-slate-400 mr-1">{t.labels.credit}</span>
                          {money(line.credit)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* DOCUMENT VAULT & ONE-CLICK PDF STATEMENTS */}
      {subtab === 'vault' && (
        <div className="space-y-5">
          <section className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">
                {isBn ? 'ফাইন্যান্সিয়াল ও মূসক স্টেটমেন্ট PDF' : 'Financial & VAT Statement Exports'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {isBn ? 'লাইভ পোস্টেড লেজার থেকে সরাসরি A4 পিডিএফ ডাউনলোড করুন' : 'Generate A4 PDF statements directly from live posted ledger'}
              </p>
            </div>
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {(
                [
                  { key: 'pnl', label: t.tabs.pnl, spec: { type: 'pnl', reports: data.reports } },
                  { key: 'bs', label: t.tabs.balanceSheet, spec: { type: 'balance_sheet', reports: data.reports } },
                  { key: 'cf', label: t.tabs.cashFlow, spec: { type: 'cash_flow', reports: data.reports } },
                  { key: 'tb', label: t.tabs.trialBalance, spec: { type: 'trial_balance', reports: data.reports } },
                  { key: 'm91', label: t.tabs.mushak91, spec: { type: 'mushak_91', reports: data.reports } },
                  { key: 'ledger', label: t.tabs.ledger, spec: { type: 'journal_ledger', journals: data.journals } },
                ] as { key: string; label: string; spec: PdfExportSpec }[]
              ).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  disabled={busyKey === item.key}
                  onClick={() => triggerVaultPdf(item.key, item.spec)}
                  className="min-h-[46px] px-3 py-2.5 flex items-center justify-between gap-2 text-left text-xs font-medium text-slate-800 bg-slate-50 hover:bg-[#0F766E]/10 hover:text-[#0F766E] border border-slate-200 rounded-xl transition-colors active:scale-[0.98]"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <FileSpreadsheet className="w-4 h-4 text-[#0F766E] shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {busyKey === item.key ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-[#0F766E]" />
                  ) : (
                    <Download className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                  )}
                </button>
              ))}
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  {isBn ? 'সংরক্ষিত ডকুমেন্ট ভল্ট (ইনভয়েস, মূসক ৬.৩ ও রসিদ)' : 'Archived Document Vault (Invoices, Mushak 6.3 & Receipts)'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isBn ? 'নম্বর বা কাস্টমার দিয়ে খুঁজুন এবং প্রিভিউ বা PDF ডাউনলোড করুন' : 'Search by voucher number or party to preview or download PDF'}
                </p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={vaultQuery}
                  onChange={(e) => setVaultQuery(e.target.value)}
                  placeholder={isBn ? 'নম্বর বা কাস্টমার খুঁজুন...' : 'Filter documents...'}
                  aria-label="Filter document vault"
                  className="w-full h-9 pl-8 pr-3 text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:border-[#0F766E] rounded-lg text-slate-900 focus:outline-none"
                />
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {filteredDocuments.map((doc) => {
                const inv = doc.entityType === 'invoice' ? data.invoices.find((i) => i.id === doc.entityId) : undefined;
                const docKey = `doc-${doc.id}`;
                return (
                  <div key={doc.id} className="px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-slate-50/70">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{doc.title}</div>
                      <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-2 mt-0.5">
                        <span className="font-mono">{doc.referenceNumber}</span>
                        <span aria-hidden="true">·</span>
                        <span>{doc.partyName}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatDate(doc.issuedAt, lang)}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0">
                      <span className={`text-sm font-semibold text-slate-900 ${numClass}`}>
                        {money(doc.amount)}
                      </span>
                      {inv && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openDocumentPreview(doc.docType, doc.entityId)}
                            aria-label={`Preview ${doc.referenceNumber}`}
                            className="min-h-[38px] min-w-[38px] sm:min-h-0 sm:min-w-0 sm:p-1.5 inline-flex items-center justify-center text-slate-600 border border-slate-200 sm:border-transparent hover:bg-slate-100 rounded-xl sm:rounded-md"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={busyKey === docKey}
                            onClick={() =>
                              triggerVaultPdf(docKey, {
                                type: doc.docType === 'mushak_63' ? 'mushak_63' : 'invoice',
                                invoice: inv,
                              })
                            }
                            className="min-h-[38px] sm:min-h-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0F766E] bg-[#0F766E]/10 hover:bg-[#0F766E]/15 rounded-xl sm:rounded-md whitespace-nowrap"
                          >
                            {busyKey === docKey ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : doc.docType === 'mushak_63' ? (
                              <Receipt className="w-3.5 h-3.5" />
                            ) : (
                              <FileText className="w-3.5 h-3.5" />
                            )}
                            {t.actions.print}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {filteredDocuments.length === 0 && (
                <div className="p-8 text-center text-xs text-slate-500">
                  {isBn ? 'কোনো ডকুমেন্ট পাওয়া যায়নি।' : 'No matching archived documents found.'}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

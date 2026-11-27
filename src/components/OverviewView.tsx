import { ArrowRight, Download, FileText, Plus, Receipt, ShieldCheck } from 'lucide-react';
import { formatDate, formatMoney } from '../engine/format';
import type { Invoice, Language } from '../engine/types';
import { DICT } from '../i18n/translations';
import type { WorkspacePayload } from '../lib/api';
import { downloadPdfDocument } from '../lib/pdfExport';

interface Props {
  data: WorkspacePayload;
  lang: Language;
  onNewInvoice: () => void;
  onReceivePayment: (invoice?: Invoice) => void;
  onNavigate: (section: string, subtab?: string, openForm?: boolean) => void;
  onPreviewInvoice: (invoice: Invoice) => void;
  onPreviewMushak: (invoice: Invoice) => void;
}

export function OverviewView({
  data,
  lang,
  onNewInvoice,
  onReceivePayment,
  onNavigate,
  onPreviewInvoice,
  onPreviewMushak,
}: Props) {
  const t = DICT[lang];
  const isBn = lang === 'bn';
  const money = (v: number) => formatMoney(v, lang, data.organization.currencySymbol);

  const hasTransactions =
    data.invoices.length > 0 || data.expenses.length > 0 || data.purchases.length > 0;

  if (!hasTransactions) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 sm:p-12 text-center max-w-2xl mx-auto my-6">
        <h2 className="text-lg font-semibold text-slate-900">{t.empty.noInvoicesTitle}</h2>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed max-w-lg mx-auto">
          {t.empty.noInvoicesDesc}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onNewInvoice}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#0F766E] hover:bg-[#115E59] rounded-lg transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            {t.actions.newInvoice}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('products')}
            className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
          >
            {t.actions.newProduct}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('customers', undefined, true)}
            className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
          >
            {t.actions.newCustomer}
          </button>
        </div>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const totalReceivable = data.invoices
    .filter((i) => i.status !== 'void')
    .reduce((acc, inv) => acc + inv.balanceDue, 0);
  const overdueAmount = data.invoices
    .filter((i) => i.status !== 'void' && i.balanceDue > 0 && i.dueDate < today)
    .reduce((acc, inv) => acc + inv.balanceDue, 0);

  const { profitAndLoss, cashFlow, vatReturn, trialBalance } = data.reports;
  const numClass = isBn ? 'tabular-nums tracking-tight' : 'font-mono tabular-nums';

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Calm, Trustworthy Workspace Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-slate-900 truncate">
            {isBn ? data.organization.nameBn : data.organization.name}
          </h1>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-slate-500 mt-1">
            <span>
              BIN <span className="font-mono text-slate-700">{data.organization.binNumber}</span>
            </span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 text-[#0F766E] font-medium">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              {trialBalance.isBalanced ? t.labels.balanced : t.labels.unbalanced}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('reports', 'pnl')}
          className="self-start sm:self-auto inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-[#0F766E] transition-colors whitespace-nowrap"
        >
          <span>{isBn ? 'সম্পূর্ণ আর্থিক বিবরণী' : 'Full Financial Statements'}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Symmetrical 2x2 Mobile / 4x1 Desktop Hairline KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200/90 border border-slate-200 rounded-2xl sm:rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="bg-white p-4 sm:p-5 min-w-0">
          <div className="text-xs font-medium text-slate-500">{t.metrics.totalReceivable}</div>
          <div className={`text-lg sm:text-2xl font-semibold text-slate-900 mt-2 truncate ${numClass}`}>
            {money(totalReceivable)}
          </div>
          <div className={`text-xs mt-1.5 ${overdueAmount > 0 ? 'text-rose-700 font-medium' : 'text-slate-500'} ${numClass}`}>
            {overdueAmount > 0
              ? `${t.metrics.overdueInvoices}: ${money(overdueAmount)}`
              : isBn
                ? 'কোনো মেয়াদোত্তীর্ণ বকেয়া নেই'
                : 'No overdue invoices'}
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 min-w-0">
          <div className="text-xs font-medium text-slate-500">{t.metrics.salesRevenue}</div>
          <div className={`text-lg sm:text-2xl font-semibold text-slate-900 mt-2 truncate ${numClass}`}>
            {money(profitAndLoss.totalRevenue)}
          </div>
          <div className={`text-xs text-slate-500 mt-1.5 truncate ${numClass}`}>
            {t.metrics.netProfit}:{' '}
            <span className={profitAndLoss.netProfit >= 0 ? 'text-emerald-700 font-medium' : 'text-rose-700 font-medium'}>
              {money(profitAndLoss.netProfit)}
            </span>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 min-w-0">
          <div className="text-xs font-medium text-slate-500">{t.metrics.netVatPayable}</div>
          <div className={`text-lg sm:text-2xl font-semibold text-slate-900 mt-2 truncate ${numClass}`}>
            {money(vatReturn.netVatPayable)}
          </div>
          <div className={`text-xs text-slate-500 mt-1.5 truncate ${numClass}`}>
            {isBn ? 'আউটপুট' : 'Out'} {money(vatReturn.outputVat)} − {isBn ? 'ইনপুট' : 'In'} {money(vatReturn.inputVat)}
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 min-w-0">
          <div className="text-xs font-medium text-slate-500">{t.metrics.cashAndBank}</div>
          <div className={`text-lg sm:text-2xl font-semibold text-slate-900 mt-2 truncate ${numClass}`}>
            {money(cashFlow.endingCashBalance)}
          </div>
          <div className={`text-xs text-slate-500 mt-1.5 truncate ${numClass}`}>
            {isBn ? 'পরিচালন জমা' : 'Operating In'} {money(cashFlow.operatingInflows)}
          </div>
        </div>
      </div>

      {/* Main Two-Column Content: Recent Invoices + Top Customer Receivables */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
        <section className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl sm:rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              {isBn ? 'সাম্প্রতিক ইনভয়েস ও চালান' : 'Recent Invoices & Challans'}
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('sales', 'invoices')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#0F766E] hover:underline whitespace-nowrap"
            >
              {isBn ? 'সব দেখুন' : 'View all'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {data.invoices.slice(0, 6).map((inv) => (
              <div
                key={inv.id}
                className="px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-slate-50/70 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2 text-sm">
                    <span className="font-medium text-slate-900 truncate">{inv.customerName}</span>
                    <span className="hidden sm:inline text-slate-300" aria-hidden="true">·</span>
                    <span className="font-mono text-xs text-slate-600 whitespace-nowrap">{inv.invoiceNumber}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-2">
                    <span>{formatDate(inv.issueDate, lang)}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{inv.mushakChallanNo}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={
                        inv.status === 'paid'
                          ? 'text-emerald-700 font-medium'
                          : inv.status === 'overdue'
                            ? 'text-rose-700 font-medium'
                            : inv.status === 'partial'
                              ? 'text-amber-700 font-medium'
                              : 'text-slate-600 font-medium'
                      }
                    >
                      {t.status[inv.status]}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                  <div className="text-left sm:text-right">
                    <div className={`text-sm font-semibold text-slate-900 ${numClass}`}>
                      {money(inv.grandTotal)}
                    </div>
                    {inv.balanceDue > 0 && (
                      <div className={`text-[11px] text-rose-700 ${numClass}`}>
                        {t.labels.balanceDue}: {money(inv.balanceDue)}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {inv.balanceDue > 0 && (
                      <button
                        type="button"
                        onClick={() => onReceivePayment(inv)}
                        className="min-h-[38px] sm:min-h-0 px-2.5 py-1.5 text-xs font-medium text-[#0F766E] hover:bg-[#0F766E]/10 rounded-lg sm:rounded-md whitespace-nowrap"
                      >
                        {isBn ? 'জমা' : 'Pay'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onPreviewInvoice(inv)}
                      aria-label={`View invoice ${inv.invoiceNumber}`}
                      className="min-h-[38px] min-w-[38px] sm:min-h-0 sm:min-w-0 sm:p-2 inline-flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg sm:rounded-md"
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadPdfDocument({ type: 'invoice', invoice: inv }, data.organization, lang)}
                      aria-label={`Download PDF ${inv.invoiceNumber}`}
                      className="min-h-[38px] min-w-[38px] sm:min-h-0 sm:min-w-0 sm:p-2 inline-flex items-center justify-center text-slate-500 hover:text-[#0F766E] hover:bg-slate-100 rounded-lg sm:rounded-md"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onPreviewMushak(inv)}
                      aria-label={`View Mushak 6.3 ${inv.mushakChallanNo}`}
                      className="min-h-[38px] min-w-[38px] sm:min-h-0 sm:min-w-0 sm:p-2 inline-flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg sm:rounded-md"
                    >
                      <Receipt className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Right Column: Top Customer Receivables */}
        <section className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl sm:rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              {isBn ? 'কাস্টমারের বকেয়া পাওনা' : 'Customer Receivables'}
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('customers')}
              className="text-xs font-medium text-[#0F766E] hover:underline whitespace-nowrap"
            >
              {isBn ? 'সব কাস্টমার' : 'All Customers'}
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {data.customers
              .filter((c) => (c.receivableBalance ?? 0) > 0)
              .slice(0, 6)
              .map((c) => (
                <div key={c.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{c.name}</div>
                    <div className="text-xs text-slate-500 truncate">{c.companyName || c.phone}</div>
                  </div>
                  <div className={`text-sm font-semibold text-slate-900 shrink-0 ${numClass}`}>
                    {money(c.receivableBalance ?? 0)}
                  </div>
                </div>
              ))}
            {data.customers.every((c) => (c.receivableBalance ?? 0) <= 0) && (
              <div className="p-5 text-xs text-slate-500">
                {isBn ? 'সকল কাস্টমারের পাওনা পরিশোধিত।' : 'All customer receivables are settled.'}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

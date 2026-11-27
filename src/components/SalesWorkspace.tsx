import { useState } from 'react';
import { Download, Edit3, FileText, Play, Plus, Receipt, Search, Trash2 } from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import { formatDate, formatMoney, todayISO } from '../engine/format';
import type { Invoice, Language, Payment, RecurringFrequency, RecurringProfile } from '../engine/types';
import { DICT } from '../i18n/translations';
import { apiRequest, type WorkspacePayload } from '../lib/api';
import { downloadPdfDocument } from '../lib/pdfExport';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface Props {
  data: WorkspacePayload;
  lang: Language;
  subtab: string;
  onSubtabChange: (tab: string) => void;
  onNewInvoice: () => void;
  onEditInvoice: (invoice: Invoice) => void;
  onReceivePayment: (invoice?: Invoice) => void;
  onEditPayment: (payment: Payment) => void;
  onPreviewInvoice: (invoice: Invoice) => void;
  onPreviewMushak: (invoice: Invoice) => void;
  onRefresh: () => Promise<void>;
}

type DeleteTarget =
  | { type: 'invoice'; item: Invoice }
  | { type: 'payment'; item: Payment }
  | { type: 'recurring'; item: RecurringProfile };

export function SalesWorkspace({
  data,
  lang,
  subtab,
  onSubtabChange,
  onNewInvoice,
  onEditInvoice,
  onReceivePayment,
  onEditPayment,
  onPreviewInvoice,
  onPreviewMushak,
  onRefresh,
}: Props) {
  const effectiveSubtab = ['invoices', 'payments', 'recurring'].includes(subtab) ? subtab : 'invoices';
  const t = DICT[lang];
  const isBn = lang === 'bn';
  const { notify } = useFeedback();
  const money = (v: number) => formatMoney(v, lang, data.organization.currencySymbol);
  const numClass = isBn ? 'tabular-nums tracking-tight' : 'font-mono tabular-nums';

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showRecurringForm, setShowRecurringForm] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState<RecurringProfile | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  // Recurring form state
  const [rTitle, setRTitle] = useState('');
  const [rCustomerId, setRCustomerId] = useState<number>(data.customers[0]?.id || 0);
  const [rFrequency, setRFrequency] = useState<RecurringFrequency>('monthly');
  const [rNextRun, setRNextRun] = useState<string>(todayISO());
  const [rItemDesc, setRItemDesc] = useState('');
  const [rUnitPrice, setRUnitPrice] = useState('');
  const [rVatRate, setRVatRate] = useState('15');

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const filteredInvoices = data.invoices.filter((inv) => {
    if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      inv.invoiceNumber.toLowerCase().includes(q) ||
      inv.mushakChallanNo.toLowerCase().includes(q) ||
      (inv.customerName || '').toLowerCase().includes(q)
    );
  });

  const openNewRecurring = () => {
    setEditingRecurring(null);
    setRTitle('');
    setRCustomerId(data.customers[0]?.id || 0);
    setRFrequency('monthly');
    setRNextRun(todayISO());
    setRItemDesc('');
    setRUnitPrice('');
    setRVatRate('15');
    setShowRecurringForm(true);
  };

  const openEditRecurring = (rec: RecurringProfile) => {
    setEditingRecurring(rec);
    setRTitle(rec.title);
    setRCustomerId(rec.customerId);
    setRFrequency(rec.frequency);
    setRNextRun(rec.nextRunDate);
    const firstItem = rec.items?.[0];
    setRItemDesc(firstItem?.description || rec.title);
    setRUnitPrice(String(firstItem?.unitPrice ?? rec.estimatedTotal));
    setRVatRate(String(firstItem?.taxRate ?? 15));
    setShowRecurringForm(true);
  };

  const handleSaveRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    try {
      const body = {
        title: rTitle,
        customerId: rCustomerId || data.customers[0]?.id,
        branchId: editingRecurring?.branchId || data.branches[0]?.id || 1,
        frequency: rFrequency,
        nextRunDate: rNextRun,
        items: [
          {
            productId: null,
            description: rItemDesc || rTitle,
            quantity: 1,
            unitPrice: Number(rUnitPrice) || 0,
            taxRuleId: 1,
            taxRate: Number(rVatRate) || 0,
          },
        ],
      };
      if (editingRecurring) {
        await apiRequest(`/api/recurring/${editingRecurring.id}`, { method: 'PUT', body });
        notify({ title: isBn ? 'পুনরাবৃত্ত শিডিউল হালনাগাদ হয়েছে।' : 'Recurring schedule updated.', variant: 'success', sound: 'save' });
      } else {
        await apiRequest('/api/recurring', { method: 'POST', body });
        notify({ title: isBn ? 'নতুন পুনরাবৃত্ত শিডিউল যুক্ত হয়েছে।' : 'Recurring schedule created.', variant: 'success', sound: 'save' });
      }
      setShowRecurringForm(false);
      setEditingRecurring(null);
      await onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save schedule.';
      setActionError(msg);
      notify({ title: msg, variant: 'error' });
    }
  };

  const handleRunRecurring = async (id: number) => {
    setBusyId(id);
    setActionError(null);
    try {
      await apiRequest(`/api/recurring/${id}/run`, { method: 'POST' });
      notify({ title: isBn ? 'শিডিউল থেকে নতুন ইনভয়েস তৈরি হয়েছে।' : 'Invoice generated from schedule.', variant: 'success', sound: 'sale' });
      await onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate invoice.';
      setActionError(msg);
      notify({ title: msg, variant: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleRecurring = async (id: number) => {
    setBusyId(id);
    setActionError(null);
    try {
      await apiRequest(`/api/recurring/${id}/toggle`, { method: 'PATCH' });
      notify({ title: isBn ? 'শিডিউলের অবস্থা পরিবর্তিত হয়েছে।' : 'Schedule status updated.', variant: 'info', sound: 'toggle' });
      await onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update schedule.';
      setActionError(msg);
      notify({ title: msg, variant: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const label =
        deleteTarget.type === 'invoice'
          ? isBn
            ? 'ইনভয়েস মুছে ফেলা হয়েছে।'
            : 'Invoice deleted.'
          : deleteTarget.type === 'payment'
            ? isBn
              ? 'পেমেন্ট রেকর্ড মুছে ফেলা হয়েছে।'
              : 'Payment deleted.'
            : isBn
              ? 'শিডিউল মুছে ফেলা হয়েছে।'
              : 'Recurring schedule deleted.';
      if (deleteTarget.type === 'invoice') {
        await apiRequest(`/api/invoices/${deleteTarget.item.id}`, { method: 'DELETE' });
      } else if (deleteTarget.type === 'payment') {
        await apiRequest(`/api/payments/${deleteTarget.item.id}`, { method: 'DELETE' });
      } else {
        await apiRequest(`/api/recurring/${deleteTarget.item.id}`, { method: 'DELETE' });
      }
      setDeleteTarget(null);
      notify({ title: label, variant: 'warning', sound: 'delete' });
      await onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete record.';
      setDeleteError(msg);
      notify({ title: msg, variant: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Sub-navigation tabs + primary action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'invoices', label: t.tabs.invoices },
            { id: 'payments', label: t.tabs.payments },
            { id: 'recurring', label: t.tabs.recurring },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSubtabChange(tab.id)}
              className={`min-h-[38px] sm:min-h-0 px-3 py-2 text-xs font-medium rounded-xl sm:rounded-lg transition-colors whitespace-nowrap active:scale-[0.98] ${
                effectiveSubtab === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-white sm:bg-transparent border border-slate-200 sm:border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {effectiveSubtab === 'payments' ? (
            <button
              type="button"
              onClick={() => onReceivePayment()}
              className="min-h-[40px] sm:min-h-0 inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#0F766E] hover:bg-[#115E59] rounded-xl sm:rounded-lg whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              {t.actions.receivePayment}
            </button>
          ) : effectiveSubtab === 'recurring' ? (
            <button
              type="button"
              onClick={openNewRecurring}
              className="min-h-[40px] sm:min-h-0 inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#0F766E] hover:bg-[#115E59] rounded-xl sm:rounded-lg whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              {t.actions.newRecurring}
            </button>
          ) : (
            <button
              type="button"
              onClick={onNewInvoice}
              className="min-h-[40px] sm:min-h-0 inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#0F766E] hover:bg-[#115E59] rounded-xl sm:rounded-lg whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              {t.actions.newInvoice}
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div role="alert" className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
          {actionError}
        </div>
      )}

      {/* INVOICES TAB */}
      {effectiveSubtab === 'invoices' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={isBn ? 'ইনভয়েস, চালান বা কাস্টমার খুঁজুন...' : 'Search invoice, Mushak, customer...'}
                aria-label="Search invoices"
                className="w-full h-9 pl-9 pr-3 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F766E]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl sm:rounded-lg">
              {[
                { id: 'all', label: isBn ? 'সব' : 'All' },
                { id: 'sent', label: t.status.sent },
                { id: 'partial', label: t.status.partial },
                { id: 'overdue', label: t.status.overdue },
                { id: 'paid', label: t.status.paid },
              ].map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStatusFilter(st.id)}
                  className={`px-2.5 py-1.5 sm:py-1 text-xs font-medium rounded-lg sm:rounded-md transition-colors whitespace-nowrap ${
                    statusFilter === st.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {filteredInvoices.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
              <div className="text-sm font-medium text-slate-900">{t.empty.noInvoicesTitle}</div>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">{t.empty.noInvoicesDesc}</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {/* Desktop Dense Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                      <th className="py-2.5 px-4 text-left font-medium">{isBn ? 'ইনভয়েস ও মূসক' : 'Invoice / Mushak'}</th>
                      <th className="py-2.5 px-4 text-left font-medium">{t.labels.customer}</th>
                      <th className="py-2.5 px-4 text-left font-medium">{t.labels.date}</th>
                      <th className="py-2.5 px-4 text-left font-medium">{t.labels.status}</th>
                      <th className="py-2.5 px-4 text-right font-medium">{t.labels.vat}</th>
                      <th className="py-2.5 px-4 text-right font-medium">{t.labels.total}</th>
                      <th className="py-2.5 px-4 text-right font-medium">{t.labels.balanceDue}</th>
                      <th className="py-2.5 px-4 text-right font-medium">{isBn ? 'অ্যাকশন' : 'Actions'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredInvoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="font-mono text-xs font-medium text-slate-900">{inv.invoiceNumber}</div>
                          <div className="font-mono text-[11px] text-slate-500">{inv.mushakChallanNo}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-sm font-medium text-slate-900">{inv.customerName}</div>
                          <div className="text-[11px] text-slate-500">{inv.branchName}</div>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                          <div>{formatDate(inv.issueDate, lang)}</div>
                          <div className="text-[11px] text-slate-400">
                            {isBn ? 'শেষ' : 'Due'}: {formatDate(inv.dueDate, lang)}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs font-medium whitespace-nowrap">
                          <span
                            className={
                              inv.status === 'paid'
                                ? 'text-emerald-700'
                                : inv.status === 'overdue'
                                  ? 'text-rose-700'
                                  : inv.status === 'partial'
                                    ? 'text-amber-700'
                                    : 'text-slate-600'
                            }
                          >
                            {t.status[inv.status]}
                          </span>
                        </td>
                        <td className={`py-3 px-4 text-right text-xs text-slate-600 ${numClass}`}>
                          {money(inv.vatTotal)}
                        </td>
                        <td className={`py-3 px-4 text-right text-sm font-medium text-slate-900 ${numClass}`}>
                          {money(inv.grandTotal)}
                        </td>
                        <td className={`py-3 px-4 text-right text-sm font-medium ${numClass}`}>
                          <span className={inv.balanceDue > 0 ? 'text-rose-700' : 'text-slate-400'}>
                            {money(inv.balanceDue)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-0.5">
                            {inv.balanceDue > 0 && (
                              <button
                                type="button"
                                onClick={() => onReceivePayment(inv)}
                                className="px-2 py-1 text-xs font-medium text-[#0F766E] hover:bg-[#0F766E]/10 rounded-md"
                              >
                                {isBn ? 'পেমেন্ট' : 'Receive'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onPreviewInvoice(inv)}
                              aria-label={`Preview invoice ${inv.invoiceNumber}`}
                              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => downloadPdfDocument({ type: 'invoice', invoice: inv }, data.organization, lang)}
                              aria-label={`Download PDF ${inv.invoiceNumber}`}
                              className="p-1.5 text-slate-500 hover:text-[#0F766E] hover:bg-slate-100 rounded-md"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onPreviewMushak(inv)}
                              aria-label={`Preview Mushak 6.3 ${inv.mushakChallanNo}`}
                              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                            >
                              <Receipt className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onEditInvoice(inv)}
                              aria-label={`Edit invoice ${inv.invoiceNumber}`}
                              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteError(null);
                                setDeleteTarget({ type: 'invoice', item: inv });
                              }}
                              aria-label={`Delete invoice ${inv.invoiceNumber}`}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Compact Cards */}
              <div className="md:hidden divide-y divide-slate-100">
                {filteredInvoices.map((inv) => (
                  <div key={inv.id} className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate">{inv.customerName}</div>
                        <div className="text-xs text-slate-500 font-mono">
                          {inv.invoiceNumber} · {formatDate(inv.issueDate, lang)}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-sm font-semibold text-slate-900 ${numClass}`}>
                          {money(inv.grandTotal)}
                        </div>
                        <div
                          className={`text-xs font-medium ${
                            inv.status === 'paid'
                              ? 'text-emerald-700'
                              : inv.status === 'overdue'
                                ? 'text-rose-700'
                                : 'text-amber-700'
                          }`}
                        >
                          {t.status[inv.status]}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-100">
                      <span className="text-xs text-slate-500 tabular-nums">
                        {t.labels.balanceDue}: {money(inv.balanceDue)}
                      </span>
                      <div className="flex items-center gap-1">
                        {inv.balanceDue > 0 && (
                          <button
                            type="button"
                            onClick={() => onReceivePayment(inv)}
                            className="min-h-[36px] px-2.5 py-1.5 text-xs font-medium text-white bg-[#0F766E] rounded-lg active:scale-[0.98]"
                          >
                            {isBn ? 'পেমেন্ট' : 'Pay'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onPreviewInvoice(inv)}
                          className="min-h-[36px] px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg"
                        >
                          {t.actions.viewInvoice}
                        </button>
                        <button
                          type="button"
                          onClick={() => onEditInvoice(inv)}
                          aria-label={`Edit invoice ${inv.invoiceNumber}`}
                          className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center text-slate-600 border border-slate-200 rounded-lg"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null);
                            setDeleteTarget({ type: 'invoice', item: inv });
                          }}
                          aria-label={`Delete invoice ${inv.invoiceNumber}`}
                          className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center text-rose-600 border border-rose-200 rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* PAYMENTS & GATEWAY TAB */}
      {effectiveSubtab === 'payments' && (
        <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl overflow-hidden">
          {data.payments.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              {isBn ? 'এখনো কোনো পেমেন্ট গ্রহণ করা হয়নি।' : 'No payments recorded yet.'}
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                      <th className="py-2.5 px-4 text-left font-medium">{isBn ? 'রসিদ নং' : 'Receipt #'}</th>
                      <th className="py-2.5 px-4 text-left font-medium">{t.labels.customer}</th>
                      <th className="py-2.5 px-4 text-left font-medium">{t.labels.date}</th>
                      <th className="py-2.5 px-4 text-left font-medium">{isBn ? 'গেটওয়ে / মাধ্যম' : 'Gateway / Method'}</th>
                      <th className="py-2.5 px-4 text-left font-medium">{isBn ? 'সমন্বিত ইনভয়েস' : 'Allocated Invoices'}</th>
                      <th className="py-2.5 px-4 text-right font-medium">{t.labels.amount}</th>
                      <th className="py-2.5 px-4 text-right font-medium">{isBn ? 'অ্যাকশন' : 'Actions'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.payments.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-mono text-xs font-medium text-slate-900">{p.paymentNumber}</td>
                        <td className="py-3 px-4 font-medium text-slate-900">{p.customerName}</td>
                        <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">{formatDate(p.paymentDate, lang)}</td>
                        <td className="py-3 px-4 text-xs text-slate-700">
                          <div className="font-medium uppercase">{p.method}</div>
                          {p.gatewayReference && (
                            <div className="font-mono text-[11px] text-slate-500">{p.gatewayReference}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs font-mono text-slate-600">
                          {(p.allocations || []).map((a) => a.invoiceNumber).join(', ') || '—'}
                        </td>
                        <td className={`py-3 px-4 text-right font-semibold text-emerald-700 ${numClass}`}>
                          {money(p.amount)}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onEditPayment(p)}
                              aria-label={`Edit payment ${p.paymentNumber}`}
                              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteError(null);
                                setDeleteTarget({ type: 'payment', item: p });
                              }}
                              aria-label={`Delete payment ${p.paymentNumber}`}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Payment Cards */}
              <div className="md:hidden divide-y divide-slate-100">
                {data.payments.map((p) => (
                  <div key={p.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate">{p.customerName}</div>
                        <div className="text-xs text-slate-500">
                          <span className="font-mono">{p.paymentNumber}</span> · {formatDate(p.paymentDate, lang)}
                        </div>
                      </div>
                      <div className={`text-sm font-semibold text-emerald-700 shrink-0 ${numClass}`}>
                        {money(p.amount)}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-100 text-xs">
                      <span className="uppercase font-medium text-slate-600 truncate">
                        {p.method} {p.gatewayReference ? `· ${p.gatewayReference}` : ''}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => onEditPayment(p)}
                          aria-label={`Edit payment ${p.paymentNumber}`}
                          className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center text-slate-600 border border-slate-200 rounded-lg"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null);
                            setDeleteTarget({ type: 'payment', item: p });
                          }}
                          aria-label={`Delete payment ${p.paymentNumber}`}
                          className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center text-rose-600 border border-rose-200 rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* RECURRING BILLING TAB */}
      {effectiveSubtab === 'recurring' && (
        <div className="space-y-4">
          {showRecurringForm && (
            <form
              onSubmit={handleSaveRecurring}
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
            >
              <div className="text-sm font-semibold text-slate-900">
                {editingRecurring
                  ? isBn
                    ? 'নিয়মিত বিলিং শিডিউল সম্পাদনা'
                    : 'Edit Recurring Schedule'
                  : t.actions.newRecurring}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="rec-title" className="block text-xs text-slate-600 mb-1">
                    {isBn ? 'শিডিউলের নাম *' : 'Schedule Name *'}
                  </label>
                  <input
                    id="rec-title"
                    type="text"
                    required
                    value={rTitle}
                    onChange={(e) => setRTitle(e.target.value)}
                    placeholder={isBn ? 'যেমন: মাসিক রিটেইনার বিল' : 'e.g. Monthly Retainer'}
                    className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="rec-customer" className="block text-xs text-slate-600 mb-1">
                    {t.labels.customer}
                  </label>
                  <select
                    id="rec-customer"
                    value={rCustomerId}
                    onChange={(e) => setRCustomerId(Number(e.target.value))}
                    className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {data.customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="rec-freq" className="block text-xs text-slate-600 mb-1">
                    {isBn ? 'পুনরাবৃত্তি' : 'Frequency'}
                  </label>
                  <select
                    id="rec-freq"
                    value={rFrequency}
                    onChange={(e) => setRFrequency(e.target.value as RecurringFrequency)}
                    className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="weekly">{isBn ? 'সাপ্তাহিক' : 'Weekly'}</option>
                    <option value="monthly">{isBn ? 'মাসিক' : 'Monthly'}</option>
                    <option value="quarterly">{isBn ? 'ত্রৈমাসিক' : 'Quarterly'}</option>
                    <option value="yearly">{isBn ? 'বার্ষিক' : 'Yearly'}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="rec-item" className="block text-xs text-slate-600 mb-1">
                    {isBn ? 'সেবা/পণ্যের বিবরণ *' : 'Line Item Description *'}
                  </label>
                  <input
                    id="rec-item"
                    type="text"
                    required
                    value={rItemDesc}
                    onChange={(e) => setRItemDesc(e.target.value)}
                    className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="rec-price" className="block text-xs text-slate-600 mb-1">
                    {isBn ? 'মূল্য (মূসক ব্যতীত) *' : 'Unit Amount *'}
                  </label>
                  <input
                    id="rec-price"
                    type="number"
                    required
                    min="1"
                    step="any"
                    value={rUnitPrice}
                    onChange={(e) => setRUnitPrice(e.target.value)}
                    className="w-full h-9 px-3 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="rec-vat" className="block text-xs text-slate-600 mb-1">
                      {isBn ? 'মূসক %' : 'VAT %'}
                    </label>
                    <input
                      id="rec-vat"
                      type="number"
                      min="0"
                      step="any"
                      value={rVatRate}
                      onChange={(e) => setRVatRate(e.target.value)}
                      className="w-full h-9 px-3 text-sm font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label htmlFor="rec-date" className="block text-xs text-slate-600 mb-1">
                      {isBn ? 'পরবর্তী তারিখ' : 'Next Run'}
                    </label>
                    <input
                      id="rec-date"
                      type="date"
                      value={rNextRun}
                      onChange={(e) => setRNextRun(e.target.value)}
                      className="w-full h-9 px-2 text-xs font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowRecurringForm(false);
                    setEditingRecurring(null);
                  }}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  {t.actions.cancel}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-medium text-white bg-[#0F766E] hover:bg-[#115E59] rounded-lg"
                >
                  {t.actions.save}
                </button>
              </div>
            </form>
          )}

          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            {data.recurringProfiles.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                {isBn ? 'কোনো নিয়মিত বিলিং শিডিউল তৈরি নেই।' : 'No recurring billing profiles configured yet.'}
              </div>
            ) : (
              data.recurringProfiles.map((rec) => (
                <div key={rec.id} className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">{rec.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2">
                      <span>{rec.customerName}</span>
                      <span aria-hidden="true">·</span>
                      <span className="capitalize">{rec.frequency}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {isBn ? 'পরবর্তী বিল' : 'Next run'}: <span className="font-mono">{formatDate(rec.nextRunDate, lang)}</span>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className={rec.status === 'active' ? 'text-emerald-700 font-medium' : 'text-slate-500'}>
                        {t.status[rec.status]}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <span className={`text-sm font-semibold text-slate-900 mr-1 ${numClass}`}>
                      {money(rec.estimatedTotal)}
                    </span>
                    <button
                      type="button"
                      disabled={busyId === rec.id}
                      onClick={() => handleToggleRecurring(rec.id)}
                      className="px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-md whitespace-nowrap"
                    >
                      {rec.status === 'active' ? (isBn ? 'স্থগিত' : 'Pause') : isBn ? 'চালু' : 'Resume'}
                    </button>
                    {rec.status === 'active' && (
                      <button
                        type="button"
                        disabled={busyId === rec.id}
                        onClick={() => handleRunRecurring(rec.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-[#0F766E] hover:bg-[#115E59] rounded-md whitespace-nowrap"
                      >
                        <Play className="w-3 h-3" />
                        {t.actions.runNow}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openEditRecurring(rec)}
                      aria-label={`Edit schedule ${rec.title}`}
                      className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setDeleteTarget({ type: 'recurring', item: rec });
                      }}
                      aria-label={`Delete schedule ${rec.title}`}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        lang={lang}
        title={
          deleteTarget?.type === 'invoice'
            ? isBn
              ? 'ইনভয়েস মুছে ফেলবেন?'
              : 'Delete Invoice?'
            : deleteTarget?.type === 'payment'
              ? isBn
                ? 'পেমেন্ট রসিদ মুছে ফেলবেন?'
                : 'Delete Payment Receipt?'
              : isBn
                ? 'নিয়মিত বিলিং শিডিউল মুছে ফেলবেন?'
                : 'Delete Recurring Schedule?'
        }
        itemLabel={
          deleteTarget?.type === 'invoice'
            ? `${deleteTarget.item.invoiceNumber} · ${deleteTarget.item.customerName} (${money(deleteTarget.item.grandTotal)})`
            : deleteTarget?.type === 'payment'
              ? `${deleteTarget.item.paymentNumber} · ${deleteTarget.item.customerName} (${money(deleteTarget.item.amount)})`
              : deleteTarget?.item.title || ''
        }
        accountingNote={
          deleteTarget?.type === 'invoice'
            ? isBn
              ? 'স্বয়ংক্রিয় ডাবল-এন্ট্রি রিভার্সাল: এই ইনভয়েসের জার্নাল এন্ট্রি রিভার্স হবে, বিক্রীত স্টক পুনরায় গুদামে ফেরত আসবে এবং মূসক ও পাওনা হিসাব সমন্বিত থাকবে।'
              : 'Automatic double-entry reversal: posts a balanced contra journal, restores deducted branch stock, and recalculates customer receivable and VAT return.'
            : deleteTarget?.type === 'payment'
              ? isBn
                ? 'স্বয়ংক্রিয় ডাবল-এন্ট্রি রিভার্সাল: ক্যাশ/ব্যাংক জার্নাল রিভার্স হবে এবং সংশ্লিষ্ট ইনভয়েসের বকেয়া পুনরায় সঠিকভাবে হালনাগাদ হবে।'
                : 'Automatic double-entry reversal: reverses the cash/bank ledger entry and restores the due balance on linked invoice(s).'
              : undefined
        }
        busy={deleting}
        error={deleteError}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

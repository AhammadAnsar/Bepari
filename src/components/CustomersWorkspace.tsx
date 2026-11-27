import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUpDown,
  Building2,
  Edit3,
  FileText,
  Mail,
  MapPin,
  Phone,
  Plus,
  ReceiptText,
  Search,
  Trash2,
  Upload,
  User,
  Wallet,
  X,
} from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import { formatDate, formatMoney, formatNumber } from '../engine/format';
import type { Customer, Invoice, Language } from '../engine/types';
import { DICT } from '../i18n/translations';
import { apiRequest, type WorkspacePayload } from '../lib/api';
import { BulkImportModal } from './BulkImportModal';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface Props {
  data: WorkspacePayload;
  lang: Language;
  openFormToken?: number;
  highlightCustomerId?: number | null;
  onClearHighlight?: () => void;
  onNewInvoiceForCustomer: (customerId: number) => void;
  onReceivePaymentForCustomer: (invoice?: Invoice) => void;
  onPreviewInvoice: (invoice: Invoice) => void;
  onPreviewStatement: (customer: Customer) => void;
  onRefresh: () => Promise<void>;
}

type StatusFilter = 'all' | 'due' | 'settled';
type SortKey = 'name' | 'due_desc' | 'invoiced_desc';

export function CustomersWorkspace({
  data,
  lang,
  openFormToken,
  highlightCustomerId,
  onClearHighlight,
  onNewInvoiceForCustomer,
  onReceivePaymentForCustomer,
  onPreviewInvoice,
  onPreviewStatement,
  onRefresh,
}: Props) {
  const t = DICT[lang];
  const isBn = lang === 'bn';
  const { notify } = useFeedback();
  const money = (v: number) => formatMoney(v, lang, data.organization.currencySymbol);
  const numClass = isBn ? 'tabular-nums tracking-tight' : 'font-mono tabular-nums';

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<SortKey>('due_desc');

  const [drawerCustomerId, setDrawerCustomerId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // Form fields
  const [cName, setCName] = useState('');
  const [cCompany, setCCompany] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cBin, setCBin] = useState('');
  const [cAddress, setCAddress] = useState('');
  const [cOpening, setCOpening] = useState('0');
  const [cCreditLimit, setCCreditLimit] = useState('0');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);

  useEffect(() => {
    if (openFormToken && openFormToken > 0) {
      openCreateModal();
    }
  }, [openFormToken]);

  useEffect(() => {
    if (highlightCustomerId) {
      setDrawerCustomerId(highlightCustomerId);
      onClearHighlight?.();
    }
  }, [highlightCustomerId, onClearHighlight]);

  const openCreateModal = () => {
    setEditingCustomer(null);
    setCName('');
    setCCompany('');
    setCPhone('');
    setCEmail('');
    setCBin('');
    setCAddress('');
    setCOpening('0');
    setCCreditLimit('0');
    setFormError(null);
    setFormOpen(true);
  };

  const openEditModal = (c: Customer) => {
    setEditingCustomer(c);
    setCName(c.name);
    setCCompany(c.companyName || '');
    setCPhone(c.phone || '');
    setCEmail(c.email || '');
    setCBin(c.binNumber || '');
    setCAddress(c.address || '');
    setCOpening(String(c.openingBalance ?? 0));
    setCCreditLimit(String(c.creditLimit ?? 0));
    setFormError(null);
    setFormOpen(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const payload = {
        name: cName.trim(),
        companyName: cCompany.trim(),
        phone: cPhone.trim(),
        email: cEmail.trim(),
        binNumber: cBin.trim(),
        address: cAddress.trim(),
        openingBalance: Number(cOpening) || 0,
        creditLimit: Number(cCreditLimit) || 0,
      };
      if (editingCustomer) {
        await apiRequest(`/api/customers/${editingCustomer.id}`, { method: 'PUT', body: payload });
        notify({
          title: isBn ? 'কাস্টমারের তথ্য হালনাগাদ হয়েছে।' : 'Customer details updated.',
          description: isBn ? 'সকল ইনভয়েস ও ক্যাশ মেমোতে স্বয়ংক্রিয়ভাবে সিঙ্ক হয়েছে।' : 'Auto-synced across all invoices & cash memos.',
          variant: 'success',
          sound: 'save',
        });
      } else {
        await apiRequest('/api/customers', { method: 'POST', body: payload });
        notify({
          title: isBn ? 'নতুন কাস্টমার যুক্ত হয়েছে।' : 'New customer added.',
          description: payload.name,
          variant: 'success',
          sound: 'save',
        });
      }
      setFormOpen(false);
      setEditingCustomer(null);
      await onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save customer.';
      setFormError(msg);
      notify({ title: msg, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiRequest(`/api/customers/${deleteTarget.id}`, { method: 'DELETE' });
      if (drawerCustomerId === deleteTarget.id) {
        setDrawerCustomerId(null);
      }
      notify({
        title: isBn ? 'কাস্টমার মুছে ফেলা হয়েছে।' : 'Customer deleted.',
        description: deleteTarget.name,
        variant: 'warning',
        sound: 'delete',
      });
      setDeleteTarget(null);
      await onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete customer.';
      setDeleteError(msg);
      notify({ title: msg, variant: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const summary = useMemo(() => {
    const totalCustomers = data.customers.length;
    let totalReceivable = 0;
    let dueCount = 0;
    let totalCollected = 0;
    for (const c of data.customers) {
      const bal = c.receivableBalance ?? 0;
      totalReceivable += bal;
      if (bal > 0.005) dueCount += 1;
      totalCollected += c.totalPaid ?? 0;
    }
    return { totalCustomers, totalReceivable, dueCount, totalCollected };
  }, [data.customers]);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = data.customers.filter((c) => {
      const due = c.receivableBalance ?? 0;
      if (statusFilter === 'due' && due <= 0.005) return false;
      if (statusFilter === 'settled' && due > 0.005) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.companyName.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.binNumber.toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'due_desc') return (b.receivableBalance ?? 0) - (a.receivableBalance ?? 0);
      if (sortBy === 'invoiced_desc') return (b.totalInvoiced ?? 0) - (a.totalInvoiced ?? 0);
      return a.name.localeCompare(b.name);
    });
  }, [data.customers, search, statusFilter, sortBy]);

  const drawerCustomer = useMemo(
    () => data.customers.find((c) => c.id === drawerCustomerId) ?? null,
    [data.customers, drawerCustomerId]
  );

  const drawerInvoices = useMemo(
    () => (drawerCustomer ? data.invoices.filter((i) => i.customerId === drawerCustomer.id) : []),
    [data.invoices, drawerCustomer]
  );

  const drawerPayments = useMemo(
    () => (drawerCustomer ? data.payments.filter((p) => p.customerId === drawerCustomer.id) : []),
    [data.payments, drawerCustomer]
  );

  return (
    <div data-testid="customers-workspace" className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-semibold text-slate-900">
            {isBn ? 'কাস্টমার ম্যানেজমেন্ট' : 'Customer Directory & Receivables'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {isBn
              ? 'সকল কাস্টমারের প্রোফাইল, বকেয়া হিসাব, ইনভয়েস ইতিহাস ও পিডিএফ স্টেটমেন্ট এক জায়গায়।'
              : 'Manage customer profiles, credit limits, receivables, and PDF account statements.'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setBulkImportOpen(true)}
            className="min-h-[40px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl sm:rounded-lg transition-colors whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5 text-[#0F766E]" />
            <span>{isBn ? 'বাল্ক ইমপোর্ট' : 'Bulk Import'}</span>
          </button>
          <button
            type="button"
            data-testid="add-customer-btn"
            onClick={openCreateModal}
            className="min-h-[40px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#115E59] rounded-xl sm:rounded-lg transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.actions.newCustomer}</span>
          </button>
        </div>
      </div>

      {/* 4-KPI Hairline Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200 border border-slate-200 rounded-2xl sm:rounded-xl overflow-hidden">
        <div className="bg-white p-3.5 sm:p-5 min-w-0">
          <div className="text-xs text-slate-500">{isBn ? 'মোট কাস্টমার' : 'Total Customers'}</div>
          <div className={`text-lg sm:text-2xl font-semibold text-slate-900 mt-1.5 ${numClass}`}>
            {formatNumber(summary.totalCustomers, lang)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {isBn ? 'সক্রিয় কাস্টমার অ্যাকাউন্ট' : 'Active customer profiles'}
          </div>
        </div>
        <div className="bg-white p-3.5 sm:p-5 min-w-0">
          <div className="text-xs text-slate-500">{t.metrics.totalReceivable}</div>
          <div className={`text-lg sm:text-2xl font-semibold text-rose-700 mt-1.5 truncate ${numClass}`}>
            {money(summary.totalReceivable)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {isBn
              ? `${formatNumber(summary.dueCount, lang)}টি বকেয়া অ্যাকাউন্ট`
              : `${summary.dueCount} accounts with balance`}
          </div>
        </div>
        <div className="bg-white p-3.5 sm:p-5 min-w-0">
          <div className="text-xs text-slate-500">{isBn ? 'মোট আদায়কৃত' : 'Total Collected'}</div>
          <div className={`text-lg sm:text-2xl font-semibold text-emerald-700 mt-1.5 truncate ${numClass}`}>
            {money(summary.totalCollected)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {isBn ? 'সকল পেমেন্ট মাধ্যমসহ' : 'Across all gateways & cash'}
          </div>
        </div>
        <div className="bg-white p-3.5 sm:p-5 min-w-0">
          <div className="text-xs text-slate-500">{isBn ? 'পরিশোধিত অ্যাকাউন্ট' : 'Settled Accounts'}</div>
          <div className={`text-lg sm:text-2xl font-semibold text-slate-900 mt-1.5 ${numClass}`}>
            {formatNumber(Math.max(0, summary.totalCustomers - summary.dueCount), lang)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {isBn ? 'কোনো বকেয়া নেই' : 'Zero balance due'}
          </div>
        </div>
      </div>

      {/* Filter & Sort Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl p-3 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isBn ? 'নাম, প্রতিষ্ঠান, ফোন বা BIN দিয়ে খুঁজুন...' : 'Search name, company, phone, BIN...'}
            aria-label={isBn ? 'কাস্টমার খুঁজুন' : 'Search customers'}
            className="w-full h-9 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-[#0F766E]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200">
            {(
              [
                { id: 'all', label: isBn ? 'সব' : 'All' },
                { id: 'due', label: isBn ? 'বকেয়া আছে' : 'Has Due' },
                { id: 'settled', label: isBn ? 'পরিশোধিত' : 'Settled' },
              ] as { id: StatusFilter; label: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setStatusFilter(opt.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  statusFilter === opt.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="inline-flex items-center gap-1.5 h-9 px-2.5 bg-slate-50 border border-slate-200 rounded-lg">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
            <label htmlFor="customers-sort" className="text-xs font-medium text-slate-500 whitespace-nowrap">
              {isBn ? 'সাজান:' : 'Sort:'}
            </label>
            <select
              id="customers-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="bg-transparent text-xs font-medium text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="due_desc">{isBn ? 'সর্বোচ্চ বকেয়া' : 'Highest Due'}</option>
              <option value="invoiced_desc">{isBn ? 'সর্বোচ্চ বিল' : 'Highest Invoiced'}</option>
              <option value="name">{isBn ? 'নাম (ক–য)' : 'Name (A–Z)'}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Customer Directory Table / Mobile Cards */}
      <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl overflow-hidden">
        {filteredCustomers.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <div className="text-sm font-semibold text-slate-900">{t.empty.noCustomersTitle}</div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">{t.empty.noCustomersDesc}</p>
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                    <th className="py-2.5 px-4 text-left font-medium">{t.labels.customer}</th>
                    <th className="py-2.5 px-4 text-left font-medium">{isBn ? 'যোগাযোগ ও BIN' : 'Contact & BIN'}</th>
                    <th className="py-2.5 px-4 text-right font-medium">{isBn ? 'মোট বিল' : 'Invoiced'}</th>
                    <th className="py-2.5 px-4 text-right font-medium">{t.labels.paid}</th>
                    <th className="py-2.5 px-4 text-right font-medium">{t.labels.balanceDue}</th>
                    <th className="py-2.5 px-4 text-right font-medium">{isBn ? 'অ্যাকশন' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCustomers.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                      onClick={() => setDrawerCustomerId(c.id)}
                    >
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{c.name}</div>
                        <div className="text-xs text-slate-500">
                          {c.companyName ? `${c.companyName} · ` : ''}
                          <span className="font-mono text-[11px]">{c.code}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        <div>{c.phone || '—'}</div>
                        {c.binNumber && <div className="font-mono text-[11px] text-slate-500">BIN {c.binNumber}</div>}
                      </td>
                      <td className={`py-3 px-4 text-right text-xs text-slate-700 ${numClass}`}>
                        {money(c.totalInvoiced ?? 0)}
                      </td>
                      <td className={`py-3 px-4 text-right text-xs text-emerald-700 ${numClass}`}>
                        {money(c.totalPaid ?? 0)}
                      </td>
                      <td className={`py-3 px-4 text-right font-semibold ${numClass}`}>
                        <span className={(c.receivableBalance ?? 0) > 0.005 ? 'text-rose-700' : 'text-slate-600'}>
                          {money(c.receivableBalance ?? 0)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onPreviewStatement(c)}
                            className="px-2.5 py-1.5 text-xs font-medium text-[#0F766E] hover:bg-[#0F766E]/10 rounded-md whitespace-nowrap"
                          >
                            {t.actions.viewStatement}
                          </button>
                          <button
                            type="button"
                            aria-label={`Edit customer ${c.name}`}
                            onClick={() => openEditModal(c)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete customer ${c.name}`}
                            onClick={() => {
                              setDeleteError(null);
                              setDeleteTarget(c);
                            }}
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

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredCustomers.map((c) => (
                <div key={c.id} className="p-4 space-y-2.5">
                  <div
                    className="flex items-start justify-between gap-2 cursor-pointer"
                    onClick={() => setDrawerCustomerId(c.id)}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">{c.name}</div>
                      <div className="text-xs text-slate-500 truncate">{c.companyName || c.code}</div>
                      {c.phone && <div className="text-xs text-slate-500 mt-0.5">{c.phone}</div>}
                    </div>
                    <div className={`text-right shrink-0 ${numClass}`}>
                      <div className={`text-sm font-semibold ${(c.receivableBalance ?? 0) > 0.005 ? 'text-rose-700' : 'text-slate-700'}`}>
                        {money(c.receivableBalance ?? 0)}
                      </div>
                      <div className="text-[11px] text-slate-500">{t.labels.balanceDue}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => onPreviewStatement(c)}
                      className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-[#0F766E] bg-[#0F766E]/10 rounded-lg"
                    >
                      {t.actions.viewStatement} / PDF
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditModal(c)}
                        aria-label={`Edit ${c.name}`}
                        className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center text-slate-600 border border-slate-200 rounded-lg"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleteTarget(c);
                        }}
                        aria-label={`Delete ${c.name}`}
                        className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center text-rose-600 border border-rose-200 rounded-lg"
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

      {/* Customer Detail Drawer */}
      {drawerCustomer &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            data-testid="customer-detail-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={drawerCustomer.name}
            className="fixed inset-0 z-50 bg-slate-950/45 flex justify-end"
            onClick={() => setDrawerCustomerId(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-white h-full flex flex-col border-l border-slate-200 shadow-2xl overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-mono text-slate-400">{drawerCustomer.code}</div>
                  <h2 className="text-base font-semibold text-slate-900 truncate">{drawerCustomer.name}</h2>
                  {drawerCustomer.companyName && (
                    <p className="text-xs text-slate-500 truncate mt-0.5">{drawerCustomer.companyName}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerCustomerId(null)}
                  aria-label="Close drawer"
                  className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* Quick Actions */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDrawerCustomerId(null);
                      onNewInvoiceForCustomer(drawerCustomer.id);
                    }}
                    className="h-9 px-2.5 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#115E59] rounded-lg whitespace-nowrap"
                  >
                    <ReceiptText className="w-3.5 h-3.5" />
                    <span>{isBn ? 'নতুন বিল' : 'Invoice'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const openInv = drawerInvoices.find((i) => i.balanceDue > 0.005);
                      setDrawerCustomerId(null);
                      onReceivePaymentForCustomer(openInv);
                    }}
                    className="h-9 px-2.5 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap"
                  >
                    <Wallet className="w-3.5 h-3.5 text-[#0F766E]" />
                    <span>{isBn ? 'পেমেন্ট' : 'Payment'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onPreviewStatement(drawerCustomer)}
                    className="h-9 px-2.5 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#0F766E]" />
                    <span>{isBn ? 'স্টেটমেন্ট' : 'Statement'}</span>
                  </button>
                </div>

                {/* Balance Strip */}
                <div className="grid grid-cols-3 gap-px bg-slate-200 border border-slate-200 rounded-xl overflow-hidden text-xs">
                  <div className="bg-white p-3">
                    <div className="text-slate-500">{isBn ? 'মোট বিল' : 'Invoiced'}</div>
                    <div className={`text-sm font-semibold text-slate-900 mt-1 ${numClass}`}>
                      {money(drawerCustomer.totalInvoiced ?? 0)}
                    </div>
                  </div>
                  <div className="bg-white p-3">
                    <div className="text-slate-500">{t.labels.paid}</div>
                    <div className={`text-sm font-semibold text-emerald-700 mt-1 ${numClass}`}>
                      {money(drawerCustomer.totalPaid ?? 0)}
                    </div>
                  </div>
                  <div className="bg-white p-3">
                    <div className="text-slate-500">{t.labels.balanceDue}</div>
                    <div
                      className={`text-sm font-semibold mt-1 ${numClass} ${
                        (drawerCustomer.receivableBalance ?? 0) > 0.005 ? 'text-rose-700' : 'text-slate-900'
                      }`}
                    >
                      {money(drawerCustomer.receivableBalance ?? 0)}
                    </div>
                  </div>
                </div>

                {/* Contact & Tax Profile */}
                <div className="border border-slate-200 rounded-xl p-4 space-y-2.5 text-xs">
                  <div className="font-semibold text-slate-900">{isBn ? 'প্রোফাইল তথ্য' : 'Contact & Tax Profile'}</div>
                  <div className="space-y-2 text-slate-600">
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{drawerCustomer.phone || '—'}</span>
                    </div>
                    {drawerCustomer.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{drawerCustomer.email}</span>
                      </div>
                    )}
                    {drawerCustomer.binNumber && (
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-mono">BIN: {drawerCustomer.binNumber}</span>
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <span>{drawerCustomer.address || '—'}</span>
                    </div>
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                      <span>
                        {t.labels.openingBalance}: <span className={numClass}>{money(drawerCustomer.openingBalance)}</span>
                      </span>
                      <span>
                        {isBn ? 'ক্রেডিট লিমিট' : 'Credit Limit'}: <span className={numClass}>{money(drawerCustomer.creditLimit)}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Customer Invoices */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-900">
                    {isBn ? `সাম্প্রতিক ইনভয়েস (${formatNumber(drawerInvoices.length, lang)})` : `Invoices (${drawerInvoices.length})`}
                  </div>
                  {drawerInvoices.length === 0 ? (
                    <div className="p-4 text-xs text-slate-500 border border-slate-200 rounded-xl">
                      {isBn ? 'এই কাস্টমারের এখনো কোনো ইনভয়েস নেই।' : 'No invoices issued for this customer yet.'}
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                      {drawerInvoices.slice(0, 8).map((inv) => (
                        <div
                          key={inv.id}
                          onClick={() => onPreviewInvoice(inv)}
                          className="p-3 flex items-center justify-between gap-2 hover:bg-slate-50 cursor-pointer text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-mono font-medium text-slate-900">{inv.invoiceNumber}</div>
                            <div className="text-slate-500">{formatDate(inv.issueDate, lang)}</div>
                          </div>
                          <div className={`text-right ${numClass}`}>
                            <div className="font-semibold text-slate-900">{money(inv.grandTotal)}</div>
                            <div className={inv.balanceDue > 0.005 ? 'text-rose-700' : 'text-emerald-700'}>
                              {inv.balanceDue > 0.005 ? `${t.labels.balanceDue}: ${money(inv.balanceDue)}` : t.status.paid}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Customer Payments */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-900">
                    {isBn ? `পেমেন্ট ইতিহাস (${formatNumber(drawerPayments.length, lang)})` : `Payments (${drawerPayments.length})`}
                  </div>
                  {drawerPayments.length === 0 ? (
                    <div className="p-4 text-xs text-slate-500 border border-slate-200 rounded-xl">
                      {isBn ? 'কোনো পেমেন্ট রেকর্ড নেই।' : 'No payments recorded yet.'}
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                      {drawerPayments.slice(0, 8).map((p) => (
                        <div key={p.id} className="p-3 flex items-center justify-between gap-2 text-xs">
                          <div>
                            <div className="font-mono font-medium text-slate-900">{p.paymentNumber}</div>
                            <div className="text-slate-500">
                              {formatDate(p.paymentDate, lang)} · <span className="uppercase">{p.method}</span>
                            </div>
                          </div>
                          <div className={`font-semibold text-emerald-700 ${numClass}`}>{money(p.amount)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="px-5 py-3.5 pb-safe border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError(null);
                    setDeleteTarget(drawerCustomer);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-lg"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t.actions.delete}</span>
                </button>
                <button
                  type="button"
                  onClick={() => openEditModal(drawerCustomer)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{t.actions.edit}</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Create / Edit Customer Modal */}
      {formOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            data-testid="customer-form-modal"
            role="dialog"
            aria-modal="true"
            aria-label={editingCustomer ? (isBn ? 'কাস্টমার সম্পাদনা' : 'Edit Customer') : t.actions.newCustomer}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/45 sm:p-4"
            onClick={() => setFormOpen(false)}
          >
            <form
              onSubmit={handleSaveCustomer}
              onClick={(e) => e.stopPropagation()}
              className="bg-white w-full sm:max-w-xl rounded-t-3xl sm:rounded-xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]"
            >
              <div className="sm:hidden pt-2.5 pb-0.5 flex justify-center">
                <div className="w-10 h-1.5 bg-slate-300 rounded-full" />
              </div>
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-[#0F766E]" />
                  <h2 className="text-sm font-semibold text-slate-900">
                    {editingCustomer
                      ? isBn
                        ? 'কাস্টমার তথ্য সম্পাদনা'
                        : 'Edit Customer Profile'
                      : t.actions.newCustomer}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  aria-label="Close customer form"
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto space-y-4">
                {formError && (
                  <div role="alert" className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
                    {formError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label htmlFor="cust-modal-name" className="block text-xs font-medium text-slate-700 mb-1">
                      {isBn ? 'কাস্টমারের নাম *' : 'Customer Name *'}
                    </label>
                    <input
                      id="cust-modal-name"
                      type="text"
                      required
                      value={cName}
                      onChange={(e) => setCName(e.target.value)}
                      className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0F766E]"
                    />
                  </div>
                  <div>
                    <label htmlFor="cust-modal-company" className="block text-xs font-medium text-slate-700 mb-1">
                      {isBn ? 'প্রতিষ্ঠানের নাম' : 'Company Name'}
                    </label>
                    <input
                      id="cust-modal-company"
                      type="text"
                      value={cCompany}
                      onChange={(e) => setCCompany(e.target.value)}
                      className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0F766E]"
                    />
                  </div>
                  <div>
                    <label htmlFor="cust-modal-phone" className="block text-xs font-medium text-slate-700 mb-1">
                      {isBn ? 'মোবাইল নম্বর' : 'Phone'}
                    </label>
                    <input
                      id="cust-modal-phone"
                      type="text"
                      value={cPhone}
                      onChange={(e) => setCPhone(e.target.value)}
                      className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0F766E]"
                    />
                  </div>
                  <div>
                    <label htmlFor="cust-modal-email" className="block text-xs font-medium text-slate-700 mb-1">
                      {isBn ? 'ইমেইল' : 'Email'}
                    </label>
                    <input
                      id="cust-modal-email"
                      type="email"
                      value={cEmail}
                      onChange={(e) => setCEmail(e.target.value)}
                      className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0F766E]"
                    />
                  </div>
                  <div>
                    <label htmlFor="cust-modal-bin" className="block text-xs font-medium text-slate-700 mb-1">
                      {isBn ? 'বিআইএন (BIN)' : 'BIN Number'}
                    </label>
                    <input
                      id="cust-modal-bin"
                      type="text"
                      value={cBin}
                      onChange={(e) => setCBin(e.target.value)}
                      className="w-full h-10 px-3 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#0F766E]"
                    />
                  </div>
                  <div>
                    <label htmlFor="cust-modal-credit" className="block text-xs font-medium text-slate-700 mb-1">
                      {isBn ? 'ক্রেডিট লিমিট' : 'Credit Limit'}
                    </label>
                    <input
                      id="cust-modal-credit"
                      type="number"
                      min="0"
                      step="any"
                      value={cCreditLimit}
                      onChange={(e) => setCCreditLimit(e.target.value)}
                      className="w-full h-10 px-3 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#0F766E]"
                    />
                  </div>
                  <div>
                    <label htmlFor="cust-modal-opening" className="block text-xs font-medium text-slate-700 mb-1">
                      {t.labels.openingBalance}
                    </label>
                    <input
                      id="cust-modal-opening"
                      type="number"
                      step="any"
                      value={cOpening}
                      onChange={(e) => setCOpening(e.target.value)}
                      className="w-full h-10 px-3 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#0F766E]"
                    />
                  </div>
                  <div>
                    <label htmlFor="cust-modal-addr" className="block text-xs font-medium text-slate-700 mb-1">
                      {isBn ? 'ঠিকানা' : 'Address'}
                    </label>
                    <input
                      id="cust-modal-addr"
                      type="text"
                      value={cAddress}
                      onChange={(e) => setCAddress(e.target.value)}
                      className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0F766E]"
                    />
                  </div>
                </div>
              </div>

              <div className="px-5 py-3.5 pb-safe bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200/70 rounded-lg"
                >
                  {t.actions.cancel}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#115E59] disabled:opacity-60 rounded-lg"
                >
                  {saving ? (isBn ? 'সংরক্ষণ হচ্ছে...' : 'Saving...') : t.actions.save}
                </button>
              </div>
            </form>
          </div>,
          document.body
        )}

      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        lang={lang}
        title={isBn ? 'কাস্টমার মুছে ফেলবেন?' : 'Delete Customer?'}
        itemLabel={deleteTarget ? `${deleteTarget.name} (${deleteTarget.code})` : ''}
        description={
          isBn
            ? 'এই কাস্টমারের প্রোফাইল স্থায়ীভাবে মুছে যাবে। যদি কোনো ইনভয়েস বা পেমেন্ট যুক্ত থাকে তবে আগে সেগুলো মুছতে হবে।'
            : 'This permanently removes the customer profile. Customers with linked invoices or payments must have those transactions removed first.'
        }
        busy={deleting}
        error={deleteError}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={handleConfirmDelete}
      />

      <BulkImportModal
        open={bulkImportOpen}
        mode="customers"
        lang={lang}
        onClose={() => setBulkImportOpen(false)}
        onImported={onRefresh}
      />
    </div>
  );
}

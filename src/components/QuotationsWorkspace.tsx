import { useMemo, useState } from 'react';
import {
  ArrowRightCircle,
  CheckCircle2,
  Eye,
  FileText,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import { computeInvoiceTotals } from '../engine/billing';
import { formatDate, formatMoney } from '../engine/format';
import type {
  Customer,
  Invoice,
  InvoiceLineInput,
  Language,
  Product,
  Quotation,
  QuotationStatus,
} from '../engine/types';
import { DICT } from '../i18n/translations';
import {
  convertQuotationToInvoiceApi,
  createQuotationApi,
  deleteQuotationApi,
  updateQuotationApi,
  type WorkspacePayload,
} from '../lib/api';

interface Props {
  data: WorkspacePayload;
  lang: Language;
  activeBranchId: number;
  onPreviewQuotation: (quotation: Quotation) => void;
  onPreviewInvoice: (invoice: Invoice) => void;
  onRefresh: () => Promise<void>;
}

const STATUS_BADGE: Record<QuotationStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  sent: 'bg-sky-50 text-sky-700 border-sky-200',
  accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  converted: 'bg-teal-50 text-[#0F766E] border-teal-200',
  expired: 'bg-rose-50 text-rose-700 border-rose-200',
};

export function QuotationsWorkspace({
  data,
  lang,
  activeBranchId,
  onPreviewQuotation,
  onPreviewInvoice,
  onRefresh,
}: Props) {
  const isBn = lang === 'bn';
  const t = DICT[lang];
  const { notify, celebrate } = useFeedback();
  const sym = data.organization.currencySymbol;

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<Quotation | null>(null);
  const [convertingId, setConvertingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Form states
  const today = new Date().toISOString().slice(0, 10);
  const defaultValidUntil = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
  const [customerId, setCustomerId] = useState<number>(data.customers[0]?.id || 0);
  const [branchId, setBranchId] = useState<number>(activeBranchId || data.branches[0]?.id || 1);
  const [issueDate, setIssueDate] = useState<string>(today);
  const [validUntil, setValidUntil] = useState<string>(defaultValidUntil);
  const [poNumber, setPoNumber] = useState<string>('');
  const [status, setStatus] = useState<QuotationStatus>('sent');
  const [notes, setNotes] = useState<string>('');
  const [lines, setLines] = useState<InvoiceLineInput[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const quotations = data.quotations || [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return quotations.filter((qt) => {
      if (statusFilter !== 'all' && qt.status !== statusFilter) return false;
      if (!q) return true;
      return (
        qt.quotationNumber.toLowerCase().includes(q) ||
        (qt.customerName || '').toLowerCase().includes(q) ||
        (qt.poNumber || '').toLowerCase().includes(q)
      );
    });
  }, [quotations, query, statusFilter]);

  const metrics = useMemo(() => {
    const totalCount = quotations.length;
    const totalValue = quotations.reduce((acc, q) => acc + q.grandTotal, 0);
    const activeQuotes = quotations.filter((q) => q.status === 'sent' || q.status === 'accepted' || q.status === 'draft');
    const activeValue = activeQuotes.reduce((acc, q) => acc + q.grandTotal, 0);
    const convertedCount = quotations.filter((q) => q.status === 'converted').length;
    return { totalCount, totalValue, activeCount: activeQuotes.length, activeValue, convertedCount };
  }, [quotations]);

  const defaultTax = data.taxRules.find((r) => r.isDefault) || data.taxRules[0];

  const openCreateModal = () => {
    const firstProd = data.products[0];
    setEditingQuotation(null);
    setCustomerId(data.customers[0]?.id || 0);
    setBranchId(activeBranchId || data.branches[0]?.id || 1);
    setIssueDate(today);
    setValidUntil(defaultValidUntil);
    setPoNumber('');
    setStatus('sent');
    setNotes('');
    setLines(
      firstProd
        ? [
            {
              productId: firstProd.id,
              description: isBn ? firstProd.nameBn || firstProd.name : firstProd.name,
              quantity: 1,
              unitPrice: firstProd.salePrice,
              discountAmount: 0,
              taxRuleId: firstProd.taxRuleId ?? defaultTax?.id ?? null,
              taxRate: firstProd.taxRate ?? defaultTax?.rate ?? 15,
              sdRate: 0,
            },
          ]
        : []
    );
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (qt: Quotation) => {
    setEditingQuotation(qt);
    setCustomerId(qt.customerId);
    setBranchId(qt.branchId);
    setIssueDate(qt.issueDate);
    setValidUntil(qt.validUntil || qt.issueDate);
    setPoNumber(qt.poNumber || '');
    setStatus(qt.status);
    setNotes(qt.notes || '');
    setLines(
      (qt.items || []).map((item) => ({
        productId: item.productId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount,
        taxRuleId: item.taxRuleId ?? defaultTax?.id ?? null,
        taxRate: item.taxRate ?? defaultTax?.rate ?? 15,
        sdRate: item.sdRate || 0,
      }))
    );
    setFormError(null);
    setModalOpen(true);
  };

  const addLine = () => {
    const firstProd = data.products[0];
    if (!firstProd) return;
    setLines((prev) => [
      ...prev,
      {
        productId: firstProd.id,
        description: isBn ? firstProd.nameBn || firstProd.name : firstProd.name,
        quantity: 1,
        unitPrice: firstProd.salePrice,
        discountAmount: 0,
        taxRuleId: firstProd.taxRuleId ?? defaultTax?.id ?? null,
        taxRate: firstProd.taxRate ?? defaultTax?.rate ?? 15,
        sdRate: 0,
      },
    ]);
  };

  const updateLineProduct = (idx: number, productId: number) => {
    const prod = data.products.find((p: Product) => p.id === productId);
    if (!prod) return;
    setLines((prev) =>
      prev.map((l, i) =>
        i === idx
          ? {
              ...l,
              productId: prod.id,
              description: isBn ? prod.nameBn || prod.name : prod.name,
              unitPrice: prod.salePrice,
              taxRuleId: prod.taxRuleId ?? defaultTax?.id ?? null,
              taxRate: prod.taxRate ?? defaultTax?.rate ?? 15,
            }
          : l
      )
    );
  };

  const computedPreview = useMemo(() => {
    try {
      const valid = lines.filter((l) => l.quantity > 0);
      if (valid.length === 0) {
        return { lines: [], subtotal: 0, discountTotal: 0, sdTotal: 0, vatTotal: 0, grandTotal: 0 };
      }
      return computeInvoiceTotals(
        valid.map((l) => ({
          ...l,
          description: l.description?.trim() || 'Item',
        })),
        data.organization.vatMode
      );
    } catch {
      return { lines: [], subtotal: 0, discountTotal: 0, sdTotal: 0, vatTotal: 0, grandTotal: 0 };
    }
  }, [lines, data.organization.vatMode]);

  const handleSaveQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) {
      setFormError(isBn ? 'অনুগ্রহ করে গ্রাহক নির্বাচন করুন।' : 'Please select a customer.');
      return;
    }
    if (lines.length === 0) {
      setFormError(isBn ? 'অন্তত একটি পণ্য যোগ করুন।' : 'Please add at least one product line.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        customerId,
        branchId,
        issueDate,
        validUntil,
        poNumber: poNumber.trim(),
        status,
        notes: notes.trim(),
        items: lines,
      };
      if (editingQuotation) {
        const res = await updateQuotationApi(editingQuotation.id, payload);
        await onRefresh();
        setModalOpen(false);
        notify({
          title: isBn ? 'কোটেশন হালনাগাদ হয়েছে' : 'Quotation Updated',
          description: res.quotation.quotationNumber,
          variant: 'success',
          sound: 'save',
        });
      } else {
        const res = await createQuotationApi(payload);
        await onRefresh();
        setModalOpen(false);
        onPreviewQuotation(res.quotation);
        notify({
          title: isBn ? 'নতুন কোটেশন তৈরি হয়েছে' : 'Quotation Created',
          description: res.quotation.quotationNumber,
          variant: 'success',
          sound: 'save',
        });
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save quotation.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConvertToInvoice = async (qt: Quotation) => {
    setConvertingId(qt.id);
    try {
      const res = await convertQuotationToInvoiceApi(qt.id);
      await onRefresh();
      onPreviewInvoice(res.invoice);
      celebrate({
        title: isBn ? 'কোটেশন ইনভয়েসে রূপান্তর হয়েছে!' : 'Converted to Invoice!',
        subtitle: isBn
          ? `${qt.quotationNumber} থেকে স্বয়ংক্রিয়ভাবে ইনভয়েস ও চালান প্রস্তুত হয়েছে।`
          : `Invoice and challan generated from ${qt.quotationNumber}.`,
        refLabel: isBn ? 'ইনভয়েস নং' : 'Invoice No',
        refValue: res.invoice.invoiceNumber,
        customerName: res.invoice.customerName,
        amountLabel: isBn ? 'সর্বমোট বিল' : 'Grand Total',
        amountValue: formatMoney(res.invoice.grandTotal, lang, sym),
        sound: 'sale',
        primaryAction: {
          label: isBn ? 'ইনভয়েস দেখুন' : 'View Invoice',
          onClick: () => onPreviewInvoice(res.invoice),
        },
      });
    } catch (err) {
      notify({
        title: err instanceof Error ? err.message : 'Failed to convert quotation.',
        variant: 'error',
      });
    } finally {
      setConvertingId(null);
    }
  };

  const handleDeleteQuotation = async (qt: Quotation) => {
    setDeletingId(qt.id);
    try {
      await deleteQuotationApi(qt.id);
      await onRefresh();
      notify({
        title: isBn ? 'কোটেশন মুছে ফেলা হয়েছে' : 'Quotation Deleted',
        description: qt.quotationNumber,
        variant: 'info',
        sound: 'toggle',
      });
    } catch (err) {
      notify({
        title: err instanceof Error ? err.message : 'Failed to delete quotation.',
        variant: 'error',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const statusLabel = (s: QuotationStatus) => {
    const map: Record<QuotationStatus, string> = {
      draft: t.status.draft,
      sent: t.status.sent,
      accepted: t.status.accepted,
      converted: t.status.converted,
      expired: t.status.expired,
    };
    return map[s] || s;
  };

  return (
    <div className="space-y-5">
      {/* Header & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            {isBn ? 'কোটেশন ও দরপত্র ব্যবস্থাপনা' : 'Quotations & Proposals'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {isBn
              ? 'ক্লায়েন্টদের প্রফেশনাল কোটেশন পাঠান এবং এক ক্লিকে ইনভয়েস ও চালানে রূপান্তর করুন'
              : 'Prepare client quotations and convert approved quotes to invoices & delivery challans in one click'}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#0D655E] rounded-lg transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{t.actions.newQuotation}</span>
        </button>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">{isBn ? 'মোট কোটেশন মূল্য' : 'Total Quotation Value'}</div>
          <div className="text-lg font-bold text-slate-900 tabular-nums mt-1">
            {formatMoney(metrics.totalValue, lang, sym)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            {isBn ? `${metrics.totalCount} টি কোটেশন` : `${metrics.totalCount} quotations`}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">{isBn ? 'চলমান পাইপলাইন' : 'Active Pipeline'}</div>
          <div className="text-lg font-bold text-[#0F766E] tabular-nums mt-1">
            {formatMoney(metrics.activeValue, lang, sym)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            {isBn ? `${metrics.activeCount} টি অপেক্ষমাণ` : `${metrics.activeCount} open quotes`}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">{isBn ? 'ইনভয়েসে রূপান্তরিত' : 'Converted to Invoices'}</div>
          <div className="text-lg font-bold text-slate-900 tabular-nums mt-1">{metrics.convertedCount}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {isBn ? 'সরাসরি বিক্রয়ে যুক্ত হয়েছে' : 'Posted directly to sales ledger'}
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              isBn
                ? 'কোটেশন নং, গ্রাহকের নাম বা P.O নং দিয়ে খুঁজুন...'
                : 'Search by quotation no, customer, or P.O no...'
            }
            className="w-full h-9 pl-8 pr-3 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F766E]"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {(['all', 'sent', 'accepted', 'converted', 'draft', 'expired'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                statusFilter === st
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {st === 'all' ? (isBn ? 'সবগুলো' : 'All') : statusLabel(st)}
            </button>
          ))}
        </div>
      </div>

      {/* Quotations Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <FileText className="w-8 h-8 text-slate-300 mx-auto" />
            <div className="text-sm font-medium text-slate-700">
              {isBn ? 'কোনো কোটেশন পাওয়া যায়নি' : 'No quotations found'}
            </div>
            <p className="text-xs text-slate-500">
              {isBn
                ? 'নতুন কোটেশন তৈরি করে ক্লায়েন্টকে প্রিন্ট বা পিডিএফ পাঠান।'
                : 'Create a quotation to print or export PDF for your client.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500 uppercase">
                  <th className="py-2.5 px-3.5">{isBn ? 'কোটেশন নং' : 'Quotation No'}</th>
                  <th className="py-2.5 px-3.5">{isBn ? 'গ্রাহক' : 'Customer'}</th>
                  <th className="py-2.5 px-3.5">{isBn ? 'তারিখ ও মেয়াদ' : 'Issue / Valid Until'}</th>
                  <th className="py-2.5 px-3.5">{isBn ? 'P.O নং' : 'P.O No'}</th>
                  <th className="py-2.5 px-3.5 text-right">{isBn ? 'মোট মূল্য' : 'Total Amount'}</th>
                  <th className="py-2.5 px-3.5">{isBn ? 'অবস্থা' : 'Status'}</th>
                  <th className="py-2.5 px-3.5 text-right">{isBn ? 'অ্যাকশন' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 text-xs">
                {filtered.map((qt) => (
                  <tr key={qt.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-3.5 font-mono font-semibold text-slate-900 whitespace-nowrap">
                      {qt.quotationNumber}
                    </td>
                    <td className="py-3 px-3.5 font-medium text-slate-800">{qt.customerName}</td>
                    <td className="py-3 px-3.5 text-slate-600 whitespace-nowrap tabular-nums">
                      <div>{formatDate(qt.issueDate, lang)}</div>
                      {qt.validUntil && (
                        <div className="text-[11px] text-slate-400">
                          {isBn ? 'মেয়াদ:' : 'Valid:'} {formatDate(qt.validUntil, lang)}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3.5 font-mono text-slate-600">{qt.poNumber || '—'}</td>
                    <td className="py-3 px-3.5 text-right font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                      {formatMoney(qt.grandTotal, lang, sym)}
                    </td>
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium border rounded-md ${
                          STATUS_BADGE[qt.status] || STATUS_BADGE.draft
                        }`}
                      >
                        {statusLabel(qt.status)}
                      </span>
                    </td>
                    <td className="py-3 px-3.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onPreviewQuotation(qt)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{isBn ? 'প্রিভিউ / PDF' : 'Preview'}</span>
                        </button>

                        {qt.status !== 'converted' ? (
                          <>
                            <button
                              type="button"
                              disabled={convertingId === qt.id}
                              onClick={() => handleConvertToInvoice(qt)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#0D655E] rounded-md disabled:opacity-50"
                            >
                              <ArrowRightCircle className="w-3.5 h-3.5" />
                              <span>
                                {convertingId === qt.id
                                  ? isBn
                                    ? 'রূপান্তর হচ্ছে...'
                                    : 'Converting...'
                                  : isBn
                                    ? 'ইনভয়েসে রূপান্তর'
                                    : 'Convert to Invoice'}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditModal(qt)}
                              title={isBn ? 'সম্পাদনা' : 'Edit'}
                              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={deletingId === qt.id}
                              onClick={() => handleDeleteQuotation(qt)}
                              title={isBn ? 'মুছে ফেলুন' : 'Delete'}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md disabled:opacity-40"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          qt.convertedInvoiceId && (
                            <button
                              type="button"
                              onClick={() => {
                                const inv = data.invoices.find((i) => i.id === qt.convertedInvoiceId);
                                if (inv) onPreviewInvoice(inv);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#0F766E] bg-teal-50 border border-teal-200 rounded-md"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{isBn ? 'ইনভয়েস দেখুন' : 'View Invoice'}</span>
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Quotation Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-[1px] p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-xl">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                {editingQuotation
                  ? isBn
                    ? `কোটেশন সম্পাদনা (${editingQuotation.quotationNumber})`
                    : `Edit Quotation (${editingQuotation.quotationNumber})`
                  : isBn
                    ? 'নতুন কোটেশন তৈরি করুন'
                    : 'Create New Quotation'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveQuotation} className="p-5 overflow-y-auto space-y-4 text-xs">
              {formError && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    {isBn ? 'গ্রাহক' : 'Customer'}
                  </label>
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(Number(e.target.value))}
                    className="w-full h-9 px-2.5 border border-slate-300 rounded-lg bg-white"
                  >
                    {data.customers.map((c: Customer) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    {isBn ? 'শাখা' : 'Branch'}
                  </label>
                  <select
                    value={branchId}
                    onChange={(e) => setBranchId(Number(e.target.value))}
                    className="w-full h-9 px-2.5 border border-slate-300 rounded-lg bg-white"
                  >
                    {data.branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {isBn ? b.nameBn : b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    {isBn ? 'অবস্থা (Status)' : 'Status'}
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as QuotationStatus)}
                    className="w-full h-9 px-2.5 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="draft">{t.status.draft}</option>
                    <option value="sent">{t.status.sent}</option>
                    <option value="accepted">{t.status.accepted}</option>
                    <option value="expired">{t.status.expired}</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    {isBn ? 'কোটেশন তারিখ' : 'Issue Date'}
                  </label>
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="w-full h-9 px-2.5 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    {isBn ? 'মেয়াদ শেষ (Valid Until)' : 'Valid Until'}
                  </label>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="w-full h-9 px-2.5 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    {isBn ? 'P.O No (ঐচ্ছিক)' : 'P.O No (Optional)'}
                  </label>
                  <input
                    type="text"
                    value={poNumber}
                    onChange={(e) => setPoNumber(e.target.value)}
                    placeholder="PO-2026-001"
                    className="w-full h-9 px-2.5 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              {/* Line Items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">
                    {isBn ? 'পণ্য ও সেবার তালিকা' : 'Quotation Line Items'}
                  </span>
                  <button
                    type="button"
                    onClick={addLine}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#0F766E] hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isBn ? 'সারি যোগ করুন' : 'Add Line'}</span>
                  </button>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-500">
                        <th className="py-2 px-2.5">{isBn ? 'পণ্য' : 'Product'}</th>
                        <th className="py-2 px-2.5 w-24 text-right">{isBn ? 'পরিমাণ' : 'Qty'}</th>
                        <th className="py-2 px-2.5 w-28 text-right">{isBn ? 'একক দর' : 'Rate'}</th>
                        <th className="py-2 px-2.5 w-24 text-right">{isBn ? 'ছাড়' : 'Discount'}</th>
                        <th className="py-2 px-2.5 w-28 text-right">{isBn ? 'মোট' : 'Line Total'}</th>
                        <th className="py-2 px-2 w-9" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {lines.map((line, idx) => {
                        const calcLine = computedPreview.lines[idx];
                        return (
                          <tr key={idx}>
                            <td className="p-2">
                              <select
                                value={line.productId ?? ''}
                                onChange={(e) => updateLineProduct(idx, Number(e.target.value))}
                                className="w-full h-8 px-2 border border-slate-200 rounded bg-white"
                              >
                                {data.products.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {isBn ? p.nameBn || p.name : p.name} ({p.sku})
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min="0.01"
                                step="any"
                                value={line.quantity}
                                onChange={(e) => {
                                  const val = Math.max(0.01, Number(e.target.value) || 0);
                                  setLines((prev) =>
                                    prev.map((l, i) => (i === idx ? { ...l, quantity: val } : l))
                                  );
                                }}
                                className="w-full h-8 px-2 text-right border border-slate-200 rounded tabular-nums"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={line.unitPrice}
                                onChange={(e) => {
                                  const val = Math.max(0, Number(e.target.value) || 0);
                                  setLines((prev) =>
                                    prev.map((l, i) => (i === idx ? { ...l, unitPrice: val } : l))
                                  );
                                }}
                                className="w-full h-8 px-2 text-right border border-slate-200 rounded tabular-nums"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={line.discountAmount}
                                onChange={(e) => {
                                  const val = Math.max(0, Number(e.target.value) || 0);
                                  setLines((prev) =>
                                    prev.map((l, i) => (i === idx ? { ...l, discountAmount: val } : l))
                                  );
                                }}
                                className="w-full h-8 px-2 text-right border border-slate-200 rounded tabular-nums"
                              />
                            </td>
                            <td className="p-2 text-right font-semibold tabular-nums">
                              {formatMoney(calcLine?.lineTotal || 0, lang, sym)}
                            </td>
                            <td className="p-2 text-center">
                              {lines.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                                  className="text-slate-400 hover:text-rose-600"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Notes & Totals */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    {isBn ? 'শর্তাবলী ও নোট' : 'Terms & Notes'}
                  </label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={
                      isBn
                        ? 'ডেলিভারি সময়সীমা, পেমেন্ট শর্ত বা ওয়ারেন্টি উল্লেখ করুন...'
                        : 'Delivery timeline, payment terms, or warranty notes...'
                    }
                    className="w-full p-2.5 border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-1.5">
                  <div className="flex justify-between text-slate-600">
                    <span>{isBn ? 'উপমোট (Subtotal)' : 'Subtotal'}</span>
                    <span className="tabular-nums font-medium">
                      {formatMoney(computedPreview.subtotal, lang, sym)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>{isBn ? 'মোট ভ্যাট (VAT)' : 'Total VAT'}</span>
                    <span className="tabular-nums font-medium">
                      {formatMoney(computedPreview.vatTotal, lang, sym)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-slate-900 pt-1.5 border-t border-slate-200">
                    <span>{isBn ? 'সর্বমোট (Grand Total)' : 'Grand Total'}</span>
                    <span className="tabular-nums text-[#0F766E]">
                      {formatMoney(computedPreview.grandTotal, lang, sym)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  {t.actions.cancel}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#0D655E] rounded-lg disabled:opacity-50"
                >
                  {submitting
                    ? isBn
                      ? 'সংরক্ষণ হচ্ছে...'
                      : 'Saving...'
                    : editingQuotation
                      ? isBn
                        ? 'আপডেট করুন'
                        : 'Update Quotation'
                      : isBn
                        ? 'কোটেশন সংরক্ষণ করুন'
                        : 'Save Quotation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

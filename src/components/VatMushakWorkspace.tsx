import { useState } from 'react';
import { Download, Edit3, Loader2, Plus, Receipt, Trash2 } from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import { formatDate, formatMoney, formatNumber, todayISO } from '../engine/format';
import type { Invoice, Language, TaxRule } from '../engine/types';
import { DICT } from '../i18n/translations';
import { apiRequest, type WorkspacePayload } from '../lib/api';
import { downloadPdfDocument } from '../lib/pdfExport';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface Props {
  data: WorkspacePayload;
  lang: Language;
  subtab: string;
  onSubtabChange: (tab: string) => void;
  onPreviewMushak: (invoice: Invoice) => void;
  onRefresh: () => Promise<void>;
}

export function VatMushakWorkspace({
  data,
  lang,
  subtab,
  onSubtabChange,
  onPreviewMushak,
  onRefresh,
}: Props) {
  const t = DICT[lang];
  const isBn = lang === 'bn';
  const { notify } = useFeedback();
  const money = (v: number) => formatMoney(v, lang, data.organization.currencySymbol);
  const numClass = isBn ? 'tabular-nums' : 'font-mono tabular-nums';
  const { vatReturn } = data.reports;

  const [showAddRule, setShowAddRule] = useState(false);
  const [editingRule, setEditingRule] = useState<TaxRule | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [nameBn, setNameBn] = useState('');
  const [rate, setRate] = useState('15');
  const [sdRate, setSdRate] = useState('0');
  const [effectiveFrom, setEffectiveFrom] = useState(todayISO());
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaxRule | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const openNewRule = () => {
    setEditingRule(null);
    setCode('');
    setName('');
    setNameBn('');
    setRate('15');
    setSdRate('0');
    setEffectiveFrom(todayISO());
    setShowAddRule(true);
  };

  const openEditRule = (r: TaxRule) => {
    setEditingRule(r);
    setCode(r.code);
    setName(r.name);
    setNameBn(r.nameBn || '');
    setRate(String(r.rate));
    setSdRate(String(r.sdRate || 0));
    setEffectiveFrom(r.effectiveFrom);
    setShowAddRule(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const body = {
        code,
        name,
        nameBn: nameBn || name,
        rate: Number(rate),
        sdRate: Number(sdRate) || 0,
        mushakCategory: Number(rate) === 15 ? 'standard' : Number(rate) === 0 ? 'zero_rated' : 'truncated',
        effectiveFrom,
      };
      if (editingRule) {
        await apiRequest(`/api/tax-rules/${editingRule.id}`, { method: 'PUT', body });
        notify({ title: isBn ? 'ভ্যাট নিয়ম হালনাগাদ হয়েছে।' : 'VAT tax rule updated.', variant: 'success', sound: 'save' });
      } else {
        await apiRequest('/api/tax-rules', { method: 'POST', body });
        notify({ title: isBn ? 'নতুন ভ্যাট নিয়ম যুক্ত হয়েছে।' : 'VAT tax rule created.', variant: 'success', sound: 'save' });
      }
      setEditingRule(null);
      setCode('');
      setName('');
      setNameBn('');
      setShowAddRule(false);
      await onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save tax rule.';
      setError(msg);
      notify({ title: msg, variant: 'error' });
    }
  };

  const handleDeleteRule = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiRequest(`/api/tax-rules/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      notify({ title: isBn ? 'ভ্যাট নিয়ম মুছে ফেলা হয়েছে।' : 'Tax rule deleted.', variant: 'warning', sound: 'delete' });
      await onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete tax rule.';
      setDeleteError(msg);
      notify({ title: msg, variant: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const handleDownloadVatPdf = async () => {
    setExporting(true);
    setError(null);
    try {
      if (subtab === 'mushak63') {
        await downloadPdfDocument({ type: 'mushak_63_register', invoices: data.invoices }, data.organization, lang);
      } else {
        await downloadPdfDocument({ type: 'mushak_91', reports: data.reports }, data.organization, lang);
      }
      notify({
        title: isBn ? 'মূসক রিপোর্ট PDF ডাউনলোড হয়েছে।' : 'Mushak VAT PDF downloaded.',
        variant: 'info',
        sound: 'export',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export VAT PDF.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'mushak91', label: t.tabs.mushak91 },
            { id: 'mushak63', label: t.tabs.mushak63 },
            { id: 'taxRules', label: t.tabs.taxRules },
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

        <div className="flex items-center gap-2 shrink-0">
          {(subtab === 'mushak91' || subtab === 'mushak63') && (
            <button
              type="button"
              disabled={exporting}
              onClick={handleDownloadVatPdf}
              className="min-h-[40px] sm:min-h-0 inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#0F766E] hover:bg-[#115E59] disabled:opacity-60 rounded-xl sm:rounded-lg whitespace-nowrap active:scale-[0.98]"
            >
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {exporting ? (isBn ? 'তৈরি হচ্ছে...' : 'Exporting...') : t.actions.print}
            </button>
          )}
          {subtab === 'taxRules' && (
            <button
              type="button"
              onClick={openNewRule}
              className="min-h-[40px] sm:min-h-0 inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#0F766E] hover:bg-[#115E59] rounded-xl sm:rounded-lg whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              {isBn ? 'নতুন মূসক হার যোগ করুন' : 'Add Tax Rule Version'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl">
          {error}
        </div>
      )}

      {/* MUSHAK 9.1 VAT RETURN SUMMARY */}
      {subtab === 'mushak91' && (
        <div className="space-y-4 sm:space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-slate-200 border border-slate-200 rounded-2xl sm:rounded-xl overflow-hidden">
            <div className="bg-white p-4 sm:p-5">
              <div className="text-xs text-slate-500">{t.labels.outputVat}</div>
              <div className={`text-xl sm:text-2xl font-semibold text-slate-900 mt-1 ${numClass}`}>
                {money(vatReturn.outputVat)}
              </div>
              <div className={`text-xs text-slate-500 mt-1 ${numClass}`}>
                {t.labels.taxableSales}: {money(vatReturn.taxableSales)}
              </div>
            </div>
            <div className="bg-white p-4 sm:p-5">
              <div className="text-xs text-slate-500">{t.labels.inputVat}</div>
              <div className={`text-xl sm:text-2xl font-semibold text-emerald-700 mt-1 ${numClass}`}>
                {money(vatReturn.inputVat)}
              </div>
              <div className={`text-xs text-slate-500 mt-1 ${numClass}`}>
                {t.labels.taxablePurchases}: {money(vatReturn.taxablePurchases)}
              </div>
            </div>
            <div className="bg-white p-4 sm:p-5">
              <div className="text-xs text-slate-500">{t.metrics.netVatPayable}</div>
              <div className={`text-xl sm:text-2xl font-semibold text-[#0F766E] mt-1 ${numClass}`}>
                {money(vatReturn.netVatPayable)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {isBn
                  ? `মোট ইস্যুকৃত চালান: ${formatNumber(vatReturn.challanCount, 'bn')}`
                  : `${vatReturn.challanCount} Mushak 6.3 challans issued`}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">
                {isBn ? 'মূসক-৯.১ রিটার্ন সারসংক্ষেপ (স্বয়ংক্রিয় লেজার সমন্বিত)' : 'Mushak 9.1 Monthly Return Worksheet'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                BIN: <span className="font-mono">{data.organization.binNumber}</span> · {isBn ? data.organization.nameBn : data.organization.name}
              </p>
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                    <th className="py-2.5 px-4 text-left font-medium">{isBn ? 'নোট' : 'Note'}</th>
                    <th className="py-2.5 px-4 text-left font-medium">{isBn ? 'বিবরণ' : 'Return Line Item'}</th>
                    <th className="py-2.5 px-4 text-right font-medium">{isBn ? 'মূল্য (ক)' : 'Value (A)'}</th>
                    <th className="py-2.5 px-4 text-right font-medium">{isBn ? 'মূসক (খ)' : 'VAT (B)'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="py-3 px-4 font-mono text-xs text-slate-500">Part 3 · Note 4</td>
                    <td className="py-3 px-4 text-slate-900">{isBn ? 'আদর্শ ও হ্রাসকৃত হারে সরবরাহ (মূসক ৬.২/৬.৩)' : 'Standard & Truncated Rated Supplies (Sales Register 6.2)'}</td>
                    <td className={`py-3 px-4 text-right ${numClass}`}>{money(vatReturn.taxableSales)}</td>
                    <td className={`py-3 px-4 text-right font-medium ${numClass}`}>{money(vatReturn.outputVat)}</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-mono text-xs text-slate-500">Part 4 · Note 14</td>
                    <td className="py-3 px-4 text-slate-900">{isBn ? 'স্থানীয় ক্রয় ও উপকরণ কর রেয়াত (মূসক ৬.১)' : 'Local Purchases & Input VAT Credit (Purchase Register 6.1)'}</td>
                    <td className={`py-3 px-4 text-right ${numClass}`}>{money(vatReturn.taxablePurchases)}</td>
                    <td className={`py-3 px-4 text-right font-medium text-emerald-700 ${numClass}`}>({money(vatReturn.inputVat)})</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-mono text-xs text-slate-500">Part 5 · SD</td>
                    <td className="py-3 px-4 text-slate-900">{isBn ? 'সম্পূরক শুল্ক (SD)' : 'Supplementary Duty (SD)'}</td>
                    <td className="py-3 px-4 text-right">—</td>
                    <td className={`py-3 px-4 text-right ${numClass}`}>{money(vatReturn.sdPayable)}</td>
                  </tr>
                  <tr className="bg-slate-50 font-semibold">
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-700">Part 7 · Net</td>
                    <td className="py-3.5 px-4 text-slate-900">{isBn ? 'ট্রেজারি জমার জন্য নিট প্রদেয় মূসক' : 'Net Payable VAT for Treasury Deposit'}</td>
                    <td className="py-3.5 px-4"></td>
                    <td className={`py-3.5 px-4 text-right text-[#0F766E] ${numClass}`}>
                      {money(vatReturn.netVatPayable + vatReturn.sdPayable)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Mobile Worksheet Cards (Zero horizontal scroll) */}
            <div className="md:hidden divide-y divide-slate-100 text-xs">
              <div className="p-4 space-y-1.5">
                <div className="font-mono text-[11px] text-slate-500">Part 3 · Note 4</div>
                <div className="text-sm font-medium text-slate-900">
                  {isBn ? 'আদর্শ ও হ্রাসকৃত হারে সরবরাহ (মূসক ৬.২/৬.৩)' : 'Standard & Truncated Supplies (6.2)'}
                </div>
                <div className={`flex justify-between pt-1 ${numClass}`}>
                  <span className="text-slate-500">{isBn ? 'মূল্য' : 'Value'}: {money(vatReturn.taxableSales)}</span>
                  <span className="font-semibold text-slate-900">{isBn ? 'মূসক' : 'VAT'}: {money(vatReturn.outputVat)}</span>
                </div>
              </div>
              <div className="p-4 space-y-1.5">
                <div className="font-mono text-[11px] text-slate-500">Part 4 · Note 14</div>
                <div className="text-sm font-medium text-slate-900">
                  {isBn ? 'স্থানীয় ক্রয় ও উপকরণ কর রেয়াত (মূসক ৬.১)' : 'Local Purchases & Input VAT (6.1)'}
                </div>
                <div className={`flex justify-between pt-1 ${numClass}`}>
                  <span className="text-slate-500">{isBn ? 'মূল্য' : 'Value'}: {money(vatReturn.taxablePurchases)}</span>
                  <span className="font-semibold text-emerald-700">({money(vatReturn.inputVat)})</span>
                </div>
              </div>
              <div className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-mono text-[11px] text-slate-500">Part 5 · SD</div>
                  <div className="text-sm font-medium text-slate-900">{isBn ? 'সম্পূরক শুল্ক (SD)' : 'Supplementary Duty'}</div>
                </div>
                <span className={`text-sm font-medium text-slate-900 ${numClass}`}>{money(vatReturn.sdPayable)}</span>
              </div>
              <div className="p-4 bg-slate-50 flex items-center justify-between font-bold">
                <div>
                  <div className="font-mono text-[11px] text-slate-500 font-medium">Part 7 · Net</div>
                  <div className="text-sm text-slate-900">{isBn ? 'ট্রেজারি জমার নিট প্রদেয় মূসক' : 'Net Payable VAT'}</div>
                </div>
                <span className={`text-base text-[#0F766E] ${numClass}`}>
                  {money(vatReturn.netVatPayable + vatReturn.sdPayable)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MUSHAK 6.3 CHALLAN REGISTER */}
      {subtab === 'mushak63' && (
        <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden md:block">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                  <th className="py-2.5 px-4 text-left font-medium">{isBn ? 'মূসক ৬.৩ নম্বর' : 'Mushak 6.3 No.'}</th>
                  <th className="py-2.5 px-4 text-left font-medium">{t.labels.customer}</th>
                  <th className="py-2.5 px-4 text-left font-medium">{t.labels.date}</th>
                  <th className="py-2.5 px-4 text-right font-medium">{t.labels.subtotal}</th>
                  <th className="py-2.5 px-4 text-right font-medium">{t.labels.vat}</th>
                  <th className="py-2.5 px-4 text-right font-medium">{t.labels.total}</th>
                  <th className="py-2.5 px-4 text-right font-medium">{isBn ? 'চালান PDF' : 'Challan PDF'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono text-xs font-medium text-slate-900">{inv.mushakChallanNo}</td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{inv.customerName}</div>
                      {inv.customerBin && <div className="font-mono text-[11px] text-slate-500">BIN {inv.customerBin}</div>}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">{formatDate(inv.issueDate, lang)}</td>
                    <td className={`py-3 px-4 text-right text-xs ${numClass}`}>{money(inv.subtotal)}</td>
                    <td className={`py-3 px-4 text-right text-xs text-[#0F766E] font-medium ${numClass}`}>{money(inv.vatTotal)}</td>
                    <td className={`py-3 px-4 text-right font-semibold ${numClass}`}>{money(inv.grandTotal)}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onPreviewMushak(inv)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#0F766E] hover:bg-[#0F766E]/10 rounded-md whitespace-nowrap"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          {t.actions.viewChallan}
                        </button>
                        <button
                          type="button"
                          aria-label={`Download Mushak 6.3 PDF ${inv.mushakChallanNo}`}
                          onClick={() => downloadPdfDocument({ type: 'mushak_63', invoice: inv }, data.organization, lang)}
                          className="p-1.5 text-slate-500 hover:text-[#0F766E] hover:bg-slate-100 rounded-md"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {data.invoices.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-xs text-slate-500">
                      {isBn ? 'কোনো মূসক ৬.৩ চালান তৈরি হয়নি।' : 'No Mushak 6.3 challans issued yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Challan Cards */}
          <div className="md:hidden divide-y divide-slate-100">
            {data.invoices.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                {isBn ? 'কোনো মূসক ৬.৩ চালান তৈরি হয়নি।' : 'No Mushak 6.3 challans issued yet.'}
              </div>
            ) : (
              data.invoices.map((inv) => (
                <div key={inv.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-xs font-semibold text-slate-900">{inv.mushakChallanNo}</div>
                      <div className="text-sm font-medium text-slate-800 truncate">{inv.customerName}</div>
                      <div className="text-xs text-slate-500">{formatDate(inv.issueDate, lang)}</div>
                    </div>
                    <div className={`text-right shrink-0 ${numClass}`}>
                      <div className="text-sm font-semibold text-slate-900">{money(inv.grandTotal)}</div>
                      <div className="text-xs text-[#0F766E]">{t.labels.vat}: {money(inv.vatTotal)}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onPreviewMushak(inv)}
                      className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-xl"
                    >
                      {t.actions.viewChallan}
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadPdfDocument({ type: 'mushak_63', invoice: inv }, data.organization, lang)}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#0F766E] rounded-xl"
                    >
                      <Download className="w-3.5 h-3.5" />
                      PDF
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* VERSIONED TAX RULES */}
      {subtab === 'taxRules' && (
        <div className="space-y-4">
          {showAddRule && (
            <form onSubmit={handleSaveRule} className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl p-4 sm:p-5 space-y-4">
              <div className="text-sm font-semibold text-slate-900">
                {editingRule
                  ? isBn
                    ? `মূসক নীতিমালা সম্পাদনা (${editingRule.code})`
                    : `Edit Tax Rule (${editingRule.code})`
                  : isBn
                    ? 'নতুন কার্যকরী মূসক হার যুক্ত করুন'
                    : 'Create Versioned Tax Rule'}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input type="text" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code (e.g. VAT-10)" className="h-10 sm:h-9 px-3 text-sm font-mono border border-slate-300 rounded-xl sm:rounded-lg" />
                <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="English Name *" className="h-10 sm:h-9 px-3 text-sm border border-slate-300 rounded-xl sm:rounded-lg" />
                <input type="text" value={nameBn} onChange={(e) => setNameBn(e.target.value)} placeholder="বাংলা নাম" className="h-10 sm:h-9 px-3 text-sm border border-slate-300 rounded-xl sm:rounded-lg" />
                <input type="number" required min="0" step="any" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="VAT Rate %" className="h-10 sm:h-9 px-3 text-sm font-mono border border-slate-300 rounded-xl sm:rounded-lg" />
                <input type="number" min="0" step="any" value={sdRate} onChange={(e) => setSdRate(e.target.value)} placeholder="SD Rate %" className="h-10 sm:h-9 px-3 text-sm font-mono border border-slate-300 rounded-xl sm:rounded-lg" />
                <input type="date" required value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className="h-10 sm:h-9 px-3 text-sm font-mono border border-slate-300 rounded-xl sm:rounded-lg" />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddRule(false);
                    setEditingRule(null);
                  }}
                  className="min-h-[40px] px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-xl sm:rounded-lg"
                >
                  {t.actions.cancel}
                </button>
                <button type="submit" className="min-h-[40px] px-4 py-2 text-xs font-medium text-white bg-[#0F766E] rounded-xl sm:rounded-lg">{t.actions.save}</button>
              </div>
            </form>
          )}

          <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl overflow-hidden">
            {/* Desktop Table */}
            <div className="hidden md:block">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                    <th className="py-2.5 px-4 text-left font-medium">{isBn ? 'কোড' : 'Code'}</th>
                    <th className="py-2.5 px-4 text-left font-medium">{isBn ? 'বিবরণ' : 'Rule Name'}</th>
                    <th className="py-2.5 px-4 text-right font-medium">{isBn ? 'মূসক হার' : 'VAT %'}</th>
                    <th className="py-2.5 px-4 text-right font-medium">SD %</th>
                    <th className="py-2.5 px-4 text-left font-medium">{isBn ? 'কার্যকর তারিখ' : 'Effective From'}</th>
                    <th className="py-2.5 px-4 text-right font-medium">{isBn ? 'অ্যাকশন' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.taxRules.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono text-xs font-medium text-slate-900">{r.code}</td>
                      <td className="py-3 px-4 text-slate-900">
                        {isBn ? r.nameBn : r.name}
                        {r.isDefault && (
                          <span className="ml-2 text-xs text-[#0F766E] font-medium">
                            ({isBn ? 'ডিফল্ট' : 'Default'})
                          </span>
                        )}
                      </td>
                      <td className={`py-3 px-4 text-right font-medium ${numClass}`}>{formatNumber(r.rate, lang)}%</td>
                      <td className={`py-3 px-4 text-right text-slate-600 ${numClass}`}>{formatNumber(r.sdRate, lang)}%</td>
                      <td className="py-3 px-4 text-xs text-slate-600">{formatDate(r.effectiveFrom, lang)}</td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditRule(r)}
                            aria-label={`Edit tax rule ${r.code}`}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {!r.isDefault && (
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteError(null);
                                setDeleteTarget(r);
                              }}
                              aria-label={`Delete tax rule ${r.code}`}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Tax Rule Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {data.taxRules.map((r) => (
                <div key={r.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900">
                        {isBn ? r.nameBn : r.name}
                        {r.isDefault && (
                          <span className="ml-1.5 text-xs text-[#0F766E] font-medium">({isBn ? 'ডিফল্ট' : 'Default'})</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        <span className="font-mono">{r.code}</span> · {formatDate(r.effectiveFrom, lang)}
                      </div>
                    </div>
                    <div className={`text-right shrink-0 ${numClass}`}>
                      <div className="text-sm font-semibold text-slate-900">{formatNumber(r.rate, lang)}%</div>
                      {r.sdRate > 0 && <div className="text-[11px] text-slate-500">SD {formatNumber(r.sdRate, lang)}%</div>}
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-1.5 pt-1.5 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => openEditRule(r)}
                      className="min-h-[34px] px-2.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg inline-flex items-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>{t.actions.edit}</span>
                    </button>
                    {!r.isDefault && (
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleteTarget(r);
                        }}
                        className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center text-rose-600 border border-rose-200 rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        lang={lang}
        title={isBn ? 'মূসক নীতিমালা মুছে ফেলবেন?' : 'Delete Tax Rule?'}
        itemLabel={deleteTarget ? `${deleteTarget.code} — ${isBn ? deleteTarget.nameBn : deleteTarget.name}` : ''}
        description={
          isBn
            ? 'কোনো পণ্য বা ইনভয়েসে ব্যবহৃত না থাকলে এই মূসক হারটি স্থায়ীভাবে মুছে যাবে।'
            : 'Removes this tax rule permanently if it is not referenced by existing products or invoices.'
        }
        busy={deleting}
        error={deleteError}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={handleDeleteRule}
      />
    </div>
  );
}

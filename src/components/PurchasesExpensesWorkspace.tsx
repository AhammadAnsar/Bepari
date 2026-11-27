import { useEffect, useState } from 'react';
import { Edit3, Plus, Trash2 } from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import { formatDate, formatMoney, todayISO } from '../engine/format';
import type { Expense, Language, PaymentMethod, Purchase, Vendor } from '../engine/types';
import { DICT } from '../i18n/translations';
import { apiRequest, type WorkspacePayload } from '../lib/api';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface Props {
  data: WorkspacePayload;
  lang: Language;
  subtab: string;
  onSubtabChange: (tab: string) => void;
  activeBranchId: number;
  openFormToken?: number;
  onRefresh: () => Promise<void>;
}

const EXPENSE_ACCOUNTS = [
  { code: '5100', labelEn: 'Office & Warehouse Rent', labelBn: 'অফিস ও গুদাম ভাড়া' },
  { code: '5200', labelEn: 'Utilities & Internet', labelBn: 'বিদ্যুৎ, গ্যাস ও ইন্টারনেট' },
  { code: '5300', labelEn: 'Staff Salaries & Wages', labelBn: 'কর্মচারী বেতন-ভাতা' },
  { code: '5400', labelEn: 'Logistics & Delivery', labelBn: 'পরিবহন ও ডেলিভারি' },
  { code: '5500', labelEn: 'Office Supplies & Misc', labelBn: 'অফিস ও বিবিধ খরচ' },
];

type DeleteTarget =
  | { type: 'expense'; item: Expense }
  | { type: 'purchase'; item: Purchase }
  | { type: 'vendor'; item: Vendor };

export function PurchasesExpensesWorkspace({
  data,
  lang,
  subtab,
  onSubtabChange,
  activeBranchId,
  openFormToken,
  onRefresh,
}: Props) {
  const effectiveSubtab = ['expenses', 'purchases', 'vendors'].includes(subtab) ? subtab : 'expenses';
  const t = DICT[lang];
  const isBn = lang === 'bn';
  const { notify } = useFeedback();
  const money = (v: number) => formatMoney(v, lang, data.organization.currencySymbol);
  const numClass = isBn ? 'tabular-nums tracking-tight' : 'font-mono tabular-nums';

  const [showForm, setShowForm] = useState(Boolean(openFormToken && openFormToken > 0));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Editing targets
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (openFormToken && openFormToken > 0) {
      setEditingExpense(null);
      setEditingPurchase(null);
      setEditingVendor(null);
      setShowForm(true);
    }
  }, [openFormToken]);

  // Expense form
  const [expAccount, setExpAccount] = useState('5100');
  const [expVendor, setExpVendor] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expVat, setExpVat] = useState('0');
  const [expMethod, setExpMethod] = useState<PaymentMethod>('cash');
  const [expDate, setExpDate] = useState(todayISO());
  const [expNotes, setExpNotes] = useState('');

  // Purchase form
  const [purVendorId, setPurVendorId] = useState<number>(data.vendors[0]?.id || 0);
  const [purProductId, setPurProductId] = useState<number>(
    data.products.find((p) => p.trackInventory)?.id || data.products[0]?.id || 0
  );
  const [purDate, setPurDate] = useState(todayISO());
  const [purQty, setPurQty] = useState('5');
  const [purCost, setPurCost] = useState(String(data.products[0]?.costPrice || 1000));
  const [purVatRate, setPurVatRate] = useState('15');
  const [purMushak61, setPurMushak61] = useState('');
  const [purPaidNow, setPurPaidNow] = useState(true);

  // Vendor form
  const [vName, setVName] = useState('');
  const [vCompany, setVCompany] = useState('');
  const [vPhone, setVPhone] = useState('');
  const [vBin, setVBin] = useState('');

  const resetForms = () => {
    setEditingExpense(null);
    setEditingPurchase(null);
    setEditingVendor(null);
    setExpAccount('5100');
    setExpVendor('');
    setExpAmount('');
    setExpVat('0');
    setExpMethod('cash');
    setExpDate(todayISO());
    setExpNotes('');
    setPurVendorId(data.vendors[0]?.id || 0);
    setPurProductId(data.products.find((p) => p.trackInventory)?.id || data.products[0]?.id || 0);
    setPurDate(todayISO());
    setPurQty('5');
    setPurCost(String(data.products[0]?.costPrice || 1000));
    setPurVatRate('15');
    setPurMushak61('');
    setPurPaidNow(true);
    setVName('');
    setVCompany('');
    setVPhone('');
    setVBin('');
  };

  const startEditExpense = (ex: Expense) => {
    setEditingExpense(ex);
    setExpAccount(ex.accountCode || '5500');
    setExpVendor(ex.vendorName || '');
    setExpAmount(String(ex.amount));
    setExpVat(String(ex.vatAmount || 0));
    setExpMethod(ex.paymentMethod || 'cash');
    setExpDate(ex.expenseDate);
    setExpNotes(ex.notes || '');
    setError(null);
    setShowForm(true);
  };

  const startEditPurchase = (p: Purchase) => {
    setEditingPurchase(p);
    setPurVendorId(p.vendorId);
    const firstItem = p.items?.[0];
    setPurProductId(firstItem?.productId || data.products.find((pr) => pr.trackInventory)?.id || 0);
    setPurDate(p.purchaseDate);
    setPurQty(String(firstItem?.quantity ?? 1));
    setPurCost(String(firstItem?.unitCost ?? p.subtotal));
    setPurVatRate(String(firstItem?.vatRate ?? 0));
    setPurMushak61(p.mushak61Ref || '');
    setPurPaidNow(p.status === 'paid' || p.paidAmount >= p.grandTotal - 0.01);
    setError(null);
    setShowForm(true);
  };

  const startEditVendor = (v: Vendor) => {
    setEditingVendor(v);
    setVName(v.name);
    setVCompany(v.companyName || '');
    setVPhone(v.phone || '');
    setVBin(v.binNumber || '');
    setError(null);
    setShowForm(true);
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const cat = EXPENSE_ACCOUNTS.find((a) => a.code === expAccount);
      const body = {
        branchId: editingExpense?.branchId || activeBranchId || data.branches[0]?.id || 1,
        expenseDate: expDate,
        category: isBn ? cat?.labelBn || expAccount : cat?.labelEn || expAccount,
        accountCode: expAccount,
        vendorName: expVendor,
        amount: Number(expAmount),
        vatAmount: Number(expVat) || 0,
        paymentMethod: expMethod,
        notes: expNotes,
      };
      if (editingExpense) {
        await apiRequest(`/api/expenses/${editingExpense.id}`, { method: 'PUT', body });
        notify({ title: isBn ? 'খরচের ভাউচার হালনাগাদ হয়েছে।' : 'Expense updated.', variant: 'success', sound: 'save' });
      } else {
        await apiRequest('/api/expenses', { method: 'POST', body });
        notify({ title: isBn ? 'নতুন খরচ নথিভুক্ত হয়েছে।' : 'Expense recorded.', variant: 'success', sound: 'save' });
      }
      resetForms();
      setShowForm(false);
      await onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save expense.';
      setError(msg);
      notify({ title: msg, variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body = {
        branchId: editingPurchase?.branchId || activeBranchId || data.branches[0]?.id || 1,
        vendorId: purVendorId || data.vendors[0]?.id,
        purchaseDate: purDate || todayISO(),
        mushak61Ref: purMushak61,
        payImmediately: purPaidNow,
        paymentMethod: 'bank',
        items: [
          {
            productId: purProductId || data.products[0]?.id,
            quantity: Number(purQty),
            unitCost: Number(purCost),
            vatRate: Number(purVatRate) || 0,
          },
        ],
      };
      if (editingPurchase) {
        await apiRequest(`/api/purchases/${editingPurchase.id}`, { method: 'PUT', body });
        notify({ title: isBn ? 'ক্রয় বিল হালনাগাদ হয়েছে।' : 'Purchase bill updated.', variant: 'success', sound: 'save' });
      } else {
        await apiRequest('/api/purchases', { method: 'POST', body });
        notify({
          title: isBn ? 'ক্রয় ও স্টক গ্রহণ সম্পন্ন হয়েছে।' : 'Purchase & stock intake recorded.',
          variant: 'success',
          sound: 'save',
        });
      }
      resetForms();
      setShowForm(false);
      await onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save purchase.';
      setError(msg);
      notify({ title: msg, variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body = { name: vName, companyName: vCompany, phone: vPhone, binNumber: vBin };
      if (editingVendor) {
        await apiRequest(`/api/vendors/${editingVendor.id}`, { method: 'PUT', body });
        notify({ title: isBn ? 'সরবরাহকারীর তথ্য হালনাগাদ হয়েছে।' : 'Vendor updated.', variant: 'success', sound: 'save' });
      } else {
        await apiRequest('/api/vendors', { method: 'POST', body });
        notify({ title: isBn ? 'নতুন সরবরাহকারী যুক্ত হয়েছে।' : 'Vendor added.', variant: 'success', sound: 'save' });
      }
      resetForms();
      setShowForm(false);
      await onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save vendor.';
      setError(msg);
      notify({ title: msg, variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const label =
        deleteTarget.type === 'expense'
          ? isBn
            ? 'খরচের রেকর্ড মুছে ফেলা হয়েছে।'
            : 'Expense deleted.'
          : deleteTarget.type === 'purchase'
            ? isBn
              ? 'ক্রয় বিল মুছে ফেলা হয়েছে।'
              : 'Purchase deleted.'
            : isBn
              ? 'সরবরাহকারী মুছে ফেলা হয়েছে।'
              : 'Vendor deleted.';
      if (deleteTarget.type === 'expense') {
        await apiRequest(`/api/expenses/${deleteTarget.item.id}`, { method: 'DELETE' });
      } else if (deleteTarget.type === 'purchase') {
        await apiRequest(`/api/purchases/${deleteTarget.item.id}`, { method: 'DELETE' });
      } else {
        await apiRequest(`/api/vendors/${deleteTarget.item.id}`, { method: 'DELETE' });
      }
      setDeleteTarget(null);
      notify({ title: label, variant: 'warning', sound: 'delete' });
      await onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete item.';
      setDeleteError(msg);
      notify({ title: msg, variant: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'expenses', label: t.tabs.expenses },
            { id: 'purchases', label: t.tabs.purchases },
            { id: 'vendors', label: t.tabs.vendors },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                onSubtabChange(tab.id);
                setShowForm(false);
                resetForms();
                setError(null);
              }}
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

        <button
          type="button"
          onClick={() => {
            if (showForm && !editingExpense && !editingPurchase && !editingVendor) {
              setShowForm(false);
            } else {
              resetForms();
              setShowForm(true);
            }
          }}
          className="min-h-[40px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#0F766E] hover:bg-[#115E59] rounded-xl sm:rounded-lg whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          {effectiveSubtab === 'expenses' && t.actions.newExpense}
          {effectiveSubtab === 'purchases' && t.actions.newPurchase}
          {effectiveSubtab === 'vendors' && (isBn ? 'নতুন সরবরাহকারী' : 'Add Vendor')}
        </button>
      </div>

      {error && (
        <div role="alert" className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
          {error}
        </div>
      )}

      {/* EXPENSES */}
      {effectiveSubtab === 'expenses' && (
        <div className="space-y-4">
          {showForm && (
            <form onSubmit={handleSaveExpense} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="text-sm font-semibold text-slate-900">
                {editingExpense
                  ? isBn
                    ? `খরচ সম্পাদনা (${editingExpense.expenseNumber})`
                    : `Edit Expense (${editingExpense.expenseNumber})`
                  : t.actions.newExpense}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="exp-cat" className="block text-xs text-slate-600 mb-1">
                    {isBn ? 'খরচের খাত' : 'Expense Account'}
                  </label>
                  <select
                    id="exp-cat"
                    value={expAccount}
                    onChange={(e) => setExpAccount(e.target.value)}
                    className="w-full h-9 px-3 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    {EXPENSE_ACCOUNTS.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.code} — {isBn ? a.labelBn : a.labelEn}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="exp-vendor" className="block text-xs text-slate-600 mb-1">
                    {isBn ? 'প্রাপক / প্রতিষ্ঠান' : 'Payee / Vendor'}
                  </label>
                  <input
                    id="exp-vendor"
                    type="text"
                    value={expVendor}
                    onChange={(e) => setExpVendor(e.target.value)}
                    placeholder={isBn ? 'যেমন: ডেসকো / বাড়িওয়ালা' : 'e.g. DESCO / Landlord'}
                    className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="exp-date" className="block text-xs text-slate-600 mb-1">
                    {t.labels.date}
                  </label>
                  <input
                    id="exp-date"
                    type="date"
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="w-full h-9 px-3 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="exp-amount" className="block text-xs text-slate-600 mb-1">
                    {isBn ? 'খরচের পরিমাণ *' : 'Base Amount *'}
                  </label>
                  <input
                    id="exp-amount"
                    type="number"
                    required
                    min="1"
                    step="any"
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    className="w-full h-9 px-3 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="exp-vat" className="block text-xs text-slate-600 mb-1">
                    {isBn ? 'ইনপুট মূসক (যদি থাকে)' : 'Input VAT (optional)'}
                  </label>
                  <input
                    id="exp-vat"
                    type="number"
                    min="0"
                    step="any"
                    value={expVat}
                    onChange={(e) => setExpVat(e.target.value)}
                    className="w-full h-9 px-3 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="exp-method" className="block text-xs text-slate-600 mb-1">
                    {t.labels.method}
                  </label>
                  <select
                    id="exp-method"
                    value={expMethod}
                    onChange={(e) => setExpMethod(e.target.value as PaymentMethod)}
                    className="w-full h-9 px-3 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="cash">{isBn ? 'নগদ' : 'Cash'}</option>
                    <option value="bank">{isBn ? 'ব্যাংক' : 'Bank'}</option>
                    <option value="bkash">{isBn ? 'বিকাশ' : 'bKash'}</option>
                    <option value="nagad">{isBn ? 'নগদ অ্যাপ' : 'Nagad'}</option>
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="exp-notes" className="block text-xs text-slate-600 mb-1">{t.labels.notes}</label>
                <input
                  id="exp-notes"
                  type="text"
                  value={expNotes}
                  onChange={(e) => setExpNotes(e.target.value)}
                  className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    resetForms();
                    setShowForm(false);
                  }}
                  className="px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  {t.actions.cancel}
                </button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-xs font-medium text-white bg-[#0F766E] hover:bg-[#115E59] rounded-lg">
                  {t.actions.save}
                </button>
              </div>
            </form>
          )}

          <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl overflow-hidden">
            {data.expenses.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">{t.empty.noExpensesDesc}</div>
            ) : (
              <>
                <div className="hidden md:block">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                        <th className="py-2.5 px-4 text-left font-medium">{isBn ? 'ভাউচার নং' : 'Voucher'}</th>
                        <th className="py-2.5 px-4 text-left font-medium">{isBn ? 'খাত ও প্রাপক' : 'Category & Payee'}</th>
                        <th className="py-2.5 px-4 text-left font-medium">{t.labels.date}</th>
                        <th className="py-2.5 px-4 text-left font-medium">{t.labels.method}</th>
                        <th className="py-2.5 px-4 text-right font-medium">{t.labels.vat}</th>
                        <th className="py-2.5 px-4 text-right font-medium">{t.labels.total}</th>
                        <th className="py-2.5 px-4 text-right font-medium">{isBn ? 'অ্যাকশন' : 'Actions'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.expenses.map((ex) => (
                        <tr key={ex.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 font-mono text-xs text-slate-800">{ex.expenseNumber}</td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900">{ex.category}</div>
                            <div className="text-xs text-slate-500">{ex.vendorName || ex.notes}</div>
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">{formatDate(ex.expenseDate, lang)}</td>
                          <td className="py-3 px-4 text-xs uppercase text-slate-600">{ex.paymentMethod}</td>
                          <td className={`py-3 px-4 text-right text-xs text-slate-600 ${numClass}`}>{money(ex.vatAmount)}</td>
                          <td className={`py-3 px-4 text-right font-semibold text-slate-900 ${numClass}`}>{money(ex.totalAmount)}</td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => startEditExpense(ex)}
                                aria-label={`Edit expense ${ex.expenseNumber}`}
                                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteError(null);
                                  setDeleteTarget({ type: 'expense', item: ex });
                                }}
                                aria-label={`Delete expense ${ex.expenseNumber}`}
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

                {/* Mobile Expense Cards */}
                <div className="md:hidden divide-y divide-slate-100">
                  {data.expenses.map((ex) => (
                    <div key={ex.id} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 truncate">{ex.category}</div>
                          <div className="text-xs text-slate-500 truncate mt-0.5">{ex.vendorName || ex.notes || ex.expenseNumber}</div>
                          <div className="text-[11px] text-slate-500 mt-1">
                            {formatDate(ex.expenseDate, lang)} · <span className="uppercase">{ex.paymentMethod}</span>
                          </div>
                        </div>
                        <div className={`text-right shrink-0 ${numClass}`}>
                          <div className="text-sm font-semibold text-slate-900">{money(ex.totalAmount)}</div>
                          {ex.vatAmount > 0 && (
                            <div className="text-[11px] text-slate-500">{t.labels.vat}: {money(ex.vatAmount)}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-1.5 pt-1.5 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => startEditExpense(ex)}
                          aria-label={`Edit expense ${ex.expenseNumber}`}
                          className="min-h-[34px] px-2.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg inline-flex items-center gap-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>{t.actions.edit}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null);
                            setDeleteTarget({ type: 'expense', item: ex });
                          }}
                          aria-label={`Delete expense ${ex.expenseNumber}`}
                          className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center text-rose-600 border border-rose-200 rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* PURCHASES */}
      {effectiveSubtab === 'purchases' && (
        <div className="space-y-4">
          {showForm && (
            <form onSubmit={handleSavePurchase} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="text-sm font-semibold text-slate-900">
                {editingPurchase
                  ? isBn
                    ? `ক্রয় বিল সম্পাদনা (${editingPurchase.billNumber})`
                    : `Edit Purchase Bill (${editingPurchase.billNumber})`
                  : t.actions.newPurchase}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="pur-vendor" className="block text-xs text-slate-600 mb-1">{t.labels.vendor}</label>
                  <select
                    id="pur-vendor"
                    value={purVendorId}
                    onChange={(e) => setPurVendorId(Number(e.target.value))}
                    className="w-full h-9 px-3 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    {data.vendors.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="pur-prod" className="block text-xs text-slate-600 mb-1">{t.labels.item}</label>
                  <select
                    id="pur-prod"
                    value={purProductId}
                    onChange={(e) => setPurProductId(Number(e.target.value))}
                    className="w-full h-9 px-3 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    {data.products.filter((p) => p.trackInventory).map((p) => (
                      <option key={p.id} value={p.id}>{isBn ? p.nameBn : p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="pur-date" className="block text-xs text-slate-600 mb-1">{t.labels.date}</label>
                  <input
                    id="pur-date"
                    type="date"
                    value={purDate}
                    onChange={(e) => setPurDate(e.target.value)}
                    className="w-full h-9 px-3 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="pur-m61" className="block text-xs text-slate-600 mb-1">{isBn ? 'মূসক ৬.১ চালান নং' : 'Mushak 6.1 Ref'}</label>
                  <input
                    id="pur-m61"
                    type="text"
                    value={purMushak61}
                    onChange={(e) => setPurMushak61(e.target.value)}
                    placeholder="M61-2026-00201"
                    className="w-full h-9 px-3 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="pur-qty" className="block text-xs text-slate-600 mb-1">{t.labels.quantity}</label>
                  <input
                    id="pur-qty"
                    type="number"
                    required
                    min="1"
                    step="any"
                    value={purQty}
                    onChange={(e) => setPurQty(e.target.value)}
                    className="w-full h-9 px-3 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="pur-cost" className="block text-xs text-slate-600 mb-1">{isBn ? 'ক্রয় দর' : 'Unit Cost'}</label>
                    <input
                      id="pur-cost"
                      type="number"
                      required
                      min="0"
                      step="any"
                      value={purCost}
                      onChange={(e) => setPurCost(e.target.value)}
                      className="w-full h-9 px-3 text-sm font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label htmlFor="pur-vat" className="block text-xs text-slate-600 mb-1">{isBn ? 'মূসক %' : 'VAT %'}</label>
                    <input
                      id="pur-vat"
                      type="number"
                      min="0"
                      step="any"
                      value={purVatRate}
                      onChange={(e) => setPurVatRate(e.target.value)}
                      className="w-full h-9 px-3 text-sm font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" checked={purPaidNow} onChange={(e) => setPurPaidNow(e.target.checked)} />
                {isBn ? 'ব্যাংক থেকে তাৎক্ষণিক পরিশোধ করা হয়েছে' : 'Paid immediately from Bank account'}
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    resetForms();
                    setShowForm(false);
                  }}
                  className="px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  {t.actions.cancel}
                </button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-xs font-medium text-white bg-[#0F766E] hover:bg-[#115E59] rounded-lg">
                  {t.actions.save}
                </button>
              </div>
            </form>
          )}

          <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl overflow-hidden">
            <div className="hidden md:block">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                    <th className="py-2.5 px-4 text-left font-medium">{isBn ? 'বিল ও মূসক ৬.১' : 'Bill / Mushak 6.1'}</th>
                    <th className="py-2.5 px-4 text-left font-medium">{t.labels.vendor}</th>
                    <th className="py-2.5 px-4 text-left font-medium">{t.labels.branch}</th>
                    <th className="py-2.5 px-4 text-left font-medium">{t.labels.date}</th>
                    <th className="py-2.5 px-4 text-right font-medium">{t.labels.inputVat}</th>
                    <th className="py-2.5 px-4 text-right font-medium">{t.labels.total}</th>
                    <th className="py-2.5 px-4 text-right font-medium">{isBn ? 'অ্যাকশন' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.purchases.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="font-mono text-xs font-medium text-slate-900">{p.billNumber}</div>
                        <div className="font-mono text-[11px] text-slate-500">{p.mushak61Ref}</div>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">{p.vendorName}</td>
                      <td className="py-3 px-4 text-xs text-slate-600">{p.branchName}</td>
                      <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">{formatDate(p.purchaseDate, lang)}</td>
                      <td className={`py-3 px-4 text-right text-xs text-emerald-700 ${numClass}`}>{money(p.vatTotal)}</td>
                      <td className={`py-3 px-4 text-right font-semibold text-slate-900 ${numClass}`}>{money(p.grandTotal)}</td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => startEditPurchase(p)}
                            aria-label={`Edit purchase ${p.billNumber}`}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteError(null);
                              setDeleteTarget({ type: 'purchase', item: p });
                            }}
                            aria-label={`Delete purchase ${p.billNumber}`}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {data.purchases.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-xs text-slate-500">
                        {isBn ? 'কোনো ক্রয় বিল লিপিবদ্ধ নেই।' : 'No purchase bills recorded yet.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Purchase Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {data.purchases.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  {isBn ? 'কোনো ক্রয় বিল লিপিবদ্ধ নেই।' : 'No purchase bills recorded yet.'}
                </div>
              ) : (
                data.purchases.map((p) => (
                  <div key={p.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate">{p.vendorName}</div>
                        <div className="font-mono text-xs text-slate-500 mt-0.5">{p.billNumber} · {p.mushak61Ref}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{formatDate(p.purchaseDate, lang)} · {p.branchName}</div>
                      </div>
                      <div className={`text-right shrink-0 ${numClass}`}>
                        <div className="text-sm font-semibold text-slate-900">{money(p.grandTotal)}</div>
                        <div className="text-[11px] text-emerald-700">{isBn ? 'মূসক রেয়াত' : 'VAT'}: {money(p.vatTotal)}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-1.5 pt-1.5 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => startEditPurchase(p)}
                        className="min-h-[34px] px-2.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg inline-flex items-center gap-1"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>{t.actions.edit}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleteTarget({ type: 'purchase', item: p });
                        }}
                        className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center text-rose-600 border border-rose-200 rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* VENDORS */}
      {effectiveSubtab === 'vendors' && (
        <div className="space-y-4">
          {showForm && (
            <form onSubmit={handleSaveVendor} className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl p-4 sm:p-5 space-y-4">
              <div className="text-sm font-semibold text-slate-900">
                {editingVendor
                  ? isBn
                    ? `সরবরাহকারী সম্পাদনা (${editingVendor.code})`
                    : `Edit Vendor (${editingVendor.code})`
                  : isBn
                    ? 'নতুন সরবরাহকারী'
                    : 'Add Vendor'}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <input type="text" required value={vName} onChange={(e) => setVName(e.target.value)} placeholder={isBn ? 'সরবরাহকারীর নাম *' : 'Vendor Name *'} className="h-10 sm:h-9 px-3 text-sm border border-slate-300 rounded-xl sm:rounded-lg" />
                <input type="text" value={vCompany} onChange={(e) => setVCompany(e.target.value)} placeholder={isBn ? 'প্রতিষ্ঠান' : 'Company'} className="h-10 sm:h-9 px-3 text-sm border border-slate-300 rounded-xl sm:rounded-lg" />
                <input type="text" value={vPhone} onChange={(e) => setVPhone(e.target.value)} placeholder={isBn ? 'ফোন' : 'Phone'} className="h-10 sm:h-9 px-3 text-sm border border-slate-300 rounded-xl sm:rounded-lg" />
                <input type="text" value={vBin} onChange={(e) => setVBin(e.target.value)} placeholder="BIN" className="h-10 sm:h-9 px-3 text-sm font-mono border border-slate-300 rounded-xl sm:rounded-lg" />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    resetForms();
                    setShowForm(false);
                  }}
                  className="min-h-[40px] px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-xl sm:rounded-lg"
                >
                  {t.actions.cancel}
                </button>
                <button type="submit" disabled={submitting} className="min-h-[40px] px-4 py-2 text-xs font-medium text-white bg-[#0F766E] rounded-xl sm:rounded-lg">
                  {t.actions.save}
                </button>
              </div>
            </form>
          )}
          <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl overflow-hidden">
            <div className="hidden md:block">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                    <th className="py-2.5 px-4 text-left font-medium">{t.labels.vendor}</th>
                    <th className="py-2.5 px-4 text-left font-medium">{isBn ? 'যোগাযোগ ও BIN' : 'Contact & BIN'}</th>
                    <th className="py-2.5 px-4 text-right font-medium">{isBn ? 'বকেয়া প্রদেয়' : 'Payable Balance'}</th>
                    <th className="py-2.5 px-4 text-right font-medium">{isBn ? 'অ্যাকশন' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.vendors.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{v.name}</div>
                        <div className="text-xs text-slate-500">{v.companyName || v.code}</div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        <div>{v.phone || '—'}</div>
                        {v.binNumber && <div className="font-mono text-[11px] text-slate-500">BIN {v.binNumber}</div>}
                      </td>
                      <td className={`py-3 px-4 text-right font-semibold text-slate-900 ${numClass}`}>
                        {money(v.payableBalance ?? 0)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => startEditVendor(v)}
                            aria-label={`Edit vendor ${v.name}`}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteError(null);
                              setDeleteTarget({ type: 'vendor', item: v });
                            }}
                            aria-label={`Delete vendor ${v.name}`}
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

            {/* Mobile Vendor Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {data.vendors.map((v) => (
                <div key={v.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">{v.name}</div>
                      <div className="text-xs text-slate-500 truncate">{v.companyName || v.code}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{v.phone || '—'}</div>
                    </div>
                    <div className={`text-right shrink-0 ${numClass}`}>
                      <div className="text-sm font-semibold text-slate-900">{money(v.payableBalance ?? 0)}</div>
                      <div className="text-[11px] text-slate-500">{isBn ? 'বকেয়া' : 'Payable'}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-1.5 pt-1.5 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => startEditVendor(v)}
                      className="min-h-[34px] px-2.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg inline-flex items-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>{t.actions.edit}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setDeleteTarget({ type: 'vendor', item: v });
                      }}
                      className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center text-rose-600 border border-rose-200 rounded-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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
        title={
          deleteTarget?.type === 'expense'
            ? isBn
              ? 'খরচ এন্ট্রি মুছে ফেলবেন?'
              : 'Delete Expense Entry?'
            : deleteTarget?.type === 'purchase'
              ? isBn
                ? 'ক্রয় বিল মুছে ফেলবেন?'
                : 'Delete Purchase Bill?'
              : isBn
                ? 'সরবরাহকারী মুছে ফেলবেন?'
                : 'Delete Vendor?'
        }
        itemLabel={
          deleteTarget?.type === 'expense'
            ? `${deleteTarget.item.expenseNumber} · ${deleteTarget.item.category} (${money(deleteTarget.item.totalAmount)})`
            : deleteTarget?.type === 'purchase'
              ? `${deleteTarget.item.billNumber} · ${deleteTarget.item.vendorName} (${money(deleteTarget.item.grandTotal)})`
              : deleteTarget?.item.name || ''
        }
        accountingNote={
          deleteTarget?.type === 'expense'
            ? isBn
              ? 'স্বয়ংক্রিয় ডাবল-এন্ট্রি রিভার্সাল: খরচের জার্নাল এন্ট্রি রিভার্স হয়ে ক্যাশ/ব্যাংক এবং লাভ-ক্ষতি ব্যালেন্স সমন্বিত হবে।'
              : 'Automatic double-entry reversal: reverses the expense journal so cash/bank and Profit & Loss stay balanced.'
            : deleteTarget?.type === 'purchase'
              ? isBn
                ? 'স্বয়ংক্রিয় ডাবল-এন্ট্রি রিভার্সাল: ক্রয় জার্নাল ও ইনপুট মূসক রিভার্স হবে এবং ক্রয়কৃত স্টক গুদাম থেকে সমন্বয় করা হবে।'
                : 'Automatic double-entry reversal: reverses the purchase & input VAT journal and deducts the purchased stock.'
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

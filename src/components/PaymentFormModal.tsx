import { useState } from 'react';
import { QrCode, X } from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import { formatMoney, todayISO } from '../engine/format';
import type { Branch, Customer, Invoice, Language, Organization, Payment, PaymentMethod } from '../engine/types';
import { apiRequest } from '../lib/api';
import { generateMfsCollectionRef, type MfsQrProvider } from '../lib/mfsQr';
import { MfsPaymentQrPanel } from './MfsPaymentQrPanel';

export interface RecordedPaymentSummary {
  amount: number;
  customerName: string;
  methodLabel: string;
  reference: string;
  isEdit: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onRecorded: (summary: RecordedPaymentSummary) => void;
  org: Organization;
  lang: Language;
  branches: Branch[];
  activeBranchId: number;
  customers: Customer[];
  prefillInvoice?: Invoice | null;
  editingPayment?: Payment | null;
}

const METHODS: { value: PaymentMethod; labelEn: string; labelBn: string; provider: string }[] = [
  { value: 'bkash', labelEn: 'bKash Merchant', labelBn: 'বিকাশ মার্চেন্ট', provider: 'bKash Gateway' },
  { value: 'nagad', labelEn: 'Nagad Merchant', labelBn: 'নগদ মার্চেন্ট', provider: 'Nagad Gateway' },
  { value: 'rocket', labelEn: 'Rocket Merchant (DBBL)', labelBn: 'রকেট মার্চেন্ট (ডাচ-বাংলা)', provider: 'DBBL Rocket Gateway' },
  { value: 'sslcommerz', labelEn: 'SSLCommerz Online', labelBn: 'এসএসএলকমার্জ অনলাইন', provider: 'SSLCommerz Checkout' },
  { value: 'bank', labelEn: 'Bank Transfer (BEFTN / NPSB)', labelBn: 'ব্যাংক ট্রান্সফার', provider: 'Prime Bank BEFTN' },
  { value: 'cash', labelEn: 'Cash Counter', labelBn: 'নগদ গ্রহণ', provider: 'Cash Drawer' },
  { value: 'card', labelEn: 'POS Card Terminal', labelBn: 'কার্ড টার্মিনাল', provider: 'Card POS' },
];

function isMfsQrProvider(m: PaymentMethod): m is MfsQrProvider {
  return m === 'bkash' || m === 'nagad' || m === 'rocket';
}

export function PaymentFormModal({
  open,
  onClose,
  onRecorded,
  org,
  lang,
  branches,
  activeBranchId,
  customers,
  prefillInvoice,
  editingPayment,
}: Props) {
  const isBn = lang === 'bn';
  const { notify } = useFeedback();
  const [customerId, setCustomerId] = useState<number>(
    editingPayment?.customerId ?? prefillInvoice?.customerId ?? customers[0]?.id ?? 0
  );
  const [branchId, setBranchId] = useState<number>(
    editingPayment?.branchId ?? prefillInvoice?.branchId ?? activeBranchId ?? branches[0]?.id ?? 1
  );
  const [amount, setAmount] = useState<string>(
    editingPayment ? String(editingPayment.amount) : prefillInvoice ? String(prefillInvoice.balanceDue) : ''
  );
  const [paymentDate, setPaymentDate] = useState<string>(editingPayment?.paymentDate ?? todayISO());
  const [method, setMethod] = useState<PaymentMethod>(editingPayment?.method ?? 'bkash');
  const [gatewayRef, setGatewayRef] = useState<string>(editingPayment?.gatewayReference ?? '');
  const [notes, setNotes] = useState<string>(editingPayment?.notes ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showQrPanel, setShowQrPanel] = useState(false);
  const [qrProvider, setQrProvider] = useState<MfsQrProvider>(() =>
    editingPayment?.method && isMfsQrProvider(editingPayment.method) ? editingPayment.method : 'bkash',
  );
  const [qrRef, setQrRef] = useState<string>(() =>
    generateMfsCollectionRef(
      editingPayment?.method && isMfsQrProvider(editingPayment.method) ? editingPayment.method : 'bkash',
      prefillInvoice?.invoiceNumber,
    ),
  );
  const [idempotencyKey] = useState(() => `pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  if (!open) return null;

  const selectedMethod = METHODS.find((m) => m.value === method) ?? METHODS[0];
  const selectedCustomer = customers.find((c) => c.id === customerId);
  const numericAmount = Number(amount);

  const handleMethodChange = (nextMethod: PaymentMethod) => {
    setMethod(nextMethod);
    if (isMfsQrProvider(nextMethod)) {
      setQrProvider(nextMethod);
      setQrRef(generateMfsCollectionRef(nextMethod, prefillInvoice?.invoiceNumber));
    }
  };

  const handleQrProviderChange = (nextProvider: MfsQrProvider) => {
    setQrProvider(nextProvider);
    setMethod(nextProvider);
    setQrRef(generateMfsCollectionRef(nextProvider, prefillInvoice?.invoiceNumber));
  };

  const handleToggleQrGenerator = () => {
    setError(null);
    if (showQrPanel) {
      setShowQrPanel(false);
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError(
        isBn
          ? 'ডাইনামিক QR কোড তৈরি করতে আগে সঠিক টাকার পরিমাণ লিখুন।'
          : 'Enter a valid payment amount greater than zero to generate a QR code.',
      );
      return;
    }
    const targetProvider: MfsQrProvider = isMfsQrProvider(method) ? method : qrProvider;
    setQrProvider(targetProvider);
    setMethod(targetProvider);
    const nextRef = generateMfsCollectionRef(targetProvider, prefillInvoice?.invoiceNumber);
    setQrRef(nextRef);
    setShowQrPanel(true);
    notify({
      title: isBn ? 'ডাইনামিক পেমেন্ট QR কোড তৈরি হয়েছে।' : 'Dynamic MFS QR code generated.',
      description: nextRef,
      variant: 'info',
      sound: 'export',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const numAmount = Number(amount);
    if (!customerId) {
      setError(isBn ? 'কাস্টমার নির্বাচন করুন।' : 'Please select a customer.');
      return;
    }
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      setError(isBn ? 'সঠিক টাকার পরিমাণ লিখুন।' : 'Enter a valid payment amount greater than zero.');
      return;
    }

    setSubmitting(true);
    try {
      const finalRef = gatewayRef.trim() || `${method.toUpperCase()}-${Date.now().toString().slice(-6)}`;
      if (editingPayment) {
        await apiRequest(`/api/payments/${editingPayment.id}`, {
          method: 'PUT',
          body: {
            branchId,
            paymentDate,
            amount: numAmount,
            method,
            gatewayProvider: selectedMethod.provider,
            gatewayReference: gatewayRef.trim() || null,
            notes,
          },
        });
      } else {
        await apiRequest('/api/payments', {
          method: 'POST',
          idempotencyKey,
          body: {
            customerId,
            branchId,
            paymentDate,
            amount: numAmount,
            method,
            gatewayProvider: selectedMethod.provider,
            gatewayReference: finalRef,
            invoiceId: prefillInvoice?.id ?? null,
            notes,
          },
        });
      }
      onRecorded({
        amount: numAmount,
        customerName: selectedCustomer?.name || prefillInvoice?.customerName || (isBn ? 'কাস্টমার' : 'Customer'),
        methodLabel: isBn ? selectedMethod.labelBn : selectedMethod.labelEn,
        reference: gatewayRef.trim() || finalRef,
        isEdit: Boolean(editingPayment),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save payment.';
      setError(msg);
      notify({ title: msg, variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/45 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={isBn ? 'পেমেন্ট গ্রহণ করুন' : 'Receive Payment'}
    >
      <form
        onSubmit={handleSubmit}
        className={`bg-white w-full ${showQrPanel ? 'sm:max-w-2xl' : 'sm:max-w-lg'} rounded-t-3xl sm:rounded-xl border border-slate-200 max-h-[92dvh] flex flex-col overflow-hidden transition-all`}
      >
        <div className="sm:hidden pt-2.5 pb-0.5 flex justify-center">
          <div className="w-10 h-1.5 bg-slate-300 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-200">
          <div className="min-w-0 pr-2">
            <h2 className="text-base font-semibold text-slate-900 truncate">
              {editingPayment
                ? isBn
                  ? `পেমেন্ট সম্পাদনা (${editingPayment.paymentNumber})`
                  : `Edit Payment (${editingPayment.paymentNumber})`
                : isBn
                  ? 'পেমেন্ট গ্রহণ ও সমন্বয়'
                  : 'Receive Payment & Settle'}
            </h2>
            {prefillInvoice && !editingPayment && (
              <p className="text-xs text-slate-500 mt-0.5 font-mono">
                {prefillInvoice.invoiceNumber} · {isBn ? 'বকেয়া' : 'Due'}:{' '}
                {formatMoney(prefillInvoice.balanceDue, lang, org.currencySymbol)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close payment dialog"
            className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:p-2 inline-flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl sm:rounded-lg shrink-0"
          >
            <X className="w-5 h-5 sm:w-4 sm:h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div role="alert" className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="pay-customer" className="block text-xs font-medium text-slate-700 mb-1">
              {isBn ? 'কাস্টমার *' : 'Customer *'}
            </label>
            <select
              id="pay-customer"
              value={customerId}
              disabled={Boolean(prefillInvoice || editingPayment)}
              onChange={(e) => setCustomerId(Number(e.target.value))}
              className="w-full h-10 px-3 text-sm bg-white border border-slate-300 rounded-lg disabled:bg-slate-50"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {isBn ? 'বকেয়া' : 'Due'}: {formatMoney(c.receivableBalance ?? 0, lang, org.currencySymbol)}
                </option>
              ))}
            </select>
            {selectedCustomer && !prefillInvoice && (
              <p className="text-[11px] text-slate-500 mt-1">
                {isBn
                  ? 'পুরনো বকেয়া ইনভয়েস থেকে ক্রমানুসারে (FIFO) স্বয়ংক্রিয়ভাবে সমন্বয় হবে।'
                  : 'Automatically allocates across oldest unpaid invoices (FIFO) and posts ledger journal.'}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pay-amount" className="block text-xs font-medium text-slate-700 mb-1">
                {isBn ? 'গ্রহণের পরিমাণ *' : 'Amount Received *'}
              </label>
              <input
                id="pay-amount"
                type="number"
                step="any"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                placeholder="0.00"
                className="w-full h-10 px-3 text-sm font-mono bg-white border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="pay-date" className="block text-xs font-medium text-slate-700 mb-1">
                {isBn ? 'তারিখ' : 'Payment Date'}
              </label>
              <input
                id="pay-date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                required
                className="w-full h-10 px-3 text-sm font-mono bg-white border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pay-method" className="block text-xs font-medium text-slate-700 mb-1">
                {isBn ? 'পেমেন্ট মাধ্যম / গেটওয়ে' : 'Payment Method / Gateway'}
              </label>
              <select
                id="pay-method"
                value={method}
                onChange={(e) => handleMethodChange(e.target.value as PaymentMethod)}
                className="w-full h-10 px-3 text-sm bg-white border border-slate-300 rounded-lg"
              >
                {METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {isBn ? m.labelBn : m.labelEn}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pay-branch" className="block text-xs font-medium text-slate-700 mb-1">
                {isBn ? 'শাখা' : 'Branch'}
              </label>
              <select
                id="pay-branch"
                value={branchId}
                onChange={(e) => setBranchId(Number(e.target.value))}
                className="w-full h-10 px-3 text-sm bg-white border border-slate-300 rounded-lg"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {isBn ? b.nameBn : b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Dynamic MFS QR Collection Bar & Expandable QR Panel */}
          {!showQrPanel ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900">
                  {isBn ? 'বিকাশ / নগদ / রকেট ডাইনামিক QR সংগ্রহ' : 'bKash / Nagad / Rocket Dynamic QR'}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {isBn
                    ? 'ইনভয়েসের মোট টাকার জন্য স্ক্যানযোগ্য QR তৈরি করে কাস্টমারকে দিন।'
                    : 'Generate a scannable QR code pre-loaded with the exact invoice total.'}
                </p>
              </div>
              <button
                type="button"
                data-testid="generate-qr-button"
                onClick={handleToggleQrGenerator}
                className="min-h-[40px] sm:min-h-[36px] px-3.5 py-2 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-[#0F766E] bg-white hover:bg-[#0F766E]/10 border border-[#0F766E]/30 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <QrCode className="w-4 h-4 shrink-0" />
                <span>{isBn ? 'QR কোড তৈরি করুন' : 'Generate QR Code'}</span>
              </button>
            </div>
          ) : (
            <MfsPaymentQrPanel
              provider={qrProvider}
              onProviderChange={handleQrProviderChange}
              amount={numericAmount}
              org={org}
              lang={lang}
              invoiceNumber={prefillInvoice?.invoiceNumber}
              customerName={selectedCustomer?.name}
              reference={qrRef}
              onRegenerateReference={() => setQrRef(generateMfsCollectionRef(qrProvider, prefillInvoice?.invoiceNumber))}
              onApplyReference={(ref) => setGatewayRef(ref)}
              onClose={() => setShowQrPanel(false)}
            />
          )}

          <div>
            <label htmlFor="pay-ref" className="block text-xs font-medium text-slate-700 mb-1">
              {isBn ? 'গেটওয়ে TrxID / চেক রেফারেন্স' : 'Gateway TrxID / Reference'}
            </label>
            <input
              id="pay-ref"
              type="text"
              value={gatewayRef}
              onChange={(e) => setGatewayRef(e.target.value)}
              placeholder={isBn ? 'যেমন: BKS9A821K4 বা SSLCZ-8821' : 'e.g. BKS9A821K4 or SSLCZ-8821'}
              className="w-full h-10 px-3 text-sm font-mono bg-white border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="pay-notes" className="block text-xs font-medium text-slate-700 mb-1">
              {isBn ? 'নোট' : 'Notes'}
            </label>
            <input
              id="pay-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full h-10 px-3 text-sm bg-white border border-slate-300 rounded-lg"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 px-4 sm:px-5 py-3.5 pb-safe border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] sm:min-h-0 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200/70 rounded-xl sm:rounded-lg whitespace-nowrap"
          >
            {isBn ? 'বাতিল' : 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 sm:flex-none min-h-[44px] sm:min-h-0 px-5 py-2 text-sm font-semibold text-white bg-[#0F766E] hover:bg-[#115E59] active:scale-[0.98] disabled:opacity-50 rounded-xl sm:rounded-lg whitespace-nowrap transition-all"
          >
            {submitting
              ? isBn
                ? 'সমন্বয় হচ্ছে...'
                : 'Saving...'
              : editingPayment
                ? isBn
                  ? 'পরিবর্তন সংরক্ষণ করুন'
                  : 'Save Payment Changes'
                : isBn
                  ? 'পেমেন্ট নিশ্চিত করুন'
                  : 'Confirm Payment'}
          </button>
        </div>
      </form>
    </div>
  );
}

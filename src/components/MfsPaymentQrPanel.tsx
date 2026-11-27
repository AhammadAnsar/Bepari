import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download, QrCode, RefreshCw, X } from 'lucide-react';
import QRCode from 'qrcode';
import { formatMoney } from '../engine/format';
import type { Language, Organization } from '../engine/types';
import {
  buildMfsPaymentQrPayload,
  formatShareablePaymentText,
  isValidBdMfsNumber,
  MFS_QR_PROVIDERS,
  normalizeBdMfsNumber,
  type MfsQrProvider,
} from '../lib/mfsQr';

interface Props {
  provider: MfsQrProvider;
  onProviderChange: (provider: MfsQrProvider) => void;
  amount: number;
  org: Organization;
  lang: Language;
  invoiceNumber?: string;
  customerName?: string;
  reference: string;
  onRegenerateReference: () => void;
  onApplyReference: (ref: string) => void;
  onClose: () => void;
}

const PROVIDER_LIST: MfsQrProvider[] = ['bkash', 'nagad', 'rocket'];

function getSavedWallet(provider: MfsQrProvider, fallbackPhone: string): string {
  try {
    const saved = window.localStorage.getItem(`bepari_mfs_wallet_${provider}`);
    if (saved && saved.trim()) return saved.trim();
  } catch {
    // Ignore storage errors in restricted environments
  }
  return normalizeBdMfsNumber(fallbackPhone, provider);
}

export function MfsPaymentQrPanel({
  provider,
  onProviderChange,
  amount,
  org,
  lang,
  invoiceNumber,
  customerName,
  reference,
  onRegenerateReference,
  onApplyReference,
  onClose,
}: Props) {
  const isBn = lang === 'bn';
  const meta = MFS_QR_PROVIDERS[provider];
  const [wallets, setWallets] = useState<Record<MfsQrProvider, string>>(() => ({
    bkash: getSavedWallet('bkash', org.phone),
    nagad: getSavedWallet('nagad', org.phone),
    rocket: getSavedWallet('rocket', org.phone),
  }));
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [appliedRef, setAppliedRef] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const activeWalletRaw = wallets[provider];
  const normalizedWallet = normalizeBdMfsNumber(activeWalletRaw, provider);
  const walletValid = isValidBdMfsNumber(normalizedWallet, provider);

  const handleWalletChange = (value: string) => {
    setWallets((prev) => ({ ...prev, [provider]: value }));
    const cleaned = normalizeBdMfsNumber(value, provider);
    if (isValidBdMfsNumber(cleaned, provider)) {
      try {
        window.localStorage.setItem(`bepari_mfs_wallet_${provider}`, cleaned);
      } catch {
        // Ignore storage restrictions
      }
    }
  };

  const qrResult = useMemo(() => {
    if (!Number.isFinite(amount) || amount <= 0 || !walletValid) return null;
    try {
      return buildMfsPaymentQrPayload({
        provider,
        merchantWallet: normalizedWallet,
        merchantName: org.name,
        merchantCity: 'Dhaka',
        amount,
        invoiceNumber,
        reference,
        customerName,
      });
    } catch {
      return null;
    }
  }, [provider, normalizedWallet, walletValid, org.name, amount, invoiceNumber, reference, customerName]);

  useEffect(() => {
    let active = true;
    if (!qrResult) {
      setQrDataUrl('');
      return;
    }
    QRCode.toDataURL(qrResult.payload, {
      width: 360,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0F172A',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [qrResult]);

  const handleCopyDetails = async () => {
    if (!qrResult) return;
    const text = formatShareablePaymentText(
      qrResult,
      isBn ? org.nameBn || org.name : org.name,
      org.currencySymbol,
      lang,
    );
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard denied silently
    }
  };

  const handleApplyRef = () => {
    if (!qrResult) return;
    onApplyReference(qrResult.reference);
    setAppliedRef(true);
    window.setTimeout(() => setAppliedRef(false), 1800);
  };

  const handleDownloadPng = async () => {
    if (!qrResult || !qrDataUrl) return;
    setDownloading(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 820;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // White card surface
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Provider brand top band
      ctx.fillStyle = meta.brandHex;
      ctx.fillRect(0, 0, canvas.width, 96);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '700 28px "IBM Plex Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${meta.labelEn} Merchant Payment QR`, canvas.width / 2, 48);
      ctx.font = '500 15px "IBM Plex Sans", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.fillText('BanglaQR / EMVCo Dynamic Collection', canvas.width / 2, 74);

      // Organization Name
      ctx.fillStyle = '#0F172A';
      ctx.font = '700 22px "IBM Plex Sans", sans-serif';
      ctx.fillText(org.name.slice(0, 40), canvas.width / 2, 144);

      // Draw crisp QR image
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('QR image load failed'));
        img.src = qrDataUrl;
      });
      const qrSize = 360;
      const qrX = (canvas.width - qrSize) / 2;
      const qrY = 172;
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 2;
      ctx.strokeRect(qrX - 12, qrY - 12, qrSize + 24, qrSize + 24);
      ctx.drawImage(img, qrX, qrY, qrSize, qrSize);

      // Payable Amount
      ctx.fillStyle = '#475569';
      ctx.font = '600 14px "IBM Plex Sans", sans-serif';
      ctx.fillText('PAYABLE AMOUNT', canvas.width / 2, 585);
      ctx.fillStyle = '#0F172A';
      ctx.font = '700 36px "IBM Plex Mono", monospace';
      ctx.fillText(`BDT ${qrResult.formattedAmount}`, canvas.width / 2, 628);

      // Wallet & Reference details
      ctx.fillStyle = '#334155';
      ctx.font = '600 18px "IBM Plex Mono", monospace';
      ctx.fillText(`Merchant: ${qrResult.formattedWallet}`, canvas.width / 2, 676);

      ctx.fillStyle = '#64748B';
      ctx.font = '500 15px "IBM Plex Mono", monospace';
      const refLine =
        qrResult.invoiceNumber !== 'DIRECT'
          ? `${qrResult.invoiceNumber}  ·  ${qrResult.reference}`
          : `Ref: ${qrResult.reference}`;
      ctx.fillText(refLine, canvas.width / 2, 710);

      // Quiet footer
      ctx.fillStyle = '#94A3B8';
      ctx.font = '500 13px "IBM Plex Sans", sans-serif';
      ctx.fillText('Generated by Bepari — Invoicing & Accounting Suite', canvas.width / 2, 782);

      const link = document.createElement('a');
      const safeInv = (invoiceNumber || 'payment').replace(/[^A-Za-z0-9_-]/g, '');
      link.download = `bepari-${provider}-qr-${safeInv}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section
      data-testid="mfs-qr-panel"
      aria-label={isBn ? 'ডাইনামিক এমএফএস পেমেন্ট QR কোড' : 'Dynamic MFS Payment QR Code'}
      className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3.5"
    >
      {/* Header Row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <QrCode className="w-4 h-4 text-[#0F766E] shrink-0" />
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-slate-900 truncate">
              {isBn ? 'ডাইনামিক ডিজিটাল পেমেন্ট QR কোড' : 'Dynamic MFS Collection QR Code'}
            </h3>
            <p className="text-[11px] text-slate-500 truncate">
              {isBn ? 'বিকাশ, নগদ বা রকেট অ্যাপ দিয়ে স্ক্যান করে তাৎক্ষণিক পরিশোধ' : 'Scan via bKash, Nagad, or Rocket app with exact amount pre-filled'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={isBn ? 'QR প্যানেল বন্ধ করুন' : 'Hide QR panel'}
          className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 rounded-lg transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Interactive Provider Segmented Selector */}
      <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-200/70 rounded-lg" role="tablist" aria-label="MFS QR Provider">
        {PROVIDER_LIST.map((id) => {
          const item = MFS_QR_PROVIDERS[id];
          const active = provider === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`qr-provider-${id}`}
              onClick={() => onProviderChange(id)}
              className={`min-h-[38px] px-2.5 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
                active
                  ? `bg-white ${item.textClass} shadow-xs`
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isBn ? item.labelBn : item.labelEn}
            </button>
          );
        })}
      </div>

      {/* Merchant Wallet Input */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
        <div className="sm:col-span-8">
          <label htmlFor="mfs-merchant-wallet" className="block text-[11px] font-medium text-slate-600 mb-1">
            {isBn
              ? `${meta.labelBn} মার্চেন্ট / ওয়ালেট নম্বর`
              : `${meta.labelEn} Merchant Wallet Number`}
          </label>
          <input
            id="mfs-merchant-wallet"
            type="tel"
            value={activeWalletRaw}
            onChange={(e) => handleWalletChange(e.target.value)}
            placeholder={provider === 'rocket' ? '017XXXXXXXX9' : '017XXXXXXXX'}
            className={`w-full h-9 px-3 text-xs font-mono bg-white border rounded-lg focus:outline-none ${
              walletValid
                ? 'border-slate-300 focus:border-[#0F766E]'
                : 'border-rose-400 focus:border-rose-500'
            }`}
          />
        </div>
        <div className="sm:col-span-4">
          <button
            type="button"
            onClick={onRegenerateReference}
            className="w-full h-9 px-3 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {isBn ? 'নতুন রেফারেন্স' : 'New Ref'}
          </button>
        </div>
      </div>

      {!walletValid && (
        <div role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {isBn
            ? 'সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX; রকেটের ক্ষেত্রে ১১ বা ১২ সংখ্যা)।'
            : 'Enter a valid 11-digit Bangladesh mobile number (e.g. 017XXXXXXXX; 11 or 12 digits for Rocket).'}
        </div>
      )}

      {walletValid && (!Number.isFinite(amount) || amount <= 0) && (
        <div role="alert" className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {isBn
            ? 'ডাইনামিক QR কোড তৈরি করতে উপরে শূন্যের চেয়ে বড় টাকার পরিমাণ লিখুন।'
            : 'Enter an amount greater than zero above to generate the dynamic QR code.'}
        </div>
      )}

      {/* QR Stage + Structured Collection Details */}
      {qrResult && qrDataUrl && (
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center pt-1">
          <div className="sm:col-span-5 flex justify-center">
            <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col items-center gap-2">
              <div className={`text-[11px] font-semibold tracking-tight ${meta.textClass}`}>
                {isBn ? `${meta.labelBn} মার্চেন্ট পে` : `${meta.labelEn} Merchant Pay`}
              </div>
              <img
                src={qrDataUrl}
                alt={`${meta.labelEn} dynamic payment QR for ${qrResult.formattedAmount} BDT`}
                data-testid="mfs-qr-image"
                className="w-[156px] h-[156px] block"
              />
              <div className="text-[10px] font-mono text-slate-500">
                CRC {qrResult.crc} · BDT
              </div>
            </div>
          </div>

          <div className="sm:col-span-7 space-y-2.5 min-w-0">
            <div>
              <div className="text-[11px] text-slate-500">
                {isBn ? 'পরিশোধযোগ্য পরিমাণ' : 'Dynamic Payable Total'}
              </div>
              <div className="text-xl font-bold text-slate-900 font-mono tabular-nums tracking-tight">
                {formatMoney(qrResult.amount, lang, org.currencySymbol)}
              </div>
            </div>

            <div className="space-y-1 text-xs text-slate-600 border-t border-slate-200/80 pt-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">{isBn ? 'মার্চেন্ট' : 'Merchant'}</span>
                <span className="font-medium text-slate-900 truncate">
                  {isBn ? org.nameBn || org.name : org.name}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">{isBn ? 'ওয়ালেট নম্বর' : 'Wallet No.'}</span>
                <span className="font-mono font-medium text-slate-900">{qrResult.formattedWallet}</span>
              </div>
              {qrResult.invoiceNumber !== 'DIRECT' && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">{isBn ? 'ইনভয়েস' : 'Invoice'}</span>
                  <span className="font-mono font-medium text-slate-900">{qrResult.invoiceNumber}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">{isBn ? 'রেফারেন্স' : 'Reference'}</span>
                <span className="font-mono font-medium text-slate-900">{qrResult.reference}</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              {isBn ? meta.hintBn : meta.hintEn}
            </p>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {qrResult && qrDataUrl && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/80">
          <button
            type="button"
            disabled={downloading}
            onClick={handleDownloadPng}
            data-testid="qr-download-png"
            className="min-h-[38px] px-3 py-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            {isBn ? 'QR কার্ড ডাউনলোড (PNG)' : 'Download QR PNG'}
          </button>
          <button
            type="button"
            onClick={handleCopyDetails}
            data-testid="qr-copy-details"
            className="min-h-[38px] px-3 py-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors whitespace-nowrap"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied
              ? isBn
                ? 'কপি হয়েছে'
                : 'Copied'
              : isBn
                ? 'পেমেন্ট তথ্য কপি'
                : 'Copy Request'}
          </button>
          <button
            type="button"
            onClick={handleApplyRef}
            data-testid="qr-apply-ref"
            className="min-h-[38px] px-3 py-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-[#0F766E] bg-[#0F766E]/10 hover:bg-[#0F766E]/15 rounded-lg transition-colors whitespace-nowrap"
          >
            {appliedRef ? <Check className="w-3.5 h-3.5" /> : null}
            {appliedRef
              ? isBn
                ? 'রেফারেন্স বসানো হয়েছে'
                : 'Reference Applied'
              : isBn
                ? 'রেফারেন্স TrxID-তে বসান'
                : 'Use Ref in TrxID'}
          </button>
        </div>
      )}
    </section>
  );
}

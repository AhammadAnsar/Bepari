import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react';
import type { Language } from '../engine/types';

interface Props {
  open: boolean;
  lang: Language;
  title: string;
  itemLabel: string;
  description?: string;
  accountingNote?: string;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDeleteModal({
  open,
  lang,
  title,
  itemLabel,
  description,
  accountingNote,
  busy = false,
  error = null,
  onCancel,
  onConfirm,
}: Props) {
  const isBn = lang === 'bn';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-testid="confirm-delete-modal"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-delete-title"
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-slate-950/50 backdrop-blur-[2px] p-0 sm:p-4"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white border border-slate-200 rounded-t-3xl sm:rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="sm:hidden pt-2.5 pb-0.5 flex justify-center">
          <div className="w-10 h-1.5 bg-slate-300 rounded-full" />
        </div>

        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-rose-50 border border-rose-200/80 flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
            </div>
            <div className="min-w-0">
              <h2 id="confirm-delete-title" className="text-sm font-semibold text-slate-900">
                {title}
              </h2>
              <p className="text-xs font-medium text-slate-700 mt-0.5 truncate">{itemLabel}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            aria-label={isBn ? 'বন্ধ করুন' : 'Close'}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {description && <p className="text-xs text-slate-600 leading-relaxed">{description}</p>}

          {accountingNote && (
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-relaxed">
              {accountingNote}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 leading-relaxed"
            >
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 pb-safe bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="min-h-[40px] sm:min-h-0 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl sm:rounded-lg transition-colors whitespace-nowrap"
          >
            {isBn ? 'বাতিল' : 'Cancel'}
          </button>
          <button
            type="button"
            data-testid="confirm-delete-submit"
            disabled={busy}
            onClick={onConfirm}
            className="min-h-[40px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60 rounded-xl sm:rounded-lg transition-colors whitespace-nowrap"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            <span>{busy ? (isBn ? 'মুছে ফেলা হচ্ছে...' : 'Deleting...') : isBn ? 'নিশ্চিত হয়ে মুছুন' : 'Confirm Delete'}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

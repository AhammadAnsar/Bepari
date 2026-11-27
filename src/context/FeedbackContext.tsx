import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
} from 'lucide-react';
import {
  playFeedbackSound,
  readSoundPreference,
  writeSoundPreference,
  type FeedbackSoundKind,
} from '../lib/soundEngine';

export type ToastVariant = 'success' | 'info' | 'warning' | 'error';

export interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
  sound?: FeedbackSoundKind | false;
  durationMs?: number;
}

export interface RichConfirmationInput {
  title: string;
  subtitle?: string;
  refLabel?: string;
  refValue?: string;
  customerName?: string;
  amountLabel?: string;
  amountValue?: string;
  sound?: FeedbackSoundKind | false;
  durationMs?: number;
  primaryAction?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
}

interface ToastItem extends ToastInput {
  id: number;
  variant: ToastVariant;
}

interface RichConfirmationItem extends RichConfirmationInput {
  id: number;
}

interface FeedbackContextValue {
  soundEnabled: boolean;
  toggleSound: () => void;
  playSound: (kind: FeedbackSoundKind) => void;
  notify: (input: ToastInput) => void;
  celebrate: (input: RichConfirmationInput) => void;
  dismissRichConfirmation: () => void;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

const DEFAULT_SOUND_BY_VARIANT: Record<ToastVariant, FeedbackSoundKind> = {
  success: 'save',
  info: 'export',
  warning: 'warning',
  error: 'error',
};

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => readSoundPreference());
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [richCard, setRichCard] = useState<RichConfirmationItem | null>(null);
  const nextIdRef = useRef(1);
  const timersRef = useRef<Map<number, number>>(new Map());
  const richTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => window.clearTimeout(t));
      timersRef.current.clear();
      if (richTimerRef.current !== null) {
        window.clearTimeout(richTimerRef.current);
      }
    };
  }, []);

  const dismissToast = useCallback((id: number) => {
    const t = timersRef.current.get(id);
    if (t !== undefined) {
      window.clearTimeout(t);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const dismissRichConfirmation = useCallback(() => {
    if (richTimerRef.current !== null) {
      window.clearTimeout(richTimerRef.current);
      richTimerRef.current = null;
    }
    setRichCard(null);
  }, []);

  const playSound = useCallback((kind: FeedbackSoundKind) => {
    playFeedbackSound(kind, soundEnabledRef.current);
  }, []);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      soundEnabledRef.current = next;
      writeSoundPreference(next);
      if (next) {
        playFeedbackSound('toggle', true);
      }
      return next;
    });
  }, []);

  const notify = useCallback(
    (input: ToastInput) => {
      const variant: ToastVariant = input.variant ?? 'success';
      const soundKind = input.sound === undefined ? DEFAULT_SOUND_BY_VARIANT[variant] : input.sound;
      if (soundKind) {
        playFeedbackSound(soundKind, soundEnabledRef.current);
      }

      const id = nextIdRef.current++;
      const durationMs = input.durationMs ?? (variant === 'error' ? 5200 : 3600);
      setToasts((prev) => [...prev.slice(-2), { ...input, id, variant }]);

      const timer = window.setTimeout(() => {
        dismissToast(id);
      }, durationMs);
      timersRef.current.set(id, timer);
    },
    [dismissToast]
  );

  const celebrate = useCallback(
    (input: RichConfirmationInput) => {
      const soundKind = input.sound === undefined ? 'sale' : input.sound;
      if (soundKind) {
        playFeedbackSound(soundKind, soundEnabledRef.current);
      }

      if (richTimerRef.current !== null) {
        window.clearTimeout(richTimerRef.current);
      }
      const id = nextIdRef.current++;
      setRichCard({ ...input, id });

      const durationMs = input.durationMs ?? 7000;
      richTimerRef.current = window.setTimeout(() => {
        setRichCard((current) => (current?.id === id ? null : current));
        richTimerRef.current = null;
      }, durationMs);
    },
    []
  );

  const value = useMemo<FeedbackContextValue>(
    () => ({
      soundEnabled,
      toggleSound,
      playSound,
      notify,
      celebrate,
      dismissRichConfirmation,
    }),
    [soundEnabled, toggleSound, playSound, notify, celebrate, dismissRichConfirmation]
  );

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      {/* Floating Feedback Stack (Desktop: bottom-right, Mobile: above bottom nav — never blocks header or modal toolbars) */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed z-[90] bottom-[72px] sm:bottom-5 right-4 left-4 sm:left-auto sm:w-[376px] pointer-events-none flex flex-col-reverse gap-2.5"
      >
        {/* Rich Transaction Confirmation Card */}
        {richCard && (
          <div
            role="status"
            data-testid="rich-confirmation-card"
            className="pointer-events-auto bg-white border border-emerald-200 rounded-xl shadow-[0_14px_34px_-12px_rgba(15,23,42,0.22)] overflow-hidden transition-all duration-200"
          >
            <div className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200/80 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 className="w-4.5 h-4.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 leading-snug">
                      {richCard.title}
                    </div>
                    {richCard.subtitle && (
                      <div className="text-xs text-slate-500 mt-0.5 leading-snug">
                        {richCard.subtitle}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={dismissRichConfirmation}
                  aria-label="Dismiss confirmation"
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-lg transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {(richCard.refValue || richCard.customerName || richCard.amountValue) && (
                <div className="bg-slate-50 border border-slate-200/80 rounded-lg px-3 py-2.5 space-y-1.5 text-xs">
                  {richCard.customerName && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500 truncate">{richCard.customerName}</span>
                      {richCard.refValue && (
                        <span className="font-mono font-semibold text-slate-800 shrink-0 tabular-nums">
                          {richCard.refLabel ? `${richCard.refLabel}: ` : ''}
                          {richCard.refValue}
                        </span>
                      )}
                    </div>
                  )}
                  {!richCard.customerName && richCard.refValue && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">{richCard.refLabel || 'Ref'}</span>
                      <span className="font-mono font-semibold text-slate-800 tabular-nums">
                        {richCard.refValue}
                      </span>
                    </div>
                  )}
                  {richCard.amountValue && (
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/70">
                      <span className="text-slate-600 font-medium">{richCard.amountLabel || 'মোট'}</span>
                      <span className="text-sm font-bold font-mono text-[#0F766E] tabular-nums">
                        {richCard.amountValue}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {(richCard.primaryAction || richCard.secondaryAction) && (
                <div className="flex items-center gap-2 pt-0.5">
                  {richCard.primaryAction && (
                    <button
                      type="button"
                      onClick={() => {
                        richCard.primaryAction?.onClick();
                        dismissRichConfirmation();
                      }}
                      className="flex-1 px-3 py-1.5 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#115E59] rounded-lg transition-colors whitespace-nowrap"
                    >
                      {richCard.primaryAction.label}
                    </button>
                  )}
                  {richCard.secondaryAction && (
                    <button
                      type="button"
                      onClick={() => {
                        richCard.secondaryAction?.onClick();
                        dismissRichConfirmation();
                      }}
                      className="flex-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                    >
                      {richCard.secondaryAction.label}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Smart Floating Toasts */}
        {toasts.map((toast) => {
          const Icon =
            toast.variant === 'error'
              ? XCircle
              : toast.variant === 'warning'
                ? AlertTriangle
                : toast.variant === 'info'
                  ? Info
                  : CheckCircle2;
          const iconStyles =
            toast.variant === 'error'
              ? 'text-rose-600 bg-rose-50 border-rose-200/80'
              : toast.variant === 'warning'
                ? 'text-amber-600 bg-amber-50 border-amber-200/80'
                : toast.variant === 'info'
                  ? 'text-sky-600 bg-sky-50 border-sky-200/80'
                  : 'text-emerald-600 bg-emerald-50 border-emerald-200/80';
          const borderStyle =
            toast.variant === 'error'
              ? 'border-rose-200'
              : toast.variant === 'warning'
                ? 'border-amber-200'
                : 'border-slate-200';

          return (
            <div
              key={toast.id}
              role={toast.variant === 'error' ? 'alert' : 'status'}
              data-testid={`feedback-toast-${toast.variant}`}
              className={`pointer-events-auto bg-white border ${borderStyle} rounded-xl shadow-[0_10px_28px_-12px_rgba(15,23,42,0.2)] px-3.5 py-3 flex items-start gap-2.5 transition-all duration-200`}
            >
              <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${iconStyles}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-900 leading-snug">
                  {toast.title}
                </div>
                {toast.description && (
                  <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    {toast.description}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Close notification"
                className="p-1 text-slate-400 hover:text-slate-700 rounded-md transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    return {
      soundEnabled: true,
      toggleSound: () => {},
      playSound: () => {},
      notify: () => {},
      celebrate: () => {},
      dismissRichConfirmation: () => {},
    };
  }
  return ctx;
}

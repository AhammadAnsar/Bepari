import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, CheckCheck, FileSpreadsheet, Package, RotateCcw, Wallet, X } from 'lucide-react';
import { formatNumber } from '../engine/format';
import type { Invoice, Language, Product } from '../engine/types';
import type { WorkspacePayload } from '../lib/api';
import {
  buildNotifications,
  countUnreadNotifications,
  filterNotifications,
  getNotificationText,
  type NotificationCategory,
  type NotificationItem,
} from '../lib/notifications';

interface Props {
  workspace: WorkspacePayload;
  lang: Language;
  onReceivePayment: (invoice: Invoice) => void;
  onViewProduct: (product: Product) => void;
  onNavigate: (section: string, subtab?: string) => void;
}

const STORAGE_KEY = 'bepari_notification_state_v1';

interface StoredNotifState {
  read: string[];
  dismissed: string[];
}

function loadStoredState(): StoredNotifState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { read: [], dismissed: [] };
    const parsed = JSON.parse(raw) as Partial<StoredNotifState>;
    return {
      read: Array.isArray(parsed.read) ? parsed.read.filter((x): x is string => typeof x === 'string') : [],
      dismissed: Array.isArray(parsed.dismissed) ? parsed.dismissed.filter((x): x is string => typeof x === 'string') : [],
    };
  } catch {
    return { read: [], dismissed: [] };
  }
}

export function NotificationCenter({
  workspace,
  lang,
  onReceivePayment,
  onViewProduct,
  onNavigate,
}: Props) {
  const isBn = lang === 'bn';

  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<'all' | NotificationCategory>('all');
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set(loadStoredState().read));
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set(loadStoredState().dismissed));

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const desktopPanelRef = useRef<HTMLDivElement | null>(null);

  const notifications = useMemo(() => buildNotifications(workspace), [workspace]);

  const visibleItems = useMemo(
    () => filterNotifications(notifications, category, dismissedIds),
    [notifications, category, dismissedIds],
  );

  const activeCount = useMemo(
    () => notifications.filter((n) => !dismissedIds.has(n.id)).length,
    [notifications, dismissedIds],
  );

  const unreadCount = useMemo(
    () => countUnreadNotifications(notifications, readIds, dismissedIds),
    [notifications, readIds, dismissedIds],
  );

  const categoryCounts = useMemo(() => {
    const active = notifications.filter((n) => !dismissedIds.has(n.id));
    return {
      all: active.length,
      inventory: active.filter((n) => n.category === 'inventory').length,
      payment: active.filter((n) => n.category === 'payment').length,
      mushak: active.filter((n) => n.category === 'mushak').length,
    };
  }, [notifications, dismissedIds]);

  useEffect(() => {
    try {
      const payload: StoredNotifState = {
        read: Array.from(readIds),
        dismissed: Array.from(dismissedIds),
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors
    }
  }, [readIds, dismissedIds]);

  // Close on Escape or outside click (desktop)
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (desktopPanelRef.current?.contains(target)) return;
      if (window.innerWidth >= 640) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [open]);

  const markRead = (id: string) => {
    setReadIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const markAllRead = () => {
    setReadIds((prev) => {
      const next = new Set(prev);
      for (const item of notifications) {
        if (!dismissedIds.has(item.id)) next.add(item.id);
      }
      return next;
    });
  };

  const dismissItem = (id: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const restoreDismissed = () => {
    setDismissedIds(new Set());
  };

  const handleAction = (item: NotificationItem) => {
    markRead(item.id);
    setOpen(false);
    if (item.category === 'payment' && item.invoice) {
      onReceivePayment(item.invoice);
    } else if (item.category === 'inventory' && item.product) {
      onViewProduct(item.product);
    } else {
      onNavigate(item.targetSection, item.targetSubtab);
    }
  };

  const getCategoryIcon = (cat: NotificationCategory) => {
    if (cat === 'inventory') return Package;
    if (cat === 'payment') return Wallet;
    return FileSpreadsheet;
  };

  const filterTabs: { id: 'all' | NotificationCategory; label: string; count: number }[] = [
    { id: 'all', label: isBn ? 'সব' : 'All', count: categoryCounts.all },
    { id: 'inventory', label: isBn ? 'কম স্টক' : 'Low Stock', count: categoryCounts.inventory },
    { id: 'payment', label: isBn ? 'বকেয়া পেমেন্ট' : 'Payments', count: categoryCounts.payment },
    { id: 'mushak', label: isBn ? 'মূসক সময়সীমা' : 'Mushak', count: categoryCounts.mushak },
  ];

  const panelBody = (
    <>
      {/* Panel Header */}
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900 truncate">
            {isBn ? 'নোটিফিকেশন সেন্টার' : 'Notification Center'}
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {unreadCount > 0
              ? isBn
                ? `${formatNumber(unreadCount, 'bn')}টি অপঠিত সতর্কতা`
                : `${unreadCount} unread alert${unreadCount === 1 ? '' : 's'}`
              : isBn
                ? 'সব সতর্কতা পড়া হয়েছে'
                : 'All caught up'}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-[#0F766E] hover:bg-[#0F766E]/10 rounded-lg transition-colors whitespace-nowrap"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              {isBn ? 'সব পঠিত' : 'Mark all read'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close notifications"
            className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Category Filter Tabs (Wrapped, Zero Horizontal Scrollbar) */}
      <div className="px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/70 flex flex-wrap items-center gap-1.5">
        {filterTabs.map((tab) => {
          const active = category === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCategory(tab.id)}
              className={`px-2.5 py-1.5 text-[11px] font-medium rounded-lg transition-colors whitespace-nowrap ${
                active
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {tab.label}{' '}
              <span className={`font-mono ${active ? 'text-slate-300' : 'text-slate-400'}`}>
                {formatNumber(tab.count, lang)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Notification Items List */}
      <div className="divide-y divide-slate-100 overflow-y-auto max-h-[58vh] sm:max-h-[420px]">
        {visibleItems.length === 0 ? (
          <div className="px-5 py-8 text-center space-y-2">
            <div className="text-xs font-medium text-slate-700">
              {isBn ? 'এই বিভাগে কোনো সতর্কতা নেই' : 'No alerts in this category'}
            </div>
            <p className="text-[11px] text-slate-500">
              {isBn
                ? 'স্টক, বকেয়া পেমেন্ট এবং মূসক দাখিলের অবস্থা স্বাভাবিক রয়েছে।'
                : 'Inventory levels, customer payments, and Mushak deadlines are all on track.'}
            </p>
            {dismissedIds.size > 0 && activeCount < notifications.length && (
              <button
                type="button"
                onClick={restoreDismissed}
                className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 text-xs font-medium text-[#0F766E] hover:bg-[#0F766E]/10 rounded-lg"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {isBn ? 'বন্ধ করা সতর্কতা ফিরিয়ে আনুন' : 'Restore dismissed alerts'}
              </button>
            )}
          </div>
        ) : (
          visibleItems.map((item) => {
            const Icon = getCategoryIcon(item.category);
            const isRead = readIds.has(item.id);
            const text = getNotificationText(item, lang);
            const severityBar =
              item.severity === 'critical'
                ? 'bg-rose-600'
                : item.severity === 'warning'
                  ? 'bg-amber-500'
                  : 'bg-[#0F766E]';
            const severityMetaText =
              item.severity === 'critical'
                ? 'text-rose-700'
                : item.severity === 'warning'
                  ? 'text-amber-700'
                  : 'text-[#0F766E]';

            return (
              <div
                key={item.id}
                onClick={() => markRead(item.id)}
                className={`relative pl-4 pr-3.5 py-3 transition-colors ${
                  isRead ? 'bg-white' : 'bg-[#0F766E]/[0.03]'
                } hover:bg-slate-50`}
              >
                <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${severityBar}`} aria-hidden="true" />
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 shrink-0">
                    <Icon className={`w-4 h-4 ${severityMetaText}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className={`text-xs leading-snug ${isRead ? 'font-medium text-slate-700' : 'font-semibold text-slate-900'}`}>
                        {text.title}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          dismissItem(item.id);
                        }}
                        aria-label={`Dismiss ${text.title}`}
                        className="p-0.5 text-slate-400 hover:text-slate-700 rounded shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                      {text.detail}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className={`text-[11px] font-medium tabular-nums ${severityMetaText}`}>
                        {text.meta}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAction(item);
                        }}
                        className="px-2.5 py-1 text-[11px] font-semibold text-[#0F766E] bg-[#0F766E]/10 hover:bg-[#0F766E]/15 rounded-md transition-colors whitespace-nowrap"
                      >
                        {text.actionLabel}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      {dismissedIds.size > 0 && visibleItems.length > 0 && (
        <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            {isBn ? `${formatNumber(dismissedIds.size, 'bn')}টি সতর্কতা লুকানো আছে` : `${dismissedIds.size} dismissed`}
          </span>
          <button
            type="button"
            onClick={restoreDismissed}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0F766E] hover:underline"
          >
            <RotateCcw className="w-3 h-3" />
            {isBn ? 'ফিরিয়ে আনুন' : 'Restore'}
          </button>
        </div>
      )}
    </>
  );

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open notification center"
        aria-expanded={open}
        className={`relative min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl transition-all active:scale-95 ${
          open
            ? 'bg-[#0F766E]/10 text-[#0F766E]'
            : 'text-slate-700 hover:bg-slate-100 active:bg-slate-100'
        }`}
      >
        <Bell className="w-[19px] h-[19px]" strokeWidth={2} />
        {unreadCount > 0 && (
          <span
            aria-label={`${unreadCount} unread notifications`}
            className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 inline-flex items-center justify-center text-[10px] font-mono font-semibold text-white bg-rose-600 rounded-full leading-none ring-2 ring-white"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Desktop Dropdown Panel (Portaled to document.body to stay above frosted sticky header) */}
      {open &&
        createPortal(
          <>
            {/* Desktop Anchored Popover */}
            <div
              ref={desktopPanelRef}
              role="dialog"
              aria-label="Notification Center"
              className="hidden sm:block fixed top-[60px] right-4 lg:right-6 w-[410px] max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50"
            >
              {panelBody}
            </div>

            {/* Mobile Native Bottom Sheet */}
            <div
              className="sm:hidden fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-[2px] flex items-end"
              onClick={() => setOpen(false)}
            >
              <div
                role="dialog"
                aria-label="Notification Center Mobile"
                className="bg-white w-full rounded-t-3xl border-t border-slate-200 overflow-hidden pb-safe"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="pt-2.5 pb-1 flex justify-center">
                  <div className="w-10 h-1.5 bg-slate-300 rounded-full" />
                </div>
                {panelBody}
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}

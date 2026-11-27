import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Package, Search, User, X } from 'lucide-react';
import { formatMoney, formatNumber } from '../engine/format';
import type { Customer, Invoice, Language, Product } from '../engine/types';
import { DICT } from '../i18n/translations';
import type { WorkspacePayload } from '../lib/api';
import { searchWorkspace, type GlobalSearchResultItem } from '../lib/globalSearch';

interface Props {
  workspace: WorkspacePayload;
  lang: Language;
  onSelectInvoice: (invoice: Invoice) => void;
  onSelectProduct: (product: Product) => void;
  onSelectCustomer: (customer: Customer) => void;
}

export function GlobalSearchBar({
  workspace,
  lang,
  onSelectInvoice,
  onSelectProduct,
  onSelectCustomer,
}: Props) {
  const isBn = lang === 'bn';
  const t = DICT[lang];
  const money = (v: number) => formatMoney(v, lang, workspace.organization.currencySymbol);

  const [query, setQuery] = useState('');
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const desktopInputRef = useRef<HTMLInputElement | null>(null);
  const mobileInputRef = useRef<HTMLInputElement | null>(null);

  const results = useMemo(() => searchWorkspace(workspace, query, 5), [workspace, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Global keyboard shortcuts: Cmd/Ctrl+K or '/' focuses search; Esc closes
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT';

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (window.innerWidth < 640) {
          setMobileOpen(true);
        } else {
          desktopInputRef.current?.focus();
          setDesktopOpen(true);
        }
        return;
      }

      if (e.key === '/' && !isInput && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        if (window.innerWidth < 640) {
          setMobileOpen(true);
        } else {
          desktopInputRef.current?.focus();
          setDesktopOpen(true);
        }
        return;
      }

      if (e.key === 'Escape') {
        setDesktopOpen(false);
        setMobileOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Auto-focus mobile input when overlay opens
  useEffect(() => {
    if (mobileOpen) {
      const id = window.setTimeout(() => mobileInputRef.current?.focus(), 40);
      return () => window.clearTimeout(id);
    }
  }, [mobileOpen]);

  // Close desktop popover on outside click
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDesktopOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const handleSelect = (entry: GlobalSearchResultItem) => {
    setDesktopOpen(false);
    setMobileOpen(false);
    setQuery('');
    if (entry.type === 'invoice') {
      onSelectInvoice(entry.item);
    } else if (entry.type === 'product') {
      onSelectProduct(entry.item);
    } else {
      onSelectCustomer(entry.item);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!results.flat.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % results.flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + results.flat.length) % results.flat.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = results.flat[activeIndex];
      if (selected) handleSelect(selected);
    }
  };

  const placeholder = isBn
    ? 'ইনভয়েস, পণ্য বা কাস্টমার খুঁজুন (নাম বা আইডি)...'
    : 'Search invoices, products, or customers by name or ID...';

  const renderResultsList = () => {
    if (!query.trim()) {
      return (
        <div className="px-4 py-5 text-center text-xs text-slate-500">
          {isBn
            ? 'ইনভয়েস নম্বর (INV-), মূসক চালান, পণ্যের নাম/SKU বা কাস্টমারের নাম দিয়ে খুঁজুন।'
            : 'Type an invoice number (INV-), SKU, product name, customer name, or ID.'}
        </div>
      );
    }

    if (results.flat.length === 0) {
      return (
        <div className="px-4 py-6 text-center">
          <div className="text-xs font-medium text-slate-700">
            {isBn ? 'কোনো ফলাফল পাওয়া যায়নি' : 'No matching records found'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {isBn ? `"${query}" এর জন্য কোনো ইনভয়েস, পণ্য বা কাস্টমার নেই।` : `No invoices, products, or customers match "${query}".`}
          </div>
        </div>
      );
    }

    const invoiceOffset = 0;
    const productOffset = results.invoices.length;
    const customerOffset = results.invoices.length + results.products.length;

    return (
      <div className="divide-y divide-slate-100 max-h-[65vh] sm:max-h-[420px] overflow-y-auto">
        {results.invoices.length > 0 && (
          <div className="py-1.5">
            <div className="px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {isBn ? 'ইনভয়েস' : 'Invoices'}
            </div>
            {results.invoices.map((inv, idx) => {
              const flatIdx = invoiceOffset + idx;
              const isActive = flatIdx === activeIndex;
              return (
                <button
                  key={`inv-${inv.id}`}
                  type="button"
                  onMouseEnter={() => setActiveIndex(flatIdx)}
                  onClick={() => handleSelect({ type: 'invoice', id: `invoice-${inv.id}`, item: inv, score: 0 })}
                  className={`w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-left transition-colors ${
                    isActive ? 'bg-[#0F766E]/8' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText className="w-4 h-4 text-[#0F766E] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate">
                        <span className="font-mono">{inv.invoiceNumber}</span> · {inv.customerName}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        ID #{inv.id} · <span className="font-mono">{inv.mushakChallanNo}</span> · {t.status[inv.status]}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-semibold font-mono tabular-nums text-slate-900">
                      {money(inv.grandTotal)}
                    </div>
                    {inv.balanceDue > 0 && (
                      <div className="text-[10px] font-mono tabular-nums text-rose-700">
                        {t.labels.balanceDue}: {money(inv.balanceDue)}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {results.products.length > 0 && (
          <div className="py-1.5">
            <div className="px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {isBn ? 'পণ্য ও স্টক' : 'Products'}
            </div>
            {results.products.map((prod, idx) => {
              const flatIdx = productOffset + idx;
              const isActive = flatIdx === activeIndex;
              return (
                <button
                  key={`prod-${prod.id}`}
                  type="button"
                  onMouseEnter={() => setActiveIndex(flatIdx)}
                  onClick={() => handleSelect({ type: 'product', id: `product-${prod.id}`, item: prod, score: 0 })}
                  className={`w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-left transition-colors ${
                    isActive ? 'bg-[#0F766E]/8' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Package className="w-4 h-4 text-[#0F766E] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate">
                        {isBn && prod.nameBn ? prod.nameBn : prod.name}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        ID #{prod.id} · <span className="font-mono">{prod.sku}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-semibold font-mono tabular-nums text-slate-900">
                      {money(prod.salePrice)}
                    </div>
                    <div className="text-[10px] text-slate-500 tabular-nums">
                      {isBn ? 'স্টক' : 'Stock'}: {formatNumber(prod.stockQty ?? 0, lang)} {prod.unit}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {results.customers.length > 0 && (
          <div className="py-1.5">
            <div className="px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {isBn ? 'কাস্টমার' : 'Customers'}
            </div>
            {results.customers.map((cust, idx) => {
              const flatIdx = customerOffset + idx;
              const isActive = flatIdx === activeIndex;
              return (
                <button
                  key={`cust-${cust.id}`}
                  type="button"
                  onMouseEnter={() => setActiveIndex(flatIdx)}
                  onClick={() => handleSelect({ type: 'customer', id: `customer-${cust.id}`, item: cust, score: 0 })}
                  className={`w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-left transition-colors ${
                    isActive ? 'bg-[#0F766E]/8' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <User className="w-4 h-4 text-[#0F766E] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate">{cust.name}</div>
                      <div className="text-[11px] text-slate-500 truncate">
                        ID #{cust.id} {cust.companyName ? `· ${cust.companyName}` : ''} {cust.phone ? `· ${cust.phone}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-semibold font-mono tabular-nums text-slate-900">
                      {money(cust.receivableBalance ?? 0)}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {isBn ? 'বকেয়া' : 'Receivable'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Desktop / Tablet Inline Header Search Bar */}
      <div ref={containerRef} className="hidden sm:block relative flex-1 max-w-md mx-2">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={desktopInputRef}
          type="text"
          value={query}
          onFocus={() => setDesktopOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setDesktopOpen(true);
          }}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder}
          aria-label="Global search"
          className="w-full h-9 pl-9 pr-12 text-xs bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 focus:border-[#0F766E] rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none transition-colors"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              desktopInputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <kbd className="hidden md:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-white border border-slate-200 rounded absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
            ⌘K
          </kbd>
        )}

        {desktopOpen && query.trim().length > 0 && (
          <div
            role="listbox"
            aria-label="Global search results"
            className="absolute left-0 right-0 top-[calc(100%+6px)] bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50"
          >
            {renderResultsList()}
          </div>
        )}
      </div>

      {/* Mobile Header Compact Search Trigger Button */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open global search"
        className="sm:hidden ml-auto min-h-[40px] min-w-[40px] inline-flex items-center justify-center text-slate-700 hover:bg-slate-100 active:bg-slate-100 active:scale-95 rounded-xl transition-all shrink-0"
      >
        <Search className="w-[19px] h-[19px]" strokeWidth={2} />
      </button>

      {/* Mobile Native Search Overlay (Portaled to document.body so fixed backdrop covers full viewport above frosted header) */}
      {mobileOpen &&
        createPortal(
          <div
            className="sm:hidden fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-[2px] flex flex-col"
            onClick={() => setMobileOpen(false)}
          >
            <div
              className="bg-white w-full border-b border-slate-200 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-3.5 py-3 flex items-center gap-2 border-b border-slate-100">
                <div className="relative flex-1 min-w-0">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    ref={mobileInputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    placeholder={placeholder}
                    aria-label="Global search mobile"
                    className="w-full h-10 pl-9 pr-9 text-sm bg-slate-50 border border-slate-200 focus:border-[#0F766E] focus:bg-white rounded-xl text-slate-900 focus:outline-none"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery('');
                        mobileInputRef.current?.focus();
                      }}
                      aria-label="Clear search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="min-h-[40px] px-2.5 text-xs font-medium text-slate-600 active:scale-95 whitespace-nowrap"
                >
                  {t.actions.cancel}
                </button>
              </div>
              <div role="listbox" aria-label="Mobile global search results">
                {renderResultsList()}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Search, UserPlus, X } from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import type { Customer, Language } from '../engine/types';
import { apiRequest } from '../lib/api';
import {
  filterCustomersForPicker,
  hasExactCustomerMatch,
  inferNewCustomerPrefill,
} from '../lib/customerPicker';

interface Props {
  id?: string;
  customers: Customer[];
  value: number;
  onChange: (customerId: number) => void;
  onCustomerCreated: (customer: Customer) => void;
  lang: Language;
  compact?: boolean;
  placeholder?: string;
}

export function CustomerPickerCombobox({
  id = 'customer-picker',
  customers,
  value,
  onChange,
  onCustomerCreated,
  lang,
  compact = false,
  placeholder,
}: Props) {
  const isBn = lang === 'bn';
  const { notify } = useFeedback();
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  // Inline new-customer form fields
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newBin, setNewBin] = useState('');
  const [savingNew, setSavingNew] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === value) ?? null,
    [customers, value]
  );

  const filtered = useMemo(
    () => filterCustomersForPicker(customers, query).slice(0, 25),
    [customers, query]
  );

  const exactMatch = useMemo(
    () => hasExactCustomerMatch(customers, query),
    [customers, query]
  );

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const openInlineCreator = () => {
    const prefill = inferNewCustomerPrefill(query);
    setNewName(prefill.name);
    setNewPhone(prefill.phone);
    setNewCompany('');
    setNewAddress('');
    setNewBin('');
    setCreateError(null);
    setCreating(true);
    setOpen(false);
  };

  const handleSelect = (customer: Customer) => {
    onChange(customer.id);
    setQuery('');
    setOpen(false);
    setCreating(false);
  };

  const handleSaveNewCustomer = async () => {
    setCreateError(null);
    const trimmedName = newName.trim();
    if (!trimmedName) {
      setCreateError(isBn ? 'কাস্টমারের নাম আবশ্যক।' : 'Customer name is required.');
      return;
    }

    setSavingNew(true);
    try {
      const createdRes = await apiRequest<{ id: number; code: string }>('/api/customers', {
        method: 'POST',
        body: {
          name: trimmedName,
          phone: newPhone.trim(),
          companyName: newCompany.trim(),
          address: newAddress.trim(),
          binNumber: newBin.trim(),
          openingBalance: 0,
          creditLimit: 0,
        },
      });

      const createdCustomer: Customer = {
        id: createdRes.id,
        code: createdRes.code,
        name: trimmedName,
        companyName: newCompany.trim(),
        phone: newPhone.trim(),
        email: '',
        binNumber: newBin.trim(),
        address: newAddress.trim(),
        openingBalance: 0,
        creditLimit: 0,
        createdAt: new Date().toISOString(),
      };

      onCustomerCreated(createdCustomer);
      onChange(createdCustomer.id);
      notify({
        title: isBn ? 'নতুন কাস্টমার যুক্ত ও নির্বাচিত হয়েছে।' : 'New customer added & selected.',
        description: createdCustomer.phone ? `${createdCustomer.name} · ${createdCustomer.phone}` : createdCustomer.name,
        variant: 'success',
        sound: 'save',
      });
      setCreating(false);
      setOpen(false);
      setQuery('');
      setNewName('');
      setNewPhone('');
      setNewCompany('');
      setNewAddress('');
      setNewBin('');
    } catch (err) {
      setCreateError(
        err instanceof Error
          ? err.message
          : isBn
            ? 'নতুন কাস্টমার যোগ করা যায়নি।'
            : 'Unable to add new customer.'
      );
    } finally {
      setSavingNew(false);
    }
  };

  const inputHeightClass = compact ? 'h-9 text-xs' : 'h-10 text-sm';

  return (
    <div ref={containerRef} className="relative" data-testid={`customer-picker-${id}`}>
      {/* Trigger / Live Search Bar */}
      {!open ? (
        <button
          id={id}
          type="button"
          data-testid={`${id}-trigger`}
          onClick={() => {
            setCreating(false);
            setOpen(true);
            setTimeout(() => searchInputRef.current?.focus(), 0);
          }}
          className={`w-full ${inputHeightClass} px-3 bg-white border border-slate-300 hover:border-slate-400 rounded-lg flex items-center justify-between gap-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-[#0F766E]/25 focus:border-[#0F766E]`}
        >
          <span className="min-w-0 flex items-center gap-2 truncate">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            {selectedCustomer ? (
              <span className="truncate text-slate-900 font-medium">
                {selectedCustomer.name}
                {selectedCustomer.phone ? (
                  <span className="text-slate-500 font-normal ml-1.5 font-mono text-[11px]">
                    · {selectedCustomer.phone}
                  </span>
                ) : selectedCustomer.companyName ? (
                  <span className="text-slate-500 font-normal ml-1.5 text-[11px]">
                    ({selectedCustomer.companyName})
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="truncate text-slate-400">
                {placeholder || (isBn ? 'কাস্টমার খুঁজুন বা নতুন যোগ করুন...' : 'Search or add customer...')}
              </span>
            )}
          </span>
          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
        </button>
      ) : (
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[#0F766E] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchInputRef}
            id={`${id}-search`}
            data-testid={`${id}-search`}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (filtered.length === 1) {
                  handleSelect(filtered[0]);
                } else if (filtered.length === 0 && query.trim()) {
                  openInlineCreator();
                }
              }
            }}
            placeholder={
              placeholder ||
              (isBn ? 'নাম, মোবাইল নম্বর বা কোম্পানি লিখে খুঁজুন...' : 'Search by name, phone, or company...')
            }
            aria-label={isBn ? 'কাস্টমার খুঁজুন' : 'Search customer'}
            className={`w-full ${inputHeightClass} pl-8 pr-8 bg-white border border-[#0F766E] ring-2 ring-[#0F766E]/20 rounded-lg focus:outline-none text-slate-900`}
          />
          <button
            type="button"
            aria-label={isBn ? 'বন্ধ করুন' : 'Close customer search'}
            onClick={() => {
              setQuery('');
              setOpen(false);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Search Results Dropdown */}
      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 mt-1.5 z-40 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
        >
          <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <div className="px-3.5 py-4 text-center text-xs text-slate-500">
                {isBn
                  ? `“${query.trim()}” নামে কোনো কাস্টমার পাওয়া যায়নি।`
                  : `No customer found matching "${query.trim()}".`}
              </div>
            ) : (
              filtered.map((customer) => {
                const isSelected = customer.id === value;
                return (
                  <button
                    key={customer.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(customer)}
                    className={`w-full px-3 py-2.5 text-left flex items-center justify-between gap-2 transition-colors ${
                      isSelected ? 'bg-teal-50/70 text-[#0F766E]' : 'hover:bg-slate-50 text-slate-900'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">{customer.name}</div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">
                        {[customer.companyName, customer.phone, customer.code].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#0F766E] shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          <div className="border-t border-slate-200 bg-slate-50 p-2">
            <button
              type="button"
              data-testid={`${id}-add-new`}
              onClick={openInlineCreator}
              className="w-full py-2 px-3 rounded-lg bg-[#0F766E]/10 hover:bg-[#0F766E]/15 text-[#0F766E] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {query.trim() && !exactMatch
                  ? isBn
                    ? `“${query.trim()}” নতুন কাস্টমার হিসেবে যোগ করুন`
                    : `Add "${query.trim()}" as new customer`
                  : isBn
                    ? 'নতুন কাস্টমার যোগ করুন'
                    : 'Add New Customer'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Inline Quick Create Customer Card (uses div, never nested form) */}
      {creating && (
        <div
          role="region"
          aria-label={isBn ? 'নতুন কাস্টমার যোগ করুন' : 'Quick Add Customer'}
          data-testid={`${id}-inline-form`}
          className="mt-2 p-3 bg-slate-50 border border-[#0F766E]/35 rounded-xl space-y-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
              <UserPlus className="w-3.5 h-3.5 text-[#0F766E]" />
              <span>{isBn ? 'তাৎক্ষণিক নতুন কাস্টমার যোগ' : 'Quick Add New Customer'}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setCreateError(null);
              }}
              aria-label={isBn ? 'বাতিল করুন' : 'Cancel new customer'}
              className="p-1 text-slate-400 hover:text-slate-700 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {createError && (
            <div role="alert" className="p-2 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
              {createError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label htmlFor={`${id}-new-name`} className="block text-[11px] font-medium text-slate-600 mb-1">
                {isBn ? 'কাস্টমারের নাম *' : 'Customer Name *'}
              </label>
              <input
                id={`${id}-new-name`}
                data-testid={`${id}-new-name`}
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSaveNewCustomer();
                  }
                }}
                placeholder={isBn ? 'যেমন: কামাল ট্রেডার্স' : 'e.g., Kamal Traders'}
                className="w-full h-8 px-2.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0F766E]"
              />
            </div>
            <div>
              <label htmlFor={`${id}-new-phone`} className="block text-[11px] font-medium text-slate-600 mb-1">
                {isBn ? 'মোবাইল নম্বর' : 'Phone Number'}
              </label>
              <input
                id={`${id}-new-phone`}
                data-testid={`${id}-new-phone`}
                type="text"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSaveNewCustomer();
                  }
                }}
                placeholder="017XXXXXXXX"
                className="w-full h-8 px-2.5 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0F766E]"
              />
            </div>
            <div>
              <label htmlFor={`${id}-new-company`} className="block text-[11px] font-medium text-slate-600 mb-1">
                {isBn ? 'প্রতিষ্ঠান (ঐচ্ছিক)' : 'Company (Optional)'}
              </label>
              <input
                id={`${id}-new-company`}
                type="text"
                value={newCompany}
                onChange={(e) => setNewCompany(e.target.value)}
                placeholder={isBn ? 'প্রতিষ্ঠানের নাম' : 'Company name'}
                className="w-full h-8 px-2.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0F766E]"
              />
            </div>
            <div>
              <label htmlFor={`${id}-new-address`} className="block text-[11px] font-medium text-slate-600 mb-1">
                {isBn ? 'ঠিকানা (ঐচ্ছিক)' : 'Address (Optional)'}
              </label>
              <input
                id={`${id}-new-address`}
                type="text"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder={isBn ? 'এলাকা, শহর' : 'Area, City'}
                className="w-full h-8 px-2.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0F766E]"
              />
            </div>
          </div>

          <div>
            <label htmlFor={`${id}-new-bin`} className="block text-[11px] font-medium text-slate-600 mb-1">
              {isBn ? 'বিআইএন / মূসক নম্বর (ঐচ্ছিক)' : 'BIN / VAT No. (Optional)'}
            </label>
            <input
              id={`${id}-new-bin`}
              type="text"
              value={newBin}
              onChange={(e) => setNewBin(e.target.value)}
              placeholder="001234567-0101"
              className="w-full h-8 px-2.5 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0F766E]"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setCreateError(null);
              }}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200/70 rounded-lg whitespace-nowrap"
            >
              {isBn ? 'বাতিল' : 'Cancel'}
            </button>
            <button
              type="button"
              data-testid={`${id}-save-new`}
              disabled={savingNew}
              onClick={handleSaveNewCustomer}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#115E59] disabled:opacity-60 rounded-lg whitespace-nowrap"
            >
              {savingNew && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{savingNew ? (isBn ? 'যোগ হচ্ছে...' : 'Saving...') : isBn ? 'সংরক্ষণ ও নির্বাচন করুন' : 'Save & Select'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

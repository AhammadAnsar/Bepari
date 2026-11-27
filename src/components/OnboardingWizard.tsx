import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Eye,
  EyeOff,
  Lock,
  Mail,
  MapPin,
  Phone,
  User,
} from 'lucide-react';
import type { Language } from '../engine/types';
import { completeOnboardingApi, type OnboardingPayload, type SessionInfo } from '../lib/api';
import { BepariLogo } from './BepariLogo';

interface Props {
  lang: Language;
  onToggleLang: () => void;
  onCompleted: (session: SessionInfo, payload: OnboardingPayload) => Promise<void> | void;
}

export function OnboardingWizard({ lang, onToggleLang, onCompleted }: Props) {
  const isBn = lang === 'bn';
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1: Owner Account
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Step 2: Organization & Main Branch
  const [orgNameBn, setOrgNameBn] = useState('');
  const [orgNameEn, setOrgNameEn] = useState('');
  const [proprietorName, setProprietorName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [branchNameBn, setBranchNameBn] = useState('প্রধান শাখা');
  const [branchCode, setBranchCode] = useState('MAIN');
  const [binNumber, setBinNumber] = useState('');
  const [tagline, setTagline] = useState('');
  const [vatMode, setVatMode] = useState<'exclusive' | 'inclusive'>('exclusive');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = ownerName.trim();
    const trimmedEmail = ownerEmail.trim().toLowerCase();

    if (!trimmedName) {
      setError(isBn ? 'আপনার পূর্ণ নাম লিখুন।' : 'Please enter your full name.');
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError(isBn ? 'সঠিক ইমেইল ঠিকানা লিখুন।' : 'Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError(
        isBn
          ? 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।'
          : 'Password must be at least 6 characters.'
      );
      return;
    }
    if (password !== confirmPassword) {
      setError(
        isBn
          ? 'পাসওয়ার্ড এবং নিশ্চিতকরণ পাসওয়ার্ড মিলছে না।'
          : 'Password and confirmation password do not match.'
      );
      return;
    }

    if (!proprietorName.trim()) {
      setProprietorName(trimmedName);
    }
    setStep(2);
  };

  const handleCompleteOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedOrgBn = orgNameBn.trim();
    const trimmedOrgEn = orgNameEn.trim();
    const trimmedPhone = phone.trim();
    const trimmedAddress = address.trim();

    if (!trimmedOrgBn && !trimmedOrgEn) {
      setError(isBn ? 'প্রতিষ্ঠানের নাম লিখুন।' : 'Please enter your organization name.');
      return;
    }
    if (!trimmedPhone) {
      setError(isBn ? 'প্রতিষ্ঠানের মোবাইল নম্বর লিখুন।' : 'Please enter a business phone number.');
      return;
    }
    if (!trimmedAddress) {
      setError(isBn ? 'প্রতিষ্ঠানের ঠিকানা লিখুন।' : 'Please enter your business address.');
      return;
    }

    setSubmitting(true);
    try {
      const payload: OnboardingPayload = {
        ownerName: ownerName.trim(),
        ownerEmail: ownerEmail.trim().toLowerCase(),
        password,
        orgNameBn: trimmedOrgBn || trimmedOrgEn,
        orgNameEn: trimmedOrgEn || trimmedOrgBn,
        proprietorName: proprietorName.trim() || ownerName.trim(),
        phone: trimmedPhone,
        address: trimmedAddress,
        binNumber: binNumber.trim(),
        tagline: tagline.trim(),
        vatMode,
        defaultLanguage: lang,
        branchNameBn: branchNameBn.trim() || 'প্রধান শাখা',
        branchNameEn: 'Main Branch',
        branchCode: branchCode.trim().toUpperCase() || 'MAIN',
      };

      const session = await completeOnboardingApi(payload);
      await onCompleted(session, payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onboarding failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      data-testid="onboarding-wizard"
      data-step={step}
      className={`min-h-dvh w-full bg-white lg:bg-[#F7F8FA] text-[#0F172A] flex flex-col lg:flex-row overflow-x-clip ${
        isBn ? 'font-[var(--font-bn)]' : ''
      }`}
    >
      {/* Desktop Editorial Left Column */}
      <section className="hidden lg:flex lg:w-[42%] xl:w-[44%] bg-[#0B1220] text-slate-100 flex-col justify-between px-12 py-11 shrink-0">
        <div>
          <BepariLogo
            lang={lang}
            size="lg"
            surface="dark"
            subtitle={isBn ? 'ব্যবসায়িক হিসাব ও ক্যাশ মেমো' : 'BUSINESS ACCOUNTING & POS'}
          />
        </div>

        <div className="max-w-md space-y-6">
          <div className="space-y-3">
            <div className="text-xs font-medium text-[#2DD4BF] tracking-wide uppercase">
              {isBn ? 'প্রথমবার ওয়ার্কস্পেস সেটআপ' : 'First-Time Workspace Setup'}
            </div>
            <h1 className="text-[28px] font-semibold tracking-tight text-white leading-[1.28]">
              {isBn
                ? 'আপনার প্রতিষ্ঠানের নিজস্ব হিসাব ও ক্যাশ মেমো ওয়ার্কস্পেস শুরু করুন।'
                : 'Set up your organization’s dedicated accounting and billing workspace.'}
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed">
              {isBn
                ? 'এখানে সংরক্ষিত তথ্য স্বয়ংক্রিয়ভাবে আপনার সকল ক্যাশ মেমো, ইনভয়েস, চালান ও আর্থিক বিবরণীতে যুক্ত হবে।'
                : 'Details saved here automatically sync across all your cash memos, invoices, statements, and financial reports.'}
            </p>
          </div>

          {/* 2-Step Progress Checklist */}
          <div className="space-y-3 pt-2 border-t border-slate-800/90">
            <div className="flex items-center gap-3">
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-semibold ${
                  step === 1
                    ? 'bg-[#0F766E] text-white'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                }`}
              >
                {step > 1 ? <Check className="w-4 h-4" /> : '১'}
              </div>
              <div>
                <div className="text-xs font-semibold text-white">
                  {isBn ? 'ধাপ ১: ওনার (Owner) অ্যাকাউন্ট তৈরি' : 'Step 1: Create Owner Account'}
                </div>
                <div className="text-[11px] text-slate-400">
                  {isBn ? 'প্রশাসনিক লগইন ও নিরাপত্তা পাসওয়ার্ড' : 'Primary administrator login credentials'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-semibold ${
                  step === 2
                    ? 'bg-[#0F766E] text-white'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                {isBn ? '২' : '2'}
              </div>
              <div>
                <div className={`text-xs font-semibold ${step === 2 ? 'text-white' : 'text-slate-300'}`}>
                  {isBn ? 'ধাপ ২: প্রতিষ্ঠান ও মূল শাখা অনবোর্ডিং' : 'Step 2: Organization & Main Branch'}
                </div>
                <div className="text-[11px] text-slate-400">
                  {isBn ? 'প্রতিষ্ঠানের নাম, ঠিকানা, মোবাইল ও শাখা' : 'Business identity, address, phone & branch'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="text-xs text-slate-500">
          {isBn ? 'বেপারী · এন্টারপ্রাইজ হিসাব ও বিলিং প্ল্যাটফর্ম' : 'Bepari · Enterprise Billing & Accounting'}
        </div>
      </section>

      {/* Main Single-Scroll Form Surface */}
      <section className="flex-1 bg-white flex flex-col justify-between px-5 py-5 sm:px-10 lg:px-14 lg:py-10">
        {/* Top Header: Mobile Brand Mark + Step Badge + Language Toggle */}
        <div className="flex items-center justify-between gap-3">
          <div className="lg:hidden">
            <BepariLogo lang={lang} size="md" surface="light" />
          </div>
          <div className="hidden lg:flex items-center gap-2 text-xs font-medium text-slate-500">
            <span>{isBn ? `ধাপ ${step === 1 ? '১' : '২'} / ২` : `Step ${step} of 2`}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="lg:hidden text-xs font-medium text-slate-500">
              {isBn ? `ধাপ ${step === 1 ? '১/২' : '২/২'}` : `Step ${step}/2`}
            </span>
            <button
              type="button"
              onClick={onToggleLang}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/70 rounded-lg transition-colors whitespace-nowrap"
            >
              {isBn ? 'English' : 'বাংলা'}
            </button>
          </div>
        </div>

        {/* Centered Step Form Container */}
        <div className="w-full max-w-[460px] mx-auto my-auto py-6">
          {/* Compact Step Progress Bar */}
          <div className="grid grid-cols-2 gap-2 mb-6" aria-hidden="true">
            <div className="h-1.5 rounded-full bg-[#0F766E]" />
            <div className={`h-1.5 rounded-full transition-colors ${step === 2 ? 'bg-[#0F766E]' : 'bg-slate-200'}`} />
          </div>

          {step === 1 ? (
            <div>
              <div className="mb-5">
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
                  {isBn ? 'ওনার অ্যাকাউন্ট তৈরি করুন' : 'Create Owner Account'}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  {isBn
                    ? 'প্রথমবার ব্যবহারের জন্য আপনার নাম, ইমেইল এবং নিরাপদ পাসওয়ার্ড নির্ধারণ করুন।'
                    : 'Set up your primary administrator name, email, and password.'}
                </p>
              </div>

              <form onSubmit={handleNextStep} className="space-y-4">
                {error && (
                  <div
                    role="alert"
                    className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg leading-relaxed"
                  >
                    {error}
                  </div>
                )}

                <div>
                  <label htmlFor="onboard-owner-name" className="block text-xs font-medium text-slate-700 mb-1.5">
                    {isBn ? 'আপনার পূর্ণ নাম *' : 'Your Full Name *'}
                  </label>
                  <div className="relative">
                    <User
                      className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="onboard-owner-name"
                      data-testid="onboard-owner-name"
                      type="text"
                      required
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      placeholder={isBn ? 'যেমন: মোঃ সোহেল রানা' : 'e.g. Md. Sohel Rana'}
                      className="w-full h-11 pl-10 pr-3.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20 focus:border-[#0F766E]"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="onboard-owner-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                    {isBn ? 'লগইন ইমেইল *' : 'Login Email *'}
                  </label>
                  <div className="relative">
                    <Mail
                      className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="onboard-owner-email"
                      data-testid="onboard-owner-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmail(e.target.value)}
                      placeholder="name@yourbusiness.com"
                      className="w-full h-11 pl-10 pr-3.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20 focus:border-[#0F766E]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label htmlFor="onboard-password" className="block text-xs font-medium text-slate-700 mb-1.5">
                      {isBn ? 'পাসওয়ার্ড (ন্যূনতম ৬ অক্ষর) *' : 'Password (min 6 chars) *'}
                    </label>
                    <div className="relative">
                      <Lock
                        className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                        aria-hidden="true"
                      />
                      <input
                        id="onboard-password"
                        data-testid="onboard-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full h-11 pl-10 pr-10 text-sm text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20 focus:border-[#0F766E]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={
                          showPassword
                            ? isBn
                              ? 'পাসওয়ার্ড লুকান'
                              : 'Hide password'
                            : isBn
                              ? 'পাসওয়ার্ড দেখুন'
                              : 'Show password'
                        }
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 inline-flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="onboard-confirm-password" className="block text-xs font-medium text-slate-700 mb-1.5">
                      {isBn ? 'পাসওয়ার্ড নিশ্চিত করুন *' : 'Confirm Password *'}
                    </label>
                    <div className="relative">
                      <Lock
                        className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                        aria-hidden="true"
                      />
                      <input
                        id="onboard-confirm-password"
                        data-testid="onboard-confirm-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full h-11 pl-10 pr-3.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20 focus:border-[#0F766E]"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  data-testid="onboard-next-btn"
                  className="w-full h-11 mt-2 inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-[#0F766E] hover:bg-[#115E59] active:scale-[0.99] rounded-xl transition-all"
                >
                  <span>{isBn ? 'পরবর্তী ধাপ: প্রতিষ্ঠানের তথ্য' : 'Next: Organization Setup'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>
          ) : (
            <div>
              <div className="mb-5">
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
                  {isBn ? 'প্রতিষ্ঠান ও মূল শাখা সেটআপ' : 'Organization & Main Branch'}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  {isBn
                    ? 'আপনার প্রতিষ্ঠানের তথ্য ক্যাশ মেমো, ইনভয়েস ও সকল রিপোর্টে স্বয়ংক্রিয়ভাবে ব্যবহৃত হবে।'
                    : 'These details automatically sync across your Cash Memos, Invoices, and Reports.'}
                </p>
              </div>

              <form onSubmit={handleCompleteOnboarding} className="space-y-3.5">
                {error && (
                  <div
                    role="alert"
                    className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg leading-relaxed"
                  >
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="onboard-org-bn" className="block text-xs font-medium text-slate-700 mb-1">
                      {isBn ? 'প্রতিষ্ঠানের নাম (বাংলায়) *' : 'Organization Name (Bangla) *'}
                    </label>
                    <div className="relative">
                      <Building2
                        className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                        aria-hidden="true"
                      />
                      <input
                        id="onboard-org-bn"
                        data-testid="onboard-org-bn"
                        type="text"
                        required
                        value={orgNameBn}
                        onChange={(e) => setOrgNameBn(e.target.value)}
                        placeholder={isBn ? 'যেমন: মেসার্স নূপুর এন্টারপ্রাইজ' : 'e.g. মেসার্স নূপুর এন্টারপ্রাইজ'}
                        className="w-full h-10 pl-9 pr-3 text-sm text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#0F766E]"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="onboard-org-en" className="block text-xs font-medium text-slate-700 mb-1">
                      {isBn ? 'প্রতিষ্ঠানের নাম (English)' : 'Organization Name (English)'}
                    </label>
                    <input
                      id="onboard-org-en"
                      data-testid="onboard-org-en"
                      type="text"
                      value={orgNameEn}
                      onChange={(e) => setOrgNameEn(e.target.value)}
                      placeholder="e.g. M/S Nupur Enterprise"
                      className="w-full h-10 px-3 text-sm text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#0F766E]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="onboard-proprietor" className="block text-xs font-medium text-slate-700 mb-1">
                      {isBn ? 'প্রোপ্রাইটর / স্বত্বাধিকারী' : 'Proprietor / Managing Director'}
                    </label>
                    <input
                      id="onboard-proprietor"
                      data-testid="onboard-proprietor"
                      type="text"
                      value={proprietorName}
                      onChange={(e) => setProprietorName(e.target.value)}
                      placeholder={isBn ? 'যেমন: প্রোঃ মোঃ সোহেল রানা' : 'e.g. Md. Sohel Rana'}
                      className="w-full h-10 px-3 text-sm text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#0F766E]"
                    />
                  </div>

                  <div>
                    <label htmlFor="onboard-phone" className="block text-xs font-medium text-slate-700 mb-1">
                      {isBn ? 'মোবাইল নম্বর *' : 'Business Mobile Phone *'}
                    </label>
                    <div className="relative">
                      <Phone
                        className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                        aria-hidden="true"
                      />
                      <input
                        id="onboard-phone"
                        data-testid="onboard-phone"
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="017XXXXXXXX"
                        className="w-full h-10 pl-9 pr-3 text-sm text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#0F766E]"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="onboard-address" className="block text-xs font-medium text-slate-700 mb-1">
                    {isBn ? 'ব্যবসায়িক ঠিকানা *' : 'Business Address *'}
                  </label>
                  <div className="relative">
                    <MapPin
                      className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="onboard-address"
                      data-testid="onboard-address"
                      type="text"
                      required
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder={isBn ? 'মার্কেট/সড়ক, থানা ও জেলা' : 'Street, Area, City'}
                      className="w-full h-10 pl-9 pr-3 text-sm text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#0F766E]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-5">
                    <label htmlFor="onboard-branch-name" className="block text-xs font-medium text-slate-700 mb-1">
                      {isBn ? 'মূল শাখার নাম' : 'Main Branch Name'}
                    </label>
                    <input
                      id="onboard-branch-name"
                      type="text"
                      value={branchNameBn}
                      onChange={(e) => setBranchNameBn(e.target.value)}
                      className="w-full h-10 px-3 text-sm text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#0F766E]"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label htmlFor="onboard-branch-code" className="block text-xs font-medium text-slate-700 mb-1">
                      {isBn ? 'শাখা কোড' : 'Branch Code'}
                    </label>
                    <input
                      id="onboard-branch-code"
                      type="text"
                      value={branchCode}
                      onChange={(e) => setBranchCode(e.target.value.toUpperCase())}
                      className="w-full h-10 px-3 text-sm font-mono text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#0F766E]"
                    />
                  </div>

                  <div className="sm:col-span-4">
                    <label htmlFor="onboard-bin" className="block text-xs font-medium text-slate-700 mb-1">
                      {isBn ? 'BIN / মূসক নং (ঐচ্ছিক)' : 'BIN No (Optional)'}
                    </label>
                    <input
                      id="onboard-bin"
                      type="text"
                      value={binNumber}
                      onChange={(e) => setBinNumber(e.target.value)}
                      placeholder="00XXXXXXXXX-XXXX"
                      className="w-full h-10 px-3 text-sm font-mono text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#0F766E]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="onboard-tagline" className="block text-xs font-medium text-slate-700 mb-1">
                      {isBn ? 'স্লোগান / ব্যবসার ধরন (ঐচ্ছিক)' : 'Tagline / Business Type (Optional)'}
                    </label>
                    <input
                      id="onboard-tagline"
                      type="text"
                      value={tagline}
                      onChange={(e) => setTagline(e.target.value)}
                      placeholder={isBn ? 'পাইকারি ও খুচরা বিক্রয় কেন্দ্র' : 'Wholesale & Retail Center'}
                      className="w-full h-10 px-3 text-sm text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#0F766E]"
                    />
                  </div>

                  <div>
                    <label htmlFor="onboard-vatmode" className="block text-xs font-medium text-slate-700 mb-1">
                      {isBn ? 'মূসক (VAT) হিসাব পদ্ধতি' : 'Default VAT Mode'}
                    </label>
                    <select
                      id="onboard-vatmode"
                      value={vatMode}
                      onChange={(e) => setVatMode(e.target.value as 'exclusive' | 'inclusive')}
                      className="w-full h-10 px-3 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#0F766E]"
                    >
                      <option value="exclusive">{isBn ? 'ভ্যাট বহির্ভূত (Exclusive)' : 'Tax Exclusive'}</option>
                      <option value="inclusive">{isBn ? 'ভ্যাট অন্তর্ভুক্ত (Inclusive)' : 'Tax Inclusive'}</option>
                    </select>
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-2.5">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      setError(null);
                      setStep(1);
                    }}
                    className="h-11 px-4 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200/80 rounded-xl transition-colors whitespace-nowrap shrink-0"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>{isBn ? 'পূর্ববর্তী ধাপ' : 'Back'}</span>
                  </button>

                  <button
                    type="submit"
                    data-testid="onboard-submit-btn"
                    disabled={submitting}
                    className="flex-1 h-11 inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-[#0F766E] hover:bg-[#115E59] active:scale-[0.99] disabled:opacity-60 rounded-xl transition-all"
                  >
                    <span>
                      {submitting
                        ? isBn
                          ? 'ওয়ার্কস্পেস তৈরি হচ্ছে...'
                          : 'Creating Workspace...'
                        : isBn
                          ? 'সেটআপ সম্পন্ন করুন ও প্রবেশ করুন'
                          : 'Complete Setup & Enter Workspace'}
                    </span>
                    {!submitting && <Check className="w-4 h-4" />}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        <div className="h-4" aria-hidden="true" />
      </section>
    </div>
  );
}

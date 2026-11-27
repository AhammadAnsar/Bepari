import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import type { Language } from '../engine/types';
import { BepariLogo } from './BepariLogo';

interface Props {
  lang: Language;
  onToggleLang: () => void;
  email: string;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  error: string | null;
  submitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  canQuickResume?: boolean;
  onQuickResume?: () => void;
}

export function LoginScreen({
  lang,
  onToggleLang,
  email,
  password,
  onEmailChange,
  onPasswordChange,
  error,
  submitting,
  onSubmit,
  canQuickResume = false,
  onQuickResume,
}: Props) {
  const isBn = lang === 'bn';
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div
      data-testid="login-screen"
      className={`min-h-dvh w-full bg-white lg:bg-[#F7F8FA] text-[#0F172A] flex flex-col lg:flex-row overflow-x-clip ${
        isBn ? 'font-[var(--font-bn)]' : ''
      }`}
    >
      {/* Desktop-Only Calm Editorial Brand Column (Hidden on Mobile for True Minimalism) */}
      <section className="hidden lg:flex lg:w-[48%] xl:w-[50%] bg-[#0B1220] text-slate-100 flex-col justify-between px-14 py-12 shrink-0">
        <div>
          <BepariLogo
            lang={lang}
            size="lg"
            surface="dark"
            subtitle={isBn ? 'হিসাব ও মূসক ব্যবস্থাপনা' : 'ACCOUNTING & VAT'}
          />
        </div>

        <div className="max-w-md space-y-4">
          <h1 className="text-[32px] font-semibold tracking-tight text-white leading-[1.25]">
            {isBn
              ? 'ব্যবসার প্রতিদিনের হিসাব, বিক্রয় ও মূসক এক জায়গায়।'
              : 'Daily billing, stock control, and VAT records in one calm ledger.'}
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            {isBn
              ? 'ইনভয়েস, ক্যাশ কাউন্টার, কাস্টমার বকেয়া এবং আর্থিক বিবরণী সহজে পরিচালনা করুন।'
              : 'Manage invoices, POS sales, customer balances, and financial statements without clutter.'}
          </p>
        </div>

        <div className="text-xs text-slate-500">
          {isBn ? 'বেপারি · ব্যবসায়িক হিসাব প্ল্যাটফর্ম' : 'Bepari · Business Accounting Platform'}
        </div>
      </section>

      {/* Main Credential Surface (Ultra-Minimal Centered Mobile View + Clean Desktop Column) */}
      <section className="flex-1 bg-white flex flex-col justify-between px-6 py-5 sm:px-10 lg:px-14 lg:py-12 min-h-dvh lg:min-h-0">
        {/* Subtle Top Bar: Language Toggle Only */}
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={onToggleLang}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/70 rounded-lg transition-colors whitespace-nowrap"
          >
            {isBn ? 'English' : 'বাংলা'}
          </button>
        </div>

        {/* Centered Minimal Credential Form */}
        <div className="w-full max-w-[360px] mx-auto my-auto py-8">
          {/* Mobile Brand Mark (App Icon + Name only) */}
          <div className="lg:hidden mb-8 flex justify-center">
            <BepariLogo lang={lang} size="lg" surface="light" />
          </div>

          <div className="mb-6 text-center lg:text-left">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
              {isBn ? 'অ্যাকাউন্টে লগইন করুন' : 'Sign in'}
            </h2>
            <p className="hidden lg:block text-xs text-slate-500 mt-1.5">
              {isBn
                ? 'আপনার ইমেইল ও পাসওয়ার্ড দিয়ে প্রবেশ করুন।'
                : 'Enter your email and password to continue.'}
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            {error && (
              <div
                role="alert"
                className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg leading-relaxed"
              >
                {error}
              </div>
            )}

            <div>
              <label htmlFor="login-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                {isBn ? 'ইমেইল' : 'Email'}
              </label>
              <div className="relative">
                <Mail
                  className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => onEmailChange(e.target.value)}
                  placeholder="name@yourbusiness.com"
                  className="w-full h-11 pl-10 pr-3.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20 focus:border-[#0F766E] transition-colors"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-pass" className="block text-xs font-medium text-slate-700 mb-1.5">
                {isBn ? 'পাসওয়ার্ড' : 'Password'}
              </label>
              <div className="relative">
                <Lock
                  className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="login-pass"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => onPasswordChange(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-11 pl-10 pr-11 text-sm text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20 focus:border-[#0F766E] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? (isBn ? 'পাসওয়ার্ড লুকান' : 'Hide password') : isBn ? 'পাসওয়ার্ড দেখুন' : 'Show password'}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 inline-flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-11 mt-1 inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-[#0F766E] hover:bg-[#115E59] active:scale-[0.99] disabled:opacity-60 rounded-xl transition-all"
            >
              <span>
                {submitting
                  ? isBn
                    ? 'যাচাই হচ্ছে...'
                    : 'Signing in...'
                  : isBn
                    ? 'প্রবেশ করুন'
                    : 'Sign In'}
              </span>
              {!submitting && <ArrowRight className="w-4 h-4" />}
            </button>

            {canQuickResume && onQuickResume && (
              <button
                type="button"
                onClick={onQuickResume}
                className="w-full h-10 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors"
              >
                {isBn ? 'পাসওয়ার্ড ছাড়াই ফিরুন' : 'Return to Workspace'}
              </button>
            )}
          </form>
        </div>

        {/* Quiet Spacer for Balanced Vertical Centering */}
        <div className="h-6" aria-hidden="true" />
      </section>
    </div>
  );
}

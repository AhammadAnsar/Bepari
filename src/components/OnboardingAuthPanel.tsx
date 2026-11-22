import React, { useState } from 'react';
import { apiRequest, ApiErrorPayload, setSessionToken } from '../api/client.ts';
import { Language } from '../i18n/translations.ts';

export interface UserSessionContext {
  user: {
    id: string;
    authSubject: string;
    displayName: string;
    email: string | null;
  };
  sessionId: string;
  activeOrganizationId: string | null;
  activeBranchId: string | null;
  activeRole: string | null;
  permissions: string[];
  memberships: Array<{
    membershipId: string;
    organizationId: string;
    legalName: string;
    tradeName: string | null;
    baseCurrency: string;
    timezone: string;
    reportingLanguage: string;
    roleCode: string;
    status: string;
    branches: Array<{
      id: string;
      code: string;
      name: string;
      isActive: boolean;
    }>;
  }>;
}

interface OnboardingAuthPanelProps {
  lang: Language;
  sessionContext: UserSessionContext | null;
  dbReady: boolean;
  onSessionUpdated: (ctx: UserSessionContext | null) => void;
}

export const OnboardingAuthPanel: React.FC<OnboardingAuthPanelProps> = ({
  lang,
  sessionContext,
  dbReady,
  onSessionUpdated,
}) => {
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<ApiErrorPayload | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);

  // Organization bootstrap state
  const [legalName, setLegalName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [branchCode, setBranchCode] = useState('DHK-HQ');
  const [branchName, setBranchName] = useState('ঢাকা প্রধান কার্যালয়');
  const [fiscalPeriodCode, setFiscalPeriodCode] = useState('FY-2026-27');
  const [fiscalStartsOn, setFiscalStartsOn] = useState('2026-07-01');
  const [fiscalEndsOn, setFiscalEndsOn] = useState('2027-06-30');
  const [taxRegistrationClass, setTaxRegistrationClass] = useState<
    'registered' | 'turnover_enlisted' | 'unregistered' | 'special' | 'pending_review'
  >('pending_review');
  const [bin, setBin] = useState('');
  const [tin, setTin] = useState('');
  const [orgError, setOrgError] = useState<ApiErrorPayload | null>(null);
  const [orgSuccessMsg, setOrgSuccessMsg] = useState<string | null>(null);
  const [isSubmittingOrg, setIsSubmittingOrg] = useState(false);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsSubmittingAuth(true);

    try {
      const endpoint =
        authMode === 'register' ? '/api/v1/auth/register' : '/api/v1/auth/login';
      const payload =
        authMode === 'register'
          ? { email, displayName, password }
          : { email, password };

      const res = await apiRequest<{
        token: string;
        expiresAt: string;
        context: UserSessionContext;
      }>(endpoint, {
        method: 'POST',
        body: payload,
      });

      if (!res.ok || !res.data) {
        setAuthError(
          res.error || {
            code: 'AUTH_FAILED',
            message:
              lang === 'bn'
                ? 'প্রমাণীকরণ সম্পন্ন করা যায়নি।'
                : 'Authentication request failed.',
          }
        );
        return;
      }

      setSessionToken(res.data.token);
      onSessionUpdated(res.data.context);
      setPassword('');
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleOrgBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrgError(null);
    setOrgSuccessMsg(null);
    setIsSubmittingOrg(true);

    try {
      const res = await apiRequest<{
        context: UserSessionContext;
      }>('/api/v1/organizations', {
        method: 'POST',
        body: {
          legalName,
          tradeName: tradeName || undefined,
          baseCurrency: 'BDT',
          timezone: 'Asia/Dhaka',
          reportingLanguage: lang,
          branchCode,
          branchName,
          fiscalPeriodCode,
          fiscalStartsOn,
          fiscalEndsOn,
          taxRegistrationClass,
          bin: bin || undefined,
          tin: tin || undefined,
        },
      });

      if (!res.ok || !res.data) {
        setOrgError(
          res.error || {
            code: 'ORG_BOOTSTRAP_FAILED',
            message:
              lang === 'bn'
                ? 'প্রতিষ্ঠান অনবোর্ডিং সম্পন্ন করা যায়নি।'
                : 'Organization bootstrap failed.',
          }
        );
        return;
      }

      onSessionUpdated(res.data.context);
      setLegalName('');
      setTradeName('');
      setOrgSuccessMsg(
        lang === 'bn'
          ? 'প্রতিষ্ঠান, প্রধান শাখা, হিসাবকাল এবং চার্ট অব অ্যাকাউন্টস সফলভাবে তৈরি হয়েছে।'
          : 'Organization, primary branch, fiscal period, and Chart of Accounts initialized.'
      );
    } finally {
      setIsSubmittingOrg(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="border-b border-[#E0E6E2] pb-4">
        <h1 className="text-xl font-semibold text-[#172326]">
          {lang === 'bn'
            ? 'নিরাপদ অ্যাকাউন্ট ও প্রতিষ্ঠান অনবোর্ডিং'
            : 'Secure Account & Organization Onboarding'}
        </h1>
        <p className="mt-1 text-sm text-[#5D686D]">
          {lang === 'bn'
            ? 'ব্যাপারীতে কোনো ডিফল্ট অ্যাডমিন পাসওয়ার্ড, শেয়ার্ড ক্রেডেনশিয়াল বা ক্লায়েন্ট-সাইড বাইপাস নেই। সব সেশন সার্ভার-যাচাইকৃত।'
            : 'Bepari enforces real authentication with scrypt password hashing and server-verified membership scopes. No default passwords or bypasses exist.'}
        </p>
      </div>

      {!dbReady && (
        <div
          role="alert"
          className="rounded-lg border border-[#A65E13]/40 bg-[#FFFFFF] p-4 text-sm text-[#172326]"
        >
          <div className="font-semibold text-[#A65E13]">
            {lang === 'bn'
              ? 'ডাটাবেস সংযোগ স্থগিত (BLOCKED_DATABASE)'
              : 'Database Persistence Blocked (BLOCKED_DATABASE)'}
          </div>
          <p className="mt-1 text-[#5D686D]">
            {lang === 'bn'
              ? 'PostgreSQL ডাটাবেস সংযোগ না থাকায় ফর্ম সাবমিট করলে সার্ভার নিয়ম অনুযায়ী 503 BLOCKED_DATABASE রিটার্ন করবে। নিচে ফর্মের ফিল্ড ও ভ্যালিডেশন কাঠামো পরিদর্শন করতে পারেন।'
              : 'Because PostgreSQL environment variables are not configured, submitting these forms will fail closed with HTTP 503 BLOCKED_DATABASE as required by OPS-02.'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Step 1: User Account Authentication */}
        <section className="rounded-lg border border-[#E0E6E2] bg-[#FFFFFF] p-6">
          <div className="flex items-center justify-between border-b border-[#E0E6E2] pb-4">
            <div>
              <h2 className="text-base font-semibold text-[#172326]">
                {lang === 'bn'
                  ? '০১. ব্যবহারকারী প্রমাণীকরণ'
                  : '01. User Authentication'}
              </h2>
              <p className="mt-0.5 text-xs text-[#5D686D]">
                {lang === 'bn'
                  ? 'scrypt পাসওয়ার্ড হ্যাশিং ও ইন-মেমরি সেশন টোকেন'
                  : 'scrypt password hashing & in-memory bearer session'}
              </p>
            </div>

            <div className="flex items-center gap-1 rounded-md bg-[#F2F4F1] p-1">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setAuthError(null);
                }}
                className={`min-h-[36px] rounded px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  authMode === 'register'
                    ? 'bg-[#FFFFFF] text-[#172326] shadow-xs'
                    : 'text-[#5D686D] hover:text-[#172326]'
                }`}
              >
                {lang === 'bn' ? 'নিবন্ধন' : 'Register'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setAuthError(null);
                }}
                className={`min-h-[36px] rounded px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  authMode === 'login'
                    ? 'bg-[#FFFFFF] text-[#172326] shadow-xs'
                    : 'text-[#5D686D] hover:text-[#172326]'
                }`}
              >
                {lang === 'bn' ? 'সাইন ইন' : 'Sign In'}
              </button>
            </div>
          </div>

          {sessionContext ? (
            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-md bg-[#F2F4F1] p-4">
                <div className="font-medium text-[#172326]">
                  {sessionContext.user.displayName}
                </div>
                <div className="mt-1 text-xs text-[#5D686D]">
                  <span>{sessionContext.user.email}</span>
                  <span aria-hidden="true"> · </span>
                  <span>
                    {lang === 'bn' ? 'ভূমিকা: ' : 'Role: '}
                    {sessionContext.activeRole || (lang === 'bn' ? 'নির্ধারিত নয়' : 'Unassigned')}
                  </span>
                </div>
              </div>
              <p className="text-xs text-[#5D686D]">
                {lang === 'bn'
                  ? 'আপনি সফলভাবে সাইন ইন করেছেন। ডান পাশের ফর্ম থেকে নতুন প্রতিষ্ঠান যুক্ত করতে পারেন।'
                  : 'You are signed in. You can bootstrap an organization using Step 02.'}
              </p>
            </div>
          ) : (
            <form onSubmit={handleAuthSubmit} className="mt-4 space-y-4">
              {authMode === 'register' && (
                <div>
                  <label
                    htmlFor="auth-display-name"
                    className="block text-sm font-medium text-[#172326]"
                  >
                    {lang === 'bn' ? 'পূর্ণ নাম' : 'Full Name'}
                  </label>
                  <input
                    id="auth-display-name"
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={lang === 'bn' ? 'যেমন: আনসার আহম্মদ' : 'e.g. Ansar Ahammad'}
                    className="mt-1.5 block min-h-[44px] w-full rounded-md border border-[#E0E6E2] bg-[#FFFFFF] px-3 py-2 text-sm text-[#172326] placeholder:text-[#5D686D]/60"
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="auth-email"
                  className="block text-sm font-medium text-[#172326]"
                >
                  {lang === 'bn' ? 'ইমেইল ঠিকানা' : 'Email Address'}
                </label>
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@business.com.bd"
                  className="mt-1.5 block min-h-[44px] w-full rounded-md border border-[#E0E6E2] bg-[#FFFFFF] px-3 py-2 text-sm text-[#172326] placeholder:text-[#5D686D]/60"
                />
              </div>

              <div>
                <label
                  htmlFor="auth-password"
                  className="block text-sm font-medium text-[#172326]"
                >
                  {lang === 'bn' ? 'পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর)' : 'Password (min 8 chars)'}
                </label>
                <input
                  id="auth-password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1.5 block min-h-[44px] w-full rounded-md border border-[#E0E6E2] bg-[#FFFFFF] px-3 py-2 text-sm text-[#172326]"
                />
              </div>

              {authError && (
                <div
                  role="alert"
                  className="rounded-md border border-[#B42318]/30 bg-[#B42318]/5 p-3 text-xs text-[#B42318]"
                >
                  <div className="font-semibold">
                    {authError.code}
                  </div>
                  <div className="mt-1">
                    {lang === 'bn'
                      ? authError.message
                      : authError.messageEn || authError.message}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmittingAuth}
                className="min-h-[44px] w-full rounded-md bg-[#126B58] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0C5345] disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {isSubmittingAuth
                  ? lang === 'bn'
                    ? 'যাচাই করা হচ্ছে...'
                    : 'Verifying...'
                  : authMode === 'register'
                  ? lang === 'bn'
                    ? 'মালিক অ্যাকাউন্ট তৈরি করুন'
                    : 'Create Owner Account'
                  : lang === 'bn'
                  ? 'অ্যাকাউন্টে সাইন ইন করুন'
                  : 'Sign In to Account'}
              </button>
            </form>
          )}
        </section>

        {/* Step 2: Organization, Branch & Fiscal Period Bootstrap */}
        <section className="rounded-lg border border-[#E0E6E2] bg-[#FFFFFF] p-6">
          <div className="border-b border-[#E0E6E2] pb-4">
            <h2 className="text-base font-semibold text-[#172326]">
              {lang === 'bn'
                ? '০২. প্রতিষ্ঠান, প্রধান শাখা ও অর্থবছর স্থাপন'
                : '02. Organization, Branch & Fiscal Period Bootstrap'}
            </h2>
            <p className="mt-0.5 text-xs text-[#5D686D]">
              {lang === 'bn'
                ? 'একক ট্রানজ্যাকশনে প্রতিষ্ঠান, শাখা, হিসাবকাল, ভ্যাট প্রোফাইল ও চার্ট অব অ্যাকাউন্টস তৈরি হয়'
                : 'Atomically creates tenant, owner role grants, branch, warehouse, fiscal period, and COA'}
            </p>
          </div>

          <form onSubmit={handleOrgBootstrap} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="org-legal-name"
                  className="block text-sm font-medium text-[#172326]"
                >
                  {lang === 'bn' ? 'প্রতিষ্ঠানের আইনি নাম' : 'Legal Business Name'}
                </label>
                <input
                  id="org-legal-name"
                  type="text"
                  required
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder={lang === 'bn' ? 'যেমন: পদ্মা ট্রেডার্স লিমিটেড' : 'e.g. Padma Traders Ltd.'}
                  className="mt-1.5 block min-h-[44px] w-full rounded-md border border-[#E0E6E2] bg-[#FFFFFF] px-3 py-2 text-sm text-[#172326]"
                />
              </div>

              <div>
                <label
                  htmlFor="org-trade-name"
                  className="block text-sm font-medium text-[#172326]"
                >
                  {lang === 'bn' ? 'ট্রেড নাম (ঐচ্ছিক)' : 'Trade Name (Optional)'}
                </label>
                <input
                  id="org-trade-name"
                  type="text"
                  value={tradeName}
                  onChange={(e) => setTradeName(e.target.value)}
                  placeholder={lang === 'bn' ? 'যেমন: পদ্মা হার্ডওয়্যার' : 'e.g. Padma Hardware'}
                  className="mt-1.5 block min-h-[44px] w-full rounded-md border border-[#E0E6E2] bg-[#FFFFFF] px-3 py-2 text-sm text-[#172326]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="org-branch-code"
                  className="block text-sm font-medium text-[#172326]"
                >
                  {lang === 'bn' ? 'প্রধান শাখা কোড' : 'Primary Branch Code'}
                </label>
                <input
                  id="org-branch-code"
                  type="text"
                  required
                  value={branchCode}
                  onChange={(e) => setBranchCode(e.target.value)}
                  className="mt-1.5 block min-h-[44px] w-full rounded-md border border-[#E0E6E2] bg-[#FFFFFF] px-3 py-2 text-sm font-mono-tabular text-[#172326]"
                />
              </div>

              <div>
                <label
                  htmlFor="org-branch-name"
                  className="block text-sm font-medium text-[#172326]"
                >
                  {lang === 'bn' ? 'প্রধান শাখার নাম' : 'Primary Branch Name'}
                </label>
                <input
                  id="org-branch-name"
                  type="text"
                  required
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  className="mt-1.5 block min-h-[44px] w-full rounded-md border border-[#E0E6E2] bg-[#FFFFFF] px-3 py-2 text-sm text-[#172326]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="org-fiscal-code"
                  className="block text-sm font-medium text-[#172326]"
                >
                  {lang === 'bn' ? 'অর্থবছর কোড' : 'Fiscal Period Code'}
                </label>
                <input
                  id="org-fiscal-code"
                  type="text"
                  required
                  value={fiscalPeriodCode}
                  onChange={(e) => setFiscalPeriodCode(e.target.value)}
                  className="mt-1.5 block min-h-[44px] w-full rounded-md border border-[#E0E6E2] bg-[#FFFFFF] px-3 py-2 text-sm font-mono-tabular text-[#172326]"
                />
              </div>

              <div>
                <label
                  htmlFor="org-fiscal-start"
                  className="block text-sm font-medium text-[#172326]"
                >
                  {lang === 'bn' ? 'শুরুর তারিখ' : 'Start Date'}
                </label>
                <input
                  id="org-fiscal-start"
                  type="date"
                  required
                  value={fiscalStartsOn}
                  onChange={(e) => setFiscalStartsOn(e.target.value)}
                  className="mt-1.5 block min-h-[44px] w-full rounded-md border border-[#E0E6E2] bg-[#FFFFFF] px-3 py-2 text-sm font-mono-tabular text-[#172326]"
                />
              </div>

              <div>
                <label
                  htmlFor="org-fiscal-end"
                  className="block text-sm font-medium text-[#172326]"
                >
                  {lang === 'bn' ? 'শেষের তারিখ' : 'End Date'}
                </label>
                <input
                  id="org-fiscal-end"
                  type="date"
                  required
                  value={fiscalEndsOn}
                  onChange={(e) => setFiscalEndsOn(e.target.value)}
                  className="mt-1.5 block min-h-[44px] w-full rounded-md border border-[#E0E6E2] bg-[#FFFFFF] px-3 py-2 text-sm font-mono-tabular text-[#172326]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="org-tax-class"
                  className="block text-sm font-medium text-[#172326]"
                >
                  {lang === 'bn' ? 'ভ্যাট নিবন্ধন শ্রেণি' : 'VAT Registration Class'}
                </label>
                <select
                  id="org-tax-class"
                  value={taxRegistrationClass}
                  onChange={(e) =>
                    setTaxRegistrationClass(
                      e.target.value as
                        | 'registered'
                        | 'turnover_enlisted'
                        | 'unregistered'
                        | 'special'
                        | 'pending_review'
                    )
                  }
                  className="mt-1.5 block min-h-[44px] w-full rounded-md border border-[#E0E6E2] bg-[#FFFFFF] px-3 py-2 text-sm text-[#172326]"
                >
                  <option value="pending_review">
                    {lang === 'bn' ? 'পর্যালোচনাধীন (Pending Review)' : 'Pending Legal Review'}
                  </option>
                  <option value="registered">
                    {lang === 'bn' ? 'ভ্যাট নিবন্ধিত (Registered)' : 'VAT Registered'}
                  </option>
                  <option value="turnover_enlisted">
                    {lang === 'bn' ? 'টার্নওভার তালিকাভুক্ত (Turnover)' : 'Turnover Enlisted'}
                  </option>
                  <option value="unregistered">
                    {lang === 'bn' ? 'অনিবন্ধিত (Unregistered)' : 'Unregistered'}
                  </option>
                  <option value="special">
                    {lang === 'bn' ? 'বিশেষ শ্রেণি (Special)' : 'Special Regime'}
                  </option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="org-bin"
                  className="block text-sm font-medium text-[#172326]"
                >
                  {lang === 'bn' ? 'বিআইএন (BIN - ঐচ্ছিক)' : 'BIN (Optional)'}
                </label>
                <input
                  id="org-bin"
                  type="text"
                  value={bin}
                  onChange={(e) => setBin(e.target.value)}
                  placeholder="000000000-0000"
                  className="mt-1.5 block min-h-[44px] w-full rounded-md border border-[#E0E6E2] bg-[#FFFFFF] px-3 py-2 text-sm font-mono-tabular text-[#172326]"
                />
              </div>

              <div>
                <label
                  htmlFor="org-tin"
                  className="block text-sm font-medium text-[#172326]"
                >
                  {lang === 'bn' ? 'টিআইএন (TIN - ঐচ্ছিক)' : 'TIN (Optional)'}
                </label>
                <input
                  id="org-tin"
                  type="text"
                  value={tin}
                  onChange={(e) => setTin(e.target.value)}
                  placeholder="000000000000"
                  className="mt-1.5 block min-h-[44px] w-full rounded-md border border-[#E0E6E2] bg-[#FFFFFF] px-3 py-2 text-sm font-mono-tabular text-[#172326]"
                />
              </div>
            </div>

            {orgError && (
              <div
                role="alert"
                className="rounded-md border border-[#B42318]/30 bg-[#B42318]/5 p-3 text-xs text-[#B42318]"
              >
                <div className="font-semibold">{orgError.code}</div>
                <div className="mt-1">
                  {lang === 'bn'
                    ? orgError.message
                    : orgError.messageEn || orgError.message}
                </div>
              </div>
            )}

            {orgSuccessMsg && (
              <div
                role="status"
                className="rounded-md border border-[#126B58]/30 bg-[#126B58]/5 p-3 text-xs text-[#126B58]"
              >
                {orgSuccessMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmittingOrg}
              className="min-h-[44px] w-full rounded-md bg-[#126B58] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0C5345] disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {isSubmittingOrg
                ? lang === 'bn'
                  ? 'প্রতিষ্ঠান স্থাপন করা হচ্ছে...'
                  : 'Bootstrapping Organization...'
                : lang === 'bn'
                ? 'প্রতিষ্ঠান ও হিসাবকাল স্থাপন করুন'
                : 'Initialize Organization & Fiscal Period'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};

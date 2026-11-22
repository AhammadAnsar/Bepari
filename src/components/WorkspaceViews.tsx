import React, { useState } from 'react';
import { apiRequest } from '../api/client.ts';
import { Language, translations } from '../i18n/translations.ts';
import { UserSessionContext } from './OnboardingAuthPanel.tsx';
import { DEFAULT_ROLE_PERMISSIONS, ROLE_CODES, RoleCode } from '../server/shared/permissions.ts';
import type { EnvironmentValidationReport } from '../server/shared/config.ts';

export interface ReadinessResponse {
  ready: boolean;
  status: 'ready' | 'blocked';
  code: 'READY' | 'BLOCKED_DATABASE' | 'BLOCKED_AUTH_CONFIG';
  engine: 'postgresql';
  adapter: string;
  details: {
    cloudSqlEligibility?: string;
    requiredEnvVars?: string[];
    messageBn?: string;
    messageEn?: string;
  };
  environmentReport?: EnvironmentValidationReport;
}

export interface WorkspaceSummaryData {
  organizationId: string;
  hasPostedFinancialActivity: boolean;
  counts: {
    parties: number;
    items: number;
    accounts: number;
    postedJournals: number;
    branches: number;
    warehouses: number;
  };
  activeFiscalPeriod: {
    id: string;
    periodCode: string;
    startsOn: string;
    endsOn: string;
    status: string;
  } | null;
  taxCompliance: {
    status: string;
    registrationClass: string;
    legalIssuanceEnabled: boolean;
    noticeBn: string;
    noticeEn: string;
  };
}

interface HonestHomeViewProps {
  lang: Language;
  readiness: ReadinessResponse | null;
  summary: WorkspaceSummaryData | null;
  sessionContext: UserSessionContext | null;
  onNavigate: (viewId: string) => void;
  onRefreshReadiness: () => void;
}

export const HonestHomeView: React.FC<HonestHomeViewProps> = ({
  lang,
  readiness,
  summary,
  sessionContext,
  onNavigate,
  onRefreshReadiness,
}) => {
  const t = translations[lang];

  return (
    <div className="space-y-8">
      {/* Screen Header answering: What needs my attention today? */}
      <div className="flex flex-col justify-between gap-4 border-b border-[#E0E6E2] pb-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-xl font-semibold text-[#172326]">
            {t.homeScreen.question}
          </h1>
          <p className="mt-1 text-sm text-[#5D686D]">
            {t.homeScreen.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() =>
              onNavigate(
                sessionContext?.activeOrganizationId ? 'parties' : 'onboarding'
              )
            }
            className="min-h-[44px] rounded-md bg-[#126B58] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0C5345] whitespace-nowrap shrink-0"
          >
            {sessionContext?.activeOrganizationId
              ? t.homeScreen.primaryCtaParties
              : t.homeScreen.primaryCtaOnboarding}
          </button>
        </div>
      </div>

      {/* Live Backend Readiness & Persistence Gate Banner */}
      {readiness && !readiness.ready && (
        <section
          aria-labelledby="db-gate-heading"
          className="rounded-lg border border-[#A65E13]/40 bg-[#FFFFFF] p-6"
        >
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div className="space-y-2">
              <div className="text-xs font-medium text-[#A65E13]">
                <span>{readiness.code}</span>
                <span aria-hidden="true"> · </span>
                <span>PostgreSQL (Drizzle ORM)</span>
                <span aria-hidden="true"> · </span>
                <span>Fail-Closed Gate (OPS-02)</span>
              </div>
              <h2
                id="db-gate-heading"
                className="text-base font-semibold text-[#172326]"
              >
                {lang === 'bn'
                  ? 'PostgreSQL ডাটাবেস সংযোগের অপেক্ষায় (কোনো কৃত্রিম বা লোকালস্টোরেজ ফলব্যাক নেই)'
                  : 'Awaiting PostgreSQL Connection (Zero Fake or LocalStorage Fallbacks)'}
              </h2>
              <p className="text-sm text-[#5D686D] max-w-3xl">
                {lang === 'bn'
                  ? readiness.details.messageBn
                  : readiness.details.messageEn}
              </p>
              {readiness.details.cloudSqlEligibility && (
                <div className="pt-1 text-xs text-[#5D686D] font-mono-tabular">
                  Cloud SQL CheckFeatureEligibility: {readiness.details.cloudSqlEligibility}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onRefreshReadiness}
              className="min-h-[44px] rounded-md border border-[#E0E6E2] bg-[#FAFAF8] px-4 py-2 text-xs font-medium text-[#172326] transition-colors hover:bg-[#F2F4F1] whitespace-nowrap shrink-0"
            >
              {lang === 'bn' ? 'সংযোগ পুনরায় যাচাই করুন' : 'Re-check Readiness'}
            </button>
          </div>
        </section>
      )}

      {/* Honest Foundation Record Counts (Strictly from DB or '—' when unconnected; NEVER fabricated money) */}
      <section aria-labelledby="ledger-status-heading" className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h2
            id="ledger-status-heading"
            className="text-sm font-semibold text-[#172326]"
          >
            {lang === 'bn'
              ? 'লেজার ও মাস্টার ডাটা ভিত্তি (Phase 0)'
              : 'Ledger & Master Data Foundation (Phase 0)'}
          </h2>
          <span className="text-xs text-[#5D686D]">
            {t.homeScreen.unseededNotice}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-[#E0E6E2] bg-[#FFFFFF] p-4">
            <div className="text-xs text-[#5D686D]">
              {t.homeScreen.metrics.postedJournals}
            </div>
            <div className="mt-2 text-2xl font-semibold text-[#172326] font-mono-tabular">
              {summary ? summary.counts.postedJournals : '—'}
            </div>
            <div className="mt-1 text-xs text-[#5D686D]">
              {summary
                ? lang === 'bn'
                  ? 'যাচাইকৃত পোস্টেড জার্নাল'
                  : 'Verified posted entries'
                : lang === 'bn'
                ? 'ডাটাবেস সংযোগের পর প্রদর্শিত হবে'
                : 'Displayed after DB connection'}
            </div>
          </div>

          <div className="rounded-lg border border-[#E0E6E2] bg-[#FFFFFF] p-4">
            <div className="text-xs text-[#5D686D]">
              {t.homeScreen.metrics.activeParties}
            </div>
            <div className="mt-2 text-2xl font-semibold text-[#172326] font-mono-tabular">
              {summary ? summary.counts.parties : '—'}
            </div>
            <div className="mt-1 text-xs text-[#5D686D]">
              {lang === 'bn'
                ? 'একক পরিচয় (গ্রাহক/সরবরাহকারী)'
                : 'Unified party records'}
            </div>
          </div>

          <div className="rounded-lg border border-[#E0E6E2] bg-[#FFFFFF] p-4">
            <div className="text-xs text-[#5D686D]">
              {t.homeScreen.metrics.catalogItems}
            </div>
            <div className="mt-2 text-2xl font-semibold text-[#172326] font-mono-tabular">
              {summary ? summary.counts.items : '—'}
            </div>
            <div className="mt-1 text-xs text-[#5D686D]">
              {lang === 'bn' ? 'পণ্য ও সেবা ক্যাটালগ' : 'Product & service SKU catalog'}
            </div>
          </div>

          <div className="rounded-lg border border-[#E0E6E2] bg-[#FFFFFF] p-4">
            <div className="text-xs text-[#5D686D]">
              {t.homeScreen.metrics.chartAccounts}
            </div>
            <div className="mt-2 text-2xl font-semibold text-[#172326] font-mono-tabular">
              {summary ? summary.counts.accounts : '—'}
            </div>
            <div className="mt-1 text-xs text-[#5D686D]">
              {lang === 'bn'
                ? 'কন্ট্রোল ও লেজার অ্যাকাউন্ট'
                : 'Control & ledger accounts'}
            </div>
          </div>
        </div>
      </section>

      {/* Honest Empty Ledger Workspace Card */}
      <section className="rounded-lg border border-[#E0E6E2] bg-[#FFFFFF] p-6">
        <div className="max-w-2xl space-y-3">
          <div className="text-xs text-[#5D686D]">
            <span>{lang === 'bn' ? 'আর্থিক সারসংক্ষেপ' : 'Financial Summary'}</span>
            <span aria-hidden="true"> · </span>
            <span>
              {summary?.activeFiscalPeriod
                ? `${summary.activeFiscalPeriod.periodCode} (${summary.activeFiscalPeriod.startsOn} → ${summary.activeFiscalPeriod.endsOn})`
                : lang === 'bn'
                ? 'কোনো সক্রিয় হিসাবকাল নেই'
                : 'No active fiscal period'}
            </span>
          </div>
          <h3 className="text-base font-semibold text-[#172326]">
            {t.homeScreen.emptyLedgerTitle}
          </h3>
          <p className="text-sm text-[#5D686D]">
            {t.homeScreen.emptyLedgerBody}
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => onNavigate('accounting')}
              className="min-h-[44px] rounded-md border border-[#E0E6E2] bg-[#FAFAF8] px-4 py-2 text-xs font-medium text-[#172326] transition-colors hover:bg-[#F2F4F1] whitespace-nowrap shrink-0"
            >
              {lang === 'bn'
                ? 'চার্ট অব অ্যাকাউন্টস ও লেজার নীতিমালা'
                : 'Chart of Accounts & Ledger Rules'}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('admin')}
              className="min-h-[44px] rounded-md border border-[#E0E6E2] bg-[#FAFAF8] px-4 py-2 text-xs font-medium text-[#172326] transition-colors hover:bg-[#F2F4F1] whitespace-nowrap shrink-0"
            >
              {lang === 'bn'
                ? 'শাখা ও ভূমিকা অনুমতি ম্যাট্রিক্স দেখুন'
                : 'Inspect Branches & Role Permission Matrix'}
            </button>
          </div>
        </div>
      </section>

      {/* Environment Configuration & Integration Readiness Matrix */}
      {readiness?.environmentReport && (
        <section
          aria-labelledby="env-readiness-heading"
          className="rounded-lg border border-[#E0E6E2] bg-[#FFFFFF] p-6 space-y-6"
        >
          <div className="flex flex-col gap-1 border-b border-[#E0E6E2] pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2
                id="env-readiness-heading"
                className="text-base font-semibold text-[#172326]"
              >
                {lang === 'bn'
                  ? 'এনভায়রনমেন্ট কনফিগারেশন ও ইন্টিগ্রেশন প্রস্তুতি প্রতিবেদন'
                  : 'Environment Configuration & Integration Readiness Report'}
              </h2>
              <p className="mt-0.5 text-xs text-[#5D686D]">
                {lang === 'bn'
                  ? 'আবশ্যক, নিরাপদ ডিফল্ট এবং ঐচ্ছিক (পরবর্তী ধাপের) সার্ভিসসমূহের সার্ভার-যাচাইকৃত অবস্থা (কোনো গোপন কী ব্রাউজারে প্রকাশ করা হয় না)'
                  : 'Server-validated status of mandatory, safe-default, and optional integrations (no secret values are ever exposed to the browser)'}
              </p>
            </div>
            <div className="text-xs font-mono-tabular text-[#5D686D]">
              <span>LOG_LEVEL={readiness.environmentReport.logLevel}</span>
              <span aria-hidden="true"> · </span>
              <span>TRUSTED_PROXY_HOPS={readiness.environmentReport.trustedProxyHops}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Environment Variables Table */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-[#172326]">
                {lang === 'bn'
                  ? '০১. এনভায়রনমেন্ট ভ্যারিয়েবল শ্রেণিবিন্যাস'
                  : '01. Environment Variable Classification'}
              </h3>
              <div className="divide-y divide-[#E0E6E2] border-t border-b border-[#E0E6E2]">
                {readiness.environmentReport.variables.map((v) => (
                  <div key={v.key} className="py-3 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-tabular font-semibold text-[#172326]">
                        {v.key}
                      </span>
                      <span
                        className={
                          v.configured
                            ? 'text-[#126B58] font-medium'
                            : v.requirementLevel === 'mandatory_now'
                            ? 'text-[#A65E13] font-medium'
                            : 'text-[#5D686D]'
                        }
                      >
                        {v.requirementLevel === 'mandatory_now'
                          ? lang === 'bn'
                            ? v.configured
                              ? 'আবশ্যক · কনফিগারকৃত'
                              : 'আবশ্যক · অনুপস্থিত'
                            : v.configured
                            ? 'Required Now · Configured'
                            : 'Required Now · Missing'
                          : v.requirementLevel === 'safe_default'
                          ? lang === 'bn'
                            ? 'নিরাপদ ডিফল্ট সক্রিয়'
                            : 'Safe Default Active'
                          : lang === 'bn'
                          ? v.configured
                            ? 'ঐচ্ছিক · সংযুক্ত'
                            : 'ঐচ্ছিক · পরে কনফিগারযোগ্য'
                          : v.configured
                          ? 'Optional · Configured'
                          : 'Optional · Configure Later'}
                      </span>
                    </div>
                    <p className="text-[#5D686D]">
                      {lang === 'bn' ? v.actionableMessageBn : v.actionableMessageEn}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Operational Integrations Status */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-[#172326]">
                {lang === 'bn'
                  ? '০২. ইন্টিগ্রেশন ও অবকাঠামোর কার্যকরী অবস্থা'
                  : '02. Integration & Infrastructure Operational Status'}
              </h3>
              <div className="divide-y divide-[#E0E6E2] border-t border-b border-[#E0E6E2]">
                {readiness.environmentReport.integrations.map((intg) => (
                  <div key={intg.id} className="py-3 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#172326]">
                        {lang === 'bn' ? intg.nameBn : intg.nameEn}
                      </span>
                      <span
                        className={
                          intg.status === 'operational'
                            ? 'text-[#126B58] font-medium'
                            : intg.status === 'blocked_missing_config'
                            ? 'text-[#A65E13] font-medium'
                            : 'text-[#5D686D]'
                        }
                      >
                        {intg.status === 'operational'
                          ? lang === 'bn'
                            ? 'সচল (Operational)'
                            : 'Operational'
                          : intg.status === 'blocked_missing_config'
                          ? lang === 'bn'
                            ? 'স্থগিত (Blocked)'
                            : 'Blocked (Missing Config)'
                          : lang === 'bn'
                          ? 'নিরাপদে নিষ্ক্রিয় (Optional)'
                          : 'Gracefully Disabled (Optional)'}
                      </span>
                    </div>
                    <p className="text-[#5D686D]">
                      {lang === 'bn' ? intg.detailsBn : intg.detailsEn}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

interface AdminAndPermissionsViewProps {
  lang: Language;
  sessionContext: UserSessionContext | null;
  onBranchCreated: () => void;
}

export const AdminAndPermissionsView: React.FC<AdminAndPermissionsViewProps> = ({
  lang,
  sessionContext,
  onBranchCreated,
}) => {
  const [selectedRole, setSelectedRole] = useState<RoleCode>('owner');
  const [branchCode, setBranchCode] = useState('');
  const [branchName, setBranchName] = useState('');
  const [branchMsg, setBranchMsg] = useState<string | null>(null);
  const [branchErr, setBranchErr] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const activeOrg = sessionContext?.memberships.find(
    (m) => m.organizationId === sessionContext.activeOrganizationId
  );

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    setBranchMsg(null);
    setBranchErr(null);
    setIsCreating(true);
    try {
      const res = await apiRequest('/api/v1/branches', {
        method: 'POST',
        body: { code: branchCode, name: branchName },
      });
      if (!res.ok) {
        setBranchErr(
          res.error?.message ||
            (lang === 'bn' ? 'শাখা তৈরি করা যায়নি।' : 'Failed to create branch.')
        );
        return;
      }
      setBranchCode('');
      setBranchName('');
      setBranchMsg(
        lang === 'bn' ? 'নতুন শাখা সফলভাবে যুক্ত হয়েছে।' : 'New branch created.'
      );
      onBranchCreated();
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="border-b border-[#E0E6E2] pb-4">
        <h1 className="text-xl font-semibold text-[#172326]">
          {lang === 'bn'
            ? 'প্রতিষ্ঠানের শাখা, ভূমিকা ও সার্ভার-সাইড অনুমতি ম্যাট্রিক্স'
            : 'Organization Branches, Roles & Server-Side Permission Matrix'}
        </h1>
        <p className="mt-1 text-sm text-[#5D686D]">
          {lang === 'bn'
            ? 'প্রতিটি API অনুরোধে ব্যবহারকারীর সেশন, সক্রিয় প্রতিষ্ঠানের সদস্যপদ এবং ভূমিকার অনুমতি সার্ভার-সাইডে যাচাই করা হয়।'
            : 'Every API request verifies user identity, active organization membership, and role permission scopes on the server.'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Branch Directory & Creation */}
        <section className="rounded-lg border border-[#E0E6E2] bg-[#FFFFFF] p-6">
          <h2 className="text-base font-semibold text-[#172326]">
            {lang === 'bn' ? 'শাখা ব্যবস্থাপনা' : 'Branch Directory'}
          </h2>
          <p className="mt-1 text-xs text-[#5D686D]">
            {lang === 'bn'
              ? 'প্রতিটি ডকুমেন্ট ও জার্নাল এন্ট্রি কম্পোজিট ফরেন কি (organization_id, branch_id) দ্বারা সুরক্ষিত।'
              : 'All documents and journal entries enforce composite tenant foreign keys (organization_id, branch_id).'}
          </p>

          {activeOrg && activeOrg.branches.length > 0 ? (
            <div className="mt-4 divide-y divide-[#E0E6E2] border-t border-b border-[#E0E6E2]">
              {activeOrg.branches.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between py-3 text-sm"
                >
                  <div>
                    <span className="font-medium text-[#172326]">{b.name}</span>
                    <span className="ml-2 font-mono-tabular text-xs text-[#5D686D]">
                      ({b.code})
                    </span>
                  </div>
                  <span className="text-xs text-[#5D686D]">
                    {b.isActive
                      ? lang === 'bn'
                        ? 'সক্রিয়'
                        : 'Active'
                      : lang === 'bn'
                      ? 'নিষ্ক্রিয়'
                      : 'Inactive'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-md bg-[#F2F4F1] p-4 text-xs text-[#5D686D]">
              {lang === 'bn'
                ? 'কোনো সক্রিয় প্রতিষ্ঠান নির্বাচন করা হয়নি। অনবোর্ডিং সম্পন্ন করলে প্রধান শাখা এখানে দেখা যাবে।'
                : 'No active organization selected. Complete onboarding to view and add branches.'}
            </div>
          )}

          <form onSubmit={handleCreateBranch} className="mt-5 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="new-branch-code"
                  className="block text-xs font-medium text-[#172326]"
                >
                  {lang === 'bn' ? 'শাখা কোড' : 'Branch Code'}
                </label>
                <input
                  id="new-branch-code"
                  type="text"
                  required
                  value={branchCode}
                  onChange={(e) => setBranchCode(e.target.value)}
                  placeholder="CTG-01"
                  className="mt-1 block min-h-[40px] w-full rounded-md border border-[#E0E6E2] bg-[#FFFFFF] px-3 py-1.5 text-sm font-mono-tabular text-[#172326]"
                />
              </div>
              <div>
                <label
                  htmlFor="new-branch-name"
                  className="block text-xs font-medium text-[#172326]"
                >
                  {lang === 'bn' ? 'শাখার নাম' : 'Branch Name'}
                </label>
                <input
                  id="new-branch-name"
                  type="text"
                  required
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  placeholder={lang === 'bn' ? 'চট্টগ্রাম আগ্রাবাদ শাখা' : 'Chattogram Agrabad Branch'}
                  className="mt-1 block min-h-[40px] w-full rounded-md border border-[#E0E6E2] bg-[#FFFFFF] px-3 py-1.5 text-sm text-[#172326]"
                />
              </div>
            </div>

            {branchErr && (
              <div className="text-xs text-[#B42318]" role="alert">
                {branchErr}
              </div>
            )}
            {branchMsg && (
              <div className="text-xs text-[#126B58]" role="status">
                {branchMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={isCreating}
              className="min-h-[44px] rounded-md bg-[#126B58] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#0C5345] disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {lang === 'bn' ? 'নতুন শাখা যুক্ত করুন' : 'Add Branch'}
            </button>
          </form>
        </section>

        {/* Role Permission Scope Inspector */}
        <section className="rounded-lg border border-[#E0E6E2] bg-[#FFFFFF] p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-base font-semibold text-[#172326]">
                {lang === 'bn' ? 'ভূমিকা ভিত্তিক অনুমতি স্কোপ' : 'Role Permission Scopes'}
              </h2>
              <p className="mt-0.5 text-xs text-[#5D686D]">
                {lang === 'bn'
                  ? 'অননুমোদিত অ্যাকশন 403 Forbidden এবং audit_events টেবিলে লগ তৈরি করে (AUTH-03)'
                  : 'Unauthorized actions return 403 Forbidden and append an audit event (AUTH-03)'}
              </p>
            </div>

            <div>
              <label htmlFor="role-inspector-select" className="sr-only">
                {lang === 'bn' ? 'ভূমিকা নির্বাচন করুন' : 'Select Role'}
              </label>
              <select
                id="role-inspector-select"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as RoleCode)}
                className="min-h-[40px] rounded-md border border-[#E0E6E2] bg-[#FAFAF8] px-3 py-1.5 text-xs font-medium text-[#172326]"
              >
                {ROLE_CODES.map((rc) => (
                  <option key={rc} value={rc}>
                    {rc.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 max-h-72 overflow-y-auto border-t border-[#E0E6E2] pt-3">
            {DEFAULT_ROLE_PERMISSIONS[selectedRole].length === 0 ? (
              <p className="text-xs text-[#5D686D]">
                {lang === 'bn'
                  ? 'এই কাস্টম ভূমিকায় ডিফল্ট কোনো অনুমতি নেই। অ্যাডমিন সুনির্দিষ্ট অনুমতি প্রদান করবেন।'
                  : 'No default permissions granted for custom role until explicitly assigned.'}
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {DEFAULT_ROLE_PERMISSIONS[selectedRole].map((perm) => (
                  <li
                    key={perm}
                    className="flex items-center justify-between border-b border-[#E0E6E2]/60 py-1.5 text-xs"
                  >
                    <span className="font-mono-tabular text-[#172326]">{perm}</span>
                    <span className="text-[#126B58]">
                      {lang === 'bn' ? 'অনুমোদিত' : 'Allowed'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

interface PhaseGatedWorkspaceViewProps {
  lang: Language;
  titleBn: string;
  titleEn: string;
  phaseNumber: number;
  summaryBn: string;
  summaryEn: string;
  invariants: Array<{ bn: string; en: string }>;
  onReturnHome: () => void;
}

export const PhaseGatedWorkspaceView: React.FC<PhaseGatedWorkspaceViewProps> = ({
  lang,
  titleBn,
  titleEn,
  phaseNumber,
  summaryBn,
  summaryEn,
  invariants,
  onReturnHome,
}) => {
  return (
    <div className="space-y-6">
      <div className="border-b border-[#E0E6E2] pb-4">
        <div className="text-xs text-[#5D686D]">
          <span>{lang === 'bn' ? `ধাপ ${phaseNumber}` : `Phase ${phaseNumber}`}</span>
          <span aria-hidden="true"> · </span>
          <span>
            {lang === 'bn'
              ? 'পর্যায়ক্রমিক আর্কিটেকচার গেট'
              : 'Phased Architecture Gate'}
          </span>
        </div>
        <h1 className="mt-1 text-xl font-semibold text-[#172326]">
          {lang === 'bn' ? titleBn : titleEn}
        </h1>
        <p className="mt-1 text-sm text-[#5D686D]">
          {lang === 'bn' ? summaryBn : summaryEn}
        </p>
      </div>

      <section className="rounded-lg border border-[#E0E6E2] bg-[#FFFFFF] p-6">
        <h2 className="text-sm font-semibold text-[#172326]">
          {lang === 'bn'
            ? 'এই মডিউলের বাধ্যতামূলক ডোমেইন ও হিসাবরক্ষণ শর্তাবলি'
            : 'Mandatory Domain & Accounting Invariants for This Workspace'}
        </h2>
        <ul className="mt-3 space-y-2.5 text-sm text-[#5D686D]">
          {invariants.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2.5">
              <span className="font-mono-tabular text-xs font-semibold text-[#126B58]">
                0{idx + 1}.
              </span>
              <span>{lang === 'bn' ? item.bn : item.en}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6 pt-4 border-t border-[#E0E6E2] flex items-center gap-3">
          <button
            type="button"
            onClick={onReturnHome}
            className="min-h-[44px] rounded-md border border-[#E0E6E2] bg-[#FAFAF8] px-4 py-2 text-xs font-medium text-[#172326] transition-colors hover:bg-[#F2F4F1] whitespace-nowrap shrink-0"
          >
            {lang === 'bn' ? 'হোম স্ক্রিনে ফিরে যান' : 'Return to Home Workspace'}
          </button>
        </div>
      </section>
    </div>
  );
};

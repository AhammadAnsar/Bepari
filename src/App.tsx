import React, { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FolderKanban,
  Home,
  Landmark,
  Layers,
  Menu,
  Package,
  Plus,
  Receipt,
  Scale,
  Search,
  ShieldCheck,
  ShoppingCart,
  Users,
  X,
} from 'lucide-react';
import { apiRequest, setSessionToken } from './api/client.ts';
import {
  OnboardingAuthPanel,
  UserSessionContext,
} from './components/OnboardingAuthPanel.tsx';
import {
  AdminAndPermissionsView,
  HonestHomeView,
  PhaseGatedWorkspaceView,
  ReadinessResponse,
  WorkspaceSummaryData,
} from './components/WorkspaceViews.tsx';
import { Language, translations } from './i18n/translations.ts';

type WorkspaceId =
  | 'home'
  | 'onboarding'
  | 'sales'
  | 'purchases'
  | 'money'
  | 'parties'
  | 'catalog'
  | 'inventory'
  | 'accounting'
  | 'vat'
  | 'reports'
  | 'admin'
  | 'more';

export default function App() {
  const [lang, setLang] = useState<Language>('bn');
  const [activeView, setActiveView] = useState<WorkspaceId>('home');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [newPickerOpen, setNewPickerOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [sessionContext, setSessionContext] =
    useState<UserSessionContext | null>(null);
  const [summary, setSummary] = useState<WorkspaceSummaryData | null>(null);

  const t = translations[lang];

  const fetchBackendReadiness = useCallback(async () => {
    const res = await apiRequest<ReadinessResponse>('/api/v1/ready?mode=ui');
    if (res.data) {
      setReadiness(res.data);
    } else if (res.error) {
      setReadiness({
        ready: false,
        status: 'blocked',
        code: 'BLOCKED_DATABASE',
        engine: 'postgresql',
        adapter: 'cloudsql-or-external-pg',
        details: (res.error.details as ReadinessResponse['details']) || {
          messageBn: res.error.message,
          messageEn: res.error.messageEn || res.error.message,
        },
      });
    }
  }, []);

  const fetchWorkspaceSummary = useCallback(async () => {
    if (!sessionContext?.activeOrganizationId) {
      setSummary(null);
      return;
    }
    const res = await apiRequest<WorkspaceSummaryData>(
      '/api/v1/dashboard/summary'
    );
    if (res.ok && res.data) {
      setSummary(res.data);
    }
  }, [sessionContext?.activeOrganizationId]);

  useEffect(() => {
    fetchBackendReadiness();
  }, [fetchBackendReadiness]);

  useEffect(() => {
    fetchWorkspaceSummary();
  }, [fetchWorkspaceSummary]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const activeMembership = sessionContext?.memberships.find(
    (m) => m.organizationId === sessionContext.activeOrganizationId
  );
  const activeBranch = activeMembership?.branches.find(
    (b) => b.id === sessionContext?.activeBranchId
  );

  const handleContextSwitch = async (
    organizationId: string,
    branchId: string | null
  ) => {
    const res = await apiRequest<UserSessionContext>('/api/v1/context/switch', {
      method: 'POST',
      body: { organizationId, branchId },
    });
    if (res.ok && res.data) {
      setSessionContext(res.data);
      setSwitcherOpen(false);
    }
  };

  const handleSignOut = async () => {
    await apiRequest('/api/v1/auth/logout', { method: 'POST' });
    setSessionToken(null);
    setSessionContext(null);
    setSummary(null);
    setSwitcherOpen(false);
  };

  const desktopNavGroups = [
    {
      groupLabel: t.navGroups.overview,
      items: [
        { id: 'home' as WorkspaceId, label: t.navItems.home, icon: Home },
        {
          id: 'onboarding' as WorkspaceId,
          label: t.navItems.onboarding,
          icon: Building2,
        },
      ],
    },
    {
      groupLabel: t.navGroups.transactions,
      items: [
        { id: 'sales' as WorkspaceId, label: t.navItems.sales, icon: Receipt },
        {
          id: 'purchases' as WorkspaceId,
          label: t.navItems.purchases,
          icon: ShoppingCart,
        },
        { id: 'money' as WorkspaceId, label: t.navItems.money, icon: Landmark },
      ],
    },
    {
      groupLabel: t.navGroups.peopleItems,
      items: [
        { id: 'parties' as WorkspaceId, label: t.navItems.parties, icon: Users },
        { id: 'catalog' as WorkspaceId, label: t.navItems.catalog, icon: Package },
        {
          id: 'inventory' as WorkspaceId,
          label: t.navItems.inventory,
          icon: Layers,
        },
      ],
    },
    {
      groupLabel: t.navGroups.finance,
      items: [
        {
          id: 'accounting' as WorkspaceId,
          label: t.navItems.accounting,
          icon: Scale,
        },
        {
          id: 'reports' as WorkspaceId,
          label: t.navItems.reports,
          icon: FileSpreadsheet,
        },
      ],
    },
    {
      groupLabel: t.navGroups.compliance,
      items: [
        {
          id: 'vat' as WorkspaceId,
          label: t.navItems.vat,
          icon: FolderKanban,
        },
      ],
    },
    {
      groupLabel: t.navGroups.administration,
      items: [
        {
          id: 'admin' as WorkspaceId,
          label: t.navItems.admin,
          icon: ShieldCheck,
        },
      ],
    },
  ];

  const renderMainWorkspace = () => {
    switch (activeView) {
      case 'home':
        return (
          <HonestHomeView
            lang={lang}
            readiness={readiness}
            summary={summary}
            sessionContext={sessionContext}
            onNavigate={(v) => setActiveView(v as WorkspaceId)}
            onRefreshReadiness={fetchBackendReadiness}
          />
        );
      case 'onboarding':
        return (
          <OnboardingAuthPanel
            lang={lang}
            sessionContext={sessionContext}
            dbReady={Boolean(readiness?.ready)}
            onSessionUpdated={(ctx) => {
              setSessionContext(ctx);
              fetchBackendReadiness();
            }}
          />
        );
      case 'admin':
        return (
          <AdminAndPermissionsView
            lang={lang}
            sessionContext={sessionContext}
            onBranchCreated={async () => {
              const meRes = await apiRequest<UserSessionContext>('/api/v1/me');
              if (meRes.ok && meRes.data) {
                setSessionContext(meRes.data);
              }
            }}
          />
        );
      case 'parties':
        return (
          <PhaseGatedWorkspaceView
            lang={lang}
            titleBn="গ্রাহক ও সরবরাহকারী (একক পার্টি মাস্টার)"
            titleEn="Customers & Suppliers (Unified Party Master)"
            phaseNumber={1}
            summaryBn="একই ব্যবসায়িক সত্তা একাধারে গ্রাহক এবং সরবরাহকারী হতে পারে। কোনো ডুপ্লিকেট পরিচয় তৈরি না করে কম্পোজিট টেন্যান্ট ফরেন কি-এর মাধ্যমে পার্টি লেজার পরিচালিত হবে।"
            summaryEn="A single business party can hold customer and supplier roles simultaneously without duplicating identity, guarded by composite tenant foreign keys."
            invariants={[
              {
                bn: 'টেন্যান্ট-স্কোপড ফরেন কি (organization_id, party_id) অন্য প্রতিষ্ঠানের গ্রাহকের সাথে ইনভয়েস সংযুক্ত করা প্রতিরোধ করে।',
                en: 'Tenant-scoped FK (organization_id, party_id) blocks linking an invoice to another organization’s party.',
              },
              {
                bn: 'সফট আর্কাইভাল ব্যবহৃত হয়; পূর্ববর্তী ইনভয়েস বা জার্নালে সংযুক্ত কোনো পার্টি কখনোই হার্ড-ডিলিট করা হয় না।',
                en: 'Master data uses soft archival; referenced parties are never hard-deleted.',
              },
              {
                bn: 'বকেয়া ব্যালেন্স সরাসরি এডিট করা যায় না; কেবল পোস্টকৃত জার্নাল ও পেমেন্ট অ্যালোকেশন থেকে হিসাব করা হয়।',
                en: 'Party balances are never mutated directly; they derive strictly from posted journals and allocations.',
              },
            ]}
            onReturnHome={() => setActiveView('home')}
          />
        );
      case 'catalog':
        return (
          <PhaseGatedWorkspaceView
            lang={lang}
            titleBn="পণ্য, সেবা ও একক ক্যাটালগ"
            titleEn="Products, Services & Units Catalog"
            phaseNumber={1}
            summaryBn="পণ্য ও সেবার SKU, একক (পিস, কেজি, লিটার, বক্স), দশমিক মূল্য NUMERIC(20,6) এবং ভ্যাট শ্রেণি কাঠামো।"
            summaryEn="SKU catalog with units of measure, decimal-string NUMERIC(20,6) pricing, and explicit tax category classifications."
            invariants={[
              {
                bn: 'সকল মূল্য NUMERIC(20,6) এবং API-তে দশমিক স্ট্রিং হিসেবে আদান-প্রদান হয়।',
                en: 'All monetary prices use PostgreSQL NUMERIC(20,6) and decimal strings in API payloads.',
              },
              {
                bn: 'কোনো পণ্যের জন্য সার্বজনীন ১৫% ভ্যাট অনুমান করা হয় না; অনুমোদিত কর নিয়ম প্রযোজ্য।',
                en: 'No universal 15% VAT rate is assumed; item tax categories resolve against approved effective-dated rules.',
              },
            ]}
            onReturnHome={() => setActiveView('home')}
          />
        );
      case 'accounting':
        return (
          <PhaseGatedWorkspaceView
            lang={lang}
            titleBn="চার্ট অব অ্যাকাউন্টস ও অপরিবর্তনীয় জেনারেল লেজার"
            titleEn="Chart of Accounts & Immutable General Ledger"
            phaseNumber={1}
            summaryBn="কেন্দ্রীয় পোস্টিং ইঞ্জিনের মাধ্যমে প্রতিটি আর্থিক লেনদেন সমান ডেবিট ও ক্রেডিটে পোস্ট হয়।"
            summaryEn="Central double-entry posting engine enforcing balanced debit == credit at commit time."
            invariants={[
              {
                bn: 'PostgreSQL DEFERRABLE INITIALLY DEFERRED ট্রিগার প্রতিটি পোস্টকৃত জার্নালের sum(debit) == sum(credit) নিশ্চিত করে।',
                en: 'PostgreSQL DEFERRABLE INITIALLY DEFERRED constraint trigger enforces sum(debit) == sum(credit) on commit.',
              },
              {
                bn: 'পোস্টকৃত বা রিভার্সকৃত জার্নাল এন্ট্রি ও লাইন এডিট বা ডিলিট করা ডাটাবেস ট্রিগার দ্বারা নিষিদ্ধ (GL-02)।',
                en: 'Mutating or deleting lines of a posted or reversed journal entry is blocked by database triggers (GL-02).',
              },
            ]}
            onReturnHome={() => setActiveView('home')}
          />
        );
      case 'sales':
        return (
          <PhaseGatedWorkspaceView
            lang={lang}
            titleBn="বিক্রয়, কোটেশন ও ইনভয়েস ওয়ার্কস্পেস"
            titleEn="Sales, Quotations & Invoices Workspace"
            phaseNumber={2}
            summaryBn="কোটেশন, সেলস অর্ডার, ডেলিভারি নোট ও বাণিজ্যিক ইনভয়েস জীবনচক্র (draft -> submitted -> approved -> issued -> posted)।"
            summaryEn="Quotation, sales order, delivery note, and invoice lifecycle with transactional sequence allocation."
            invariants={[
              {
                bn: 'কোটেশন কখনোই জেনারেল লেজারে পোস্ট হয় না; ইনভয়েস ইস্যু করার সময় ট্রানজ্যাকশনাল লকসহ সিরিয়াল নম্বর বরাদ্দ হয়।',
                en: 'Quotations never post to the GL; invoice issuance allocates document numbers under row lock.',
              },
              {
                bn: 'অনুমোদিত কর নিয়ম না থাকলে TAX_RULE_REVIEW_REQUIRED দেখিয়ে ভ্যাট চালান ইস্যু প্রতিরোধ করা হয়।',
                en: 'Unapproved tax rules halt taxable issuance with TAX_RULE_REVIEW_REQUIRED (HTTP 422).',
              },
            ]}
            onReturnHome={() => setActiveView('home')}
          />
        );
      case 'money':
        return (
          <PhaseGatedWorkspaceView
            lang={lang}
            titleBn="নগদ, ব্যাংক, পেমেন্ট গ্রহণ ও অ্যালোকেশন"
            titleEn="Cash, Banking, Receipts & Allocations"
            phaseNumber={3}
            summaryBn="গ্রাহকের পেমেন্ট গ্রহণ, আংশিক বা একাধিক ইনভয়েসে অ্যালোকেশন, অগ্রিম জমা এবং ব্যাংক রিকনসিলিয়েশন।"
            summaryEn="Customer receipts, partial/split invoice allocations, customer advances, and bank statement reconciliation."
            invariants={[
              {
                bn: 'অ্যালোকেশনের যোগফল কখনোই মোট প্রাপ্ত পেমেন্টের বেশি হতে পারে না (AR-02)।',
                en: 'Allocated total can never exceed receipt amount (AR-02).',
              },
              {
                bn: 'অবন্টিত অর্থ গ্রাহক অগ্রিম দায় (Customer Advance Liability) হিসেবে সংরক্ষিত থাকে।',
                en: 'Unallocated funds post to Customer Advance Liability rather than directly reducing AR without allocation.',
              },
            ]}
            onReturnHome={() => setActiveView('home')}
          />
        );
      case 'purchases':
      case 'inventory':
        return (
          <PhaseGatedWorkspaceView
            lang={lang}
            titleBn="ক্রয় আদেশ (PO), পণ্য গ্রহণ (GRN) ও মজুদ মূল্যায়ন"
            titleEn="Purchase Orders, Goods Receipts (GRN) & Inventory Valuation"
            phaseNumber={4}
            summaryBn="৩-ওয়ে ম্যাচিং (PO / GRN / Supplier Bill), GRNI কন্ট্রোল হিসাব এবং FIFO/ওয়েটেড-অ্যাভারেজ কস্ট লেয়ার।"
            summaryEn="3-way matching across PO, GRN, and Supplier Bill with immutable stock movements and cost layers."
            invariants={[
              {
                bn: 'কেবল ইনভয়েস ড্রাফট তৈরি করলেই মজুদ কমে না; নির্ধারিত ফুলফিলমেন্ট ইভেন্ট অনুযায়ী স্টক মুভমেন্ট ঘটে।',
                en: 'Stock changes follow the configured fulfillment event rather than blindly deducting on draft creation.',
              },
              {
                bn: 'ডিফল্টভাবে নেগেটিভ স্টক এবং কনকারেন্ট লাস্ট-ইউনিট ওভারসেলিং প্রতিরোধ করা হয় (INV-02)।',
                en: 'Negative stock and concurrent last-unit overselling are prevented under transaction locks (INV-02).',
              },
            ]}
            onReturnHome={() => setActiveView('home')}
          />
        );
      case 'vat':
        return (
          <PhaseGatedWorkspaceView
            lang={lang}
            titleBn="বাংলাদেশ ভ্যাট ও মূসক ওয়ার্কপেপার (আইনগত পর্যালোচনা গেট)"
            titleEn="Bangladesh VAT & Mushak Workpapers (Legal Review Gate)"
            phaseNumber={6}
            summaryBn="ভার্সনকৃত কর নিয়ম, মূসক ৬.১/৬.২/৬.২.১/৬.৩ রেজিস্টার এবং ৯.১/৯.২ রিটার্ন ওয়ার্কপেপার প্রস্তুতি।"
            summaryEn="Versioned tax rule engine, Mushak 6.1/6.2/6.2.1/6.3 registers, and 9.1/9.2 return workpaper reconciliation."
            invariants={[
              {
                bn: 'ব্যাপারী কখনোই স্বয়ংক্রিয় NBR রিটার্ন দাখিল বা NBR-অনুমোদিত সফটওয়্যার হওয়ার মিথ্যা দাবি করে না।',
                en: 'Bepari never claims automated NBR filing or NBR-approved enlistment status without verified proof.',
              },
              {
                bn: 'প্রতিটি ভ্যাট নিয়ম ও ফর্মের জন্য কার্যকর তারিখ, সরকারি গেজেট/SRO সূত্র এবং বিশেষজ্ঞের অনুমোদন আবশ্যক।',
                en: 'Every tax rule and form template requires effective dates, official SRO citations, and specialist approval.',
              },
            ]}
            onReturnHome={() => setActiveView('home')}
          />
        );
      case 'reports':
        return (
          <PhaseGatedWorkspaceView
            lang={lang}
            titleBn="ট্রায়াল ব্যালেন্স, লাভ-ক্ষতি, ব্যালেন্স শিট ও বকেয়া বয়স বিশ্লেষণ"
            titleEn="Trial Balance, P&L, Balance Sheet & AR Aging Reports"
            phaseNumber={5}
            summaryBn="সকল রিপোর্ট সরাসরি পোস্টকৃত জেনারেল লেজার ও সাবলেজার থেকে তৈরি হয় এবং কন্ট্রোল হিসাবের সাথে মিলকরণ (Reconcile) করা হয়।"
            summaryEn="All financial statements derive strictly from posted GL entries and reconcile to AR/AP/Inventory control accounts."
            invariants={[
              {
                bn: 'ক্লায়েন্ট-সাইড অনুমান বা আলাদা সামারি কলাম থেকে কোনো আর্থিক রিপোর্ট দেখানো হয় না।',
                en: 'No report relies on mutated summary columns or client-side approximations.',
              },
            ]}
            onReturnHome={() => setActiveView('home')}
          />
        );
      case 'more':
        return (
          <div className="space-y-6">
            <div className="border-b border-[#E0E6E2] pb-4">
              <h1 className="text-xl font-semibold text-[#172326]">
                {lang === 'bn' ? 'সকল মডিউল ও প্রশাসন' : 'All Modules & Administration'}
              </h1>
              <p className="mt-1 text-sm text-[#5D686D]">
                {lang === 'bn'
                  ? 'মোবাইল ওয়ার্কস্পেস থেকে যেকোনো মডিউল নির্বাচন করুন'
                  : 'Select a workspace module'}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                { id: 'onboarding' as WorkspaceId, label: t.navItems.onboarding },
                { id: 'parties' as WorkspaceId, label: t.navItems.parties },
                { id: 'catalog' as WorkspaceId, label: t.navItems.catalog },
                { id: 'inventory' as WorkspaceId, label: t.navItems.inventory },
                { id: 'accounting' as WorkspaceId, label: t.navItems.accounting },
                { id: 'vat' as WorkspaceId, label: t.navItems.vat },
                { id: 'reports' as WorkspaceId, label: t.navItems.reports },
                { id: 'admin' as WorkspaceId, label: t.navItems.admin },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setActiveView(m.id)}
                  className="flex min-h-[48px] items-center justify-between rounded-lg border border-[#E0E6E2] bg-[#FFFFFF] px-4 py-3 text-left text-sm font-medium text-[#172326] transition-colors hover:bg-[#F2F4F1]"
                >
                  <span>{m.label}</span>
                  <ChevronRight className="h-4 w-4 text-[#5D686D]" />
                </button>
              ))}
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#172326] flex flex-col md:flex-row">
      {/* Desktop Collapsible Left Navigation (1024px+) */}
      <aside
        aria-label={lang === 'bn' ? 'প্রধান নেভিগেশন' : 'Primary Navigation'}
        className={`hidden md:flex md:flex-col md:shrink-0 border-r border-[#E0E6E2] bg-[#FFFFFF] transition-all ${
          sidebarCollapsed ? 'md:w-16' : 'md:w-64'
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-[#E0E6E2] px-4">
          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={() => setActiveView('home')}
              className="text-left focus:outline-none whitespace-nowrap shrink-0"
            >
              <span className="text-base font-bold tracking-tight text-[#172326]">
                {t.brandName}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            aria-label={sidebarCollapsed ? t.expandSidebar : t.collapseSidebar}
            className="flex h-9 w-9 items-center justify-center rounded-md text-[#5D686D] hover:bg-[#F2F4F1] hover:text-[#172326]"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-5">
          {desktopNavGroups.map((group, gIdx) => (
            <div key={gIdx} className="space-y-1">
              {!sidebarCollapsed && (
                <div className="px-2.5 pb-1 text-xs font-medium text-[#5D686D]">
                  {group.groupLabel}
                </div>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveView(item.id)}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={`flex min-h-[40px] w-full items-center gap-3 rounded-md px-2.5 py-2 text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-[#126B58]/10 text-[#126B58]'
                        : 'text-[#172326] hover:bg-[#F2F4F1]'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!sidebarCollapsed && (
                      <span className="truncate">{item.label}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {!sidebarCollapsed && (
          <div className="border-t border-[#E0E6E2] p-3 text-xs text-[#5D686D]">
            <div>
              {readiness?.ready ? t.dbReady : t.dbBlocked}
            </div>
            <div className="mt-0.5 font-mono-tabular">
              Asia/Dhaka · BDT (৳)
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Column */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top Workspace Header */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-[#E0E6E2] bg-[#FFFFFF] px-4 sm:px-6">
          {/* Left Zone: Brand on Mobile + Active Organization / Branch Context Switcher */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setActiveView('home')}
              className="md:hidden text-base font-bold text-[#172326] whitespace-nowrap shrink-0"
            >
              {t.brandName}
            </button>

            <button
              type="button"
              onClick={() => setSwitcherOpen((prev) => !prev)}
              aria-expanded={switcherOpen}
              className="flex min-h-[38px] items-center gap-2 rounded-md border border-[#E0E6E2] bg-[#FAFAF8] px-3 py-1.5 text-xs font-medium text-[#172326] hover:bg-[#F2F4F1] truncate max-w-[260px] sm:max-w-xs"
            >
              <Building2 className="h-3.5 w-3.5 shrink-0 text-[#126B58]" />
              <span className="truncate">
                {activeMembership
                  ? `${activeMembership.legalName} · ${
                      activeBranch?.code || 'HQ'
                    }`
                  : t.noOrgYet}
              </span>
            </button>
          </div>

          {/* Center Zone: Global Command Search Placeholder (Explicitly Disabled in Phase 0 — Zero Fake Search Results) */}
          <div className="hidden lg:flex flex-1 max-w-md items-center">
            <div className="relative flex w-full items-center">
              <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-[#5D686D]" />
              <input
                type="search"
                disabled
                aria-label={t.searchPlaceholder}
                placeholder={t.searchPlaceholder}
                className="h-9 w-full cursor-not-allowed rounded-md border border-[#E0E6E2] bg-[#F2F4F1] pl-9 pr-3 text-xs text-[#5D686D]"
              />
            </div>
          </div>

          {/* Right Zone: Language Toggle & Contextual + New Action */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setLang((prev) => (prev === 'bn' ? 'en' : 'bn'))}
              aria-label={
                lang === 'bn'
                  ? 'Switch language to English'
                  : 'ভাষা বাংলায় পরিবর্তন করুন'
              }
              className="min-h-[38px] rounded-md border border-[#E0E6E2] bg-[#FAFAF8] px-3 py-1.5 text-xs font-medium text-[#172326] hover:bg-[#F2F4F1] whitespace-nowrap shrink-0"
            >
              {t.langSwitchLabel}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setNewPickerOpen((prev) => !prev)}
                aria-expanded={newPickerOpen}
                className="flex min-h-[38px] items-center gap-1.5 rounded-md bg-[#126B58] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#0C5345] whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{t.newActionBtn}</span>
              </button>

              {newPickerOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-64 rounded-lg border border-[#E0E6E2] bg-[#FFFFFF] p-2 shadow-sm z-30"
                >
                  <div className="flex items-center justify-between border-b border-[#E0E6E2] px-2.5 py-1.5 text-xs font-semibold text-[#172326]">
                    <span>{t.newActionTitle}</span>
                    <button
                      type="button"
                      onClick={() => setNewPickerOpen(false)}
                      aria-label={lang === 'bn' ? 'বন্ধ করুন' : 'Close menu'}
                      className="p-1 text-[#5D686D] hover:text-[#172326]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-1 space-y-1">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setActiveView('onboarding');
                        setNewPickerOpen(false);
                      }}
                      className="flex min-h-[40px] w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs text-[#172326] hover:bg-[#F2F4F1]"
                    >
                      <span>
                        {lang === 'bn'
                          ? 'নতুন প্রতিষ্ঠান ও হিসাবকাল'
                          : 'New Organization & Fiscal Period'}
                      </span>
                      <span className="text-[#126B58] font-mono-tabular">P0</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setActiveView('admin');
                        setNewPickerOpen(false);
                      }}
                      className="flex min-h-[40px] w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs text-[#172326] hover:bg-[#F2F4F1]"
                    >
                      <span>
                        {lang === 'bn' ? 'নতুন শাখা যুক্ত করুন' : 'Add Branch'}
                      </span>
                      <span className="text-[#126B58] font-mono-tabular">P0</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setActiveView('parties');
                        setNewPickerOpen(false);
                      }}
                      className="flex min-h-[40px] w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs text-[#5D686D] hover:bg-[#F2F4F1]"
                    >
                      <span>
                        {lang === 'bn'
                          ? 'গ্রাহক বা সরবরাহকারী (Phase 1)'
                          : 'Customer / Supplier (Phase 1)'}
                      </span>
                      <span className="font-mono-tabular">P1</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setActiveView('sales');
                        setNewPickerOpen(false);
                      }}
                      className="flex min-h-[40px] w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs text-[#5D686D] hover:bg-[#F2F4F1]"
                    >
                      <span>
                        {lang === 'bn'
                          ? 'নতুন ইনভয়েস (Phase 2)'
                          : 'New Sales Invoice (Phase 2)'}
                      </span>
                      <span className="font-mono-tabular">P2</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Organization, Branch & User Switcher Panel */}
        {switcherOpen && (
          <section
            aria-label={t.switchOrgBranch}
            className="border-b border-[#E0E6E2] bg-[#FFFFFF] px-4 py-4 sm:px-6"
          >
            <div className="mx-auto max-w-5xl flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-[#172326]">
                  {t.switchOrgBranch}
                </div>
                {sessionContext ? (
                  <div className="text-xs text-[#5D686D]">
                    <span>{sessionContext.user.displayName}</span>
                    <span aria-hidden="true"> · </span>
                    <span>{sessionContext.user.email}</span>
                    <span aria-hidden="true"> · </span>
                    <span>
                      {lang === 'bn' ? 'সক্রিয় ভূমিকা: ' : 'Active Role: '}
                      {sessionContext.activeRole || 'none'}
                    </span>
                  </div>
                ) : (
                  <div className="text-xs text-[#5D686D]">
                    {lang === 'bn'
                      ? 'আপনি এখনো সাইন ইন করেননি। প্রতিষ্ঠান ও শাখা পরিবর্তন করতে প্রথমে সাইন ইন করুন।'
                      : 'Not signed in. Sign in or register an owner account to switch business or branch.'}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {sessionContext &&
                  sessionContext.memberships.map((m) =>
                    m.branches.map((b) => {
                      const isCurrent =
                        sessionContext.activeOrganizationId === m.organizationId &&
                        sessionContext.activeBranchId === b.id;
                      return (
                        <button
                          key={`${m.organizationId}-${b.id}`}
                          type="button"
                          onClick={() =>
                            handleContextSwitch(m.organizationId, b.id)
                          }
                          className={`min-h-[38px] rounded-md border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                            isCurrent
                              ? 'border-[#126B58] bg-[#126B58]/10 text-[#126B58]'
                              : 'border-[#E0E6E2] bg-[#FAFAF8] text-[#172326] hover:bg-[#F2F4F1]'
                          }`}
                        >
                          {m.legalName} · {b.name} ({b.code})
                        </button>
                      );
                    })
                  )}

                <button
                  type="button"
                  onClick={() => {
                    setActiveView('onboarding');
                    setSwitcherOpen(false);
                  }}
                  className="min-h-[38px] rounded-md bg-[#126B58] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#0C5345] whitespace-nowrap shrink-0"
                >
                  {sessionContext
                    ? lang === 'bn'
                      ? '+ নতুন প্রতিষ্ঠান'
                      : '+ New Organization'
                    : t.signIn}
                </button>

                {sessionContext && (
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="min-h-[38px] rounded-md border border-[#E0E6E2] bg-[#FAFAF8] px-3 py-1.5 text-xs font-medium text-[#B42318] hover:bg-[#F2F4F1] whitespace-nowrap shrink-0"
                  >
                    {t.signOut}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSwitcherOpen(false)}
                  className="min-h-[38px] rounded-md border border-[#E0E6E2] px-2.5 py-1.5 text-xs text-[#5D686D] hover:text-[#172326]"
                >
                  {lang === 'bn' ? 'বন্ধ করুন' : 'Close'}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Main Workspace Viewport */}
        <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6 pb-24 sm:px-6 md:pb-10">
          {renderMainWorkspace()}
        </main>
      </div>

      {/* Mobile Bottom Navigation (5 destinations: Home, Sales, Purchases, Money, More) */}
      <nav
        aria-label={lang === 'bn' ? 'মোবাইল নেভিগেশন' : 'Mobile Navigation'}
        className="fixed bottom-0 left-0 right-0 z-20 flex h-14 items-center justify-around border-t border-[#E0E6E2] bg-[#FFFFFF] px-1 md:hidden"
      >
        {[
          { id: 'home' as WorkspaceId, label: t.navItems.home, icon: Home },
          {
            id: 'sales' as WorkspaceId,
            label: lang === 'bn' ? 'বিক্রয়' : 'Sales',
            icon: Receipt,
          },
          {
            id: 'purchases' as WorkspaceId,
            label: lang === 'bn' ? 'ক্রয়' : 'Purchases',
            icon: ShoppingCart,
          },
          {
            id: 'money' as WorkspaceId,
            label: lang === 'bn' ? 'লেনদেন' : 'Money',
            icon: Landmark,
          },
          { id: 'more' as WorkspaceId, label: t.navItems.more, icon: Menu },
        ].map((nav) => {
          const Icon = nav.icon;
          const isCurrent = activeView === nav.id;
          return (
            <button
              key={nav.id}
              type="button"
              onClick={() => setActiveView(nav.id)}
              className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                isCurrent ? 'text-[#126B58]' : 'text-[#5D686D]'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{nav.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

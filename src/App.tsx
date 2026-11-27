import { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Boxes,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Package,
  ReceiptText,
  Settings,
  ShoppingCart,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { AccountingReportsWorkspace } from './components/AccountingReportsWorkspace';
import { BepariLogo } from './components/BepariLogo';
import { CustomersWorkspace } from './components/CustomersWorkspace';
import { DocumentPreviewModal, type PreviewDocument } from './components/DocumentPreviewModal';
import { GlobalSearchBar } from './components/GlobalSearchBar';
import { InvoiceFormModal } from './components/InvoiceFormModal';
import { LoginScreen } from './components/LoginScreen';
import { NotificationCenter } from './components/NotificationCenter';
import { OnboardingWizard } from './components/OnboardingWizard';
import { OverviewView } from './components/OverviewView';
import { PaymentFormModal } from './components/PaymentFormModal';
import { PosCounterView } from './components/PosCounterView';
import { ProductsDirectoryWorkspace } from './components/ProductsDirectoryWorkspace';
import { PurchasesExpensesWorkspace } from './components/PurchasesExpensesWorkspace';
import { SalesWorkspace } from './components/SalesWorkspace';
import { SettingsSecurityWorkspace } from './components/SettingsSecurityWorkspace';
import { VatMushakWorkspace } from './components/VatMushakWorkspace';
import { useFeedback } from './context/FeedbackContext';
import { formatMoney } from './engine/format';
import type { Customer, Invoice, Language, Payment } from './engine/types';
import { DICT } from './i18n/translations';
import {
  bootstrapSession,
  fetchAuthStatus,
  fetchCustomerStatement,
  fetchWorkspace,
  loginWithPassword,
  logoutSession,
  setMemoryToken,
  switchRoleSession,
  type OnboardingPayload,
  type SessionInfo,
  type WorkspacePayload,
} from './lib/api';
import { printThermalReceipt } from './lib/pdfExport';

type SectionId =
  | 'overview'
  | 'sales'
  | 'customers'
  | 'pos'
  | 'products'
  | 'purchases'
  | 'vat'
  | 'reports'
  | 'settings';

export default function App() {
  const [lang, setLang] = useState<Language>('bn');
  const [section, setSection] = useState<SectionId>('overview');
  const [subtabs, setSubtabs] = useState<Record<string, string>>({
    sales: 'invoices',
    purchases: 'expenses',
    vat: 'mushak91',
    reports: 'pnl',
    settings: 'organization',
  });

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [authLocked, setAuthLocked] = useState(false);
  const [serverLocked, setServerLocked] = useState(false);
  const [signedOutManually, setSignedOutManually] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [selectedBranchId, setSelectedBranchId] = useState<number>(0); // 0 = All branches
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [invoiceCustomerId, setInvoiceCustomerId] = useState<number | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [previewDoc, setPreviewDoc] = useState<PreviewDocument | null>(null);
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);
  const [openFormToken, setOpenFormToken] = useState(0);
  const [highlightProductId, setHighlightProductId] = useState<number | null>(null);
  const [highlightCustomerId, setHighlightCustomerId] = useState<number | null>(null);

  const t = DICT[lang];
  const isBn = lang === 'bn';
  const { soundEnabled, toggleSound, notify, celebrate } = useFeedback();

  const loadWorkspaceData = useCallback(async (branchId: number) => {
    const payload = await fetchWorkspace(branchId > 0 ? branchId : undefined);
    setWorkspace(payload);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const status = await fetchAuthStatus();
        if (!active) return;
        if (status.users?.[0]?.email) {
          setLoginEmail(status.users[0].email);
        }
        if (status.needsOnboarding) {
          setNeedsOnboarding(true);
          setLoading(false);
          return;
        }
        setServerLocked(Boolean(status.locked));
        if (status.locked) {
          setAuthLocked(true);
          setLoading(false);
          return;
        }
        const sess = await bootstrapSession();
        if (!active) return;
        setMemoryToken(sess.token);
        setSession(sess);
        const payload = await fetchWorkspace();
        if (!active) return;
        setWorkspace(payload);
        setLang(payload.organization.defaultLanguage || 'bn');
      } catch (err) {
        if (active) setLoadError(err instanceof Error ? err.message : 'Unable to initialize Bepari.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Reload when branch filter changes
  useEffect(() => {
    if (!session) return;
    loadWorkspaceData(selectedBranchId).catch((err) => {
      setLoadError(err instanceof Error ? err.message : 'Failed to refresh workspace.');
    });
  }, [selectedBranchId, session, loadWorkspaceData]);

  // Desktop keyboard shortcuts: N = New Invoice, P = POS, Esc = close modals
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === 'Escape') {
        setInvoiceModalOpen(false);
        setPaymentModalOpen(false);
        setPreviewDoc(null);
        setMoreDrawerOpen(false);
        return;
      }
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }
      if (e.key.toLowerCase() === 'n' && session) {
        e.preventDefault();
        setInvoiceModalOpen(true);
      } else if (e.key.toLowerCase() === 'p' && session) {
        e.preventDefault();
        setSection('pos');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [session]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setLoginSubmitting(true);
    try {
      const sess = await loginWithPassword(loginEmail, loginPassword);
      setMemoryToken(sess.token);
      setSession(sess);
      setAuthLocked(false);
      setSignedOutManually(false);
      setLoginPassword('');
      const payload = await fetchWorkspace();
      setWorkspace(payload);
      notify({
        title: isBn ? `স্বাগতম, ${sess.user.name}` : `Welcome back, ${sess.user.name}`,
        description: isBn ? 'আপনার ওয়ার্কস্পেস প্রস্তুত।' : 'Your workspace is ready.',
        variant: 'success',
        sound: 'save',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign in failed.';
      setAuthError(msg);
      notify({ title: msg, variant: 'error' });
    } finally {
      setLoginSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await logoutSession();
    setMemoryToken(null);
    setSession(null);
    setAuthLocked(true);
    setSignedOutManually(true);
    setMoreDrawerOpen(false);
    setAuthError(null);
    setLoginPassword('');
    notify({
      title: isBn ? 'সাইন আউট সম্পন্ন হয়েছে।' : 'Signed out safely.',
      variant: 'info',
      sound: 'toggle',
    });
  };

  const handleQuickResume = async () => {
    setAuthError(null);
    setLoginSubmitting(true);
    try {
      const sess = await bootstrapSession();
      setMemoryToken(sess.token);
      setSession(sess);
      setAuthLocked(false);
      setSignedOutManually(false);
      const payload = await fetchWorkspace(selectedBranchId > 0 ? selectedBranchId : undefined);
      setWorkspace(payload);
      notify({
        title: isBn ? 'সেশন পুনরায় চালু হয়েছে।' : 'Session resumed.',
        variant: 'success',
        sound: 'save',
      });
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to resume workspace.');
    } finally {
      setLoginSubmitting(false);
    }
  };

  const handleSwitchUser = async (userId: number) => {
    const sess = await switchRoleSession(userId);
    setMemoryToken(sess.token);
    setSession(sess);
    await loadWorkspaceData(selectedBranchId);
    notify({
      title: isBn ? `ব্যবহারকারী পরিবর্তন: ${sess.user.name}` : `Switched user to ${sess.user.name}`,
      description: sess.user.role.toUpperCase(),
      variant: 'info',
      sound: 'toggle',
    });
  };

  const handleNavigate = (sec: string, subtab?: string, openForm?: boolean) => {
    const resolvedSection: SectionId = sec === 'documents' ? 'reports' : (sec as SectionId);
    const resolvedSubtab = sec === 'documents' ? subtab || 'vault' : subtab;
    setSection(resolvedSection);
    if (resolvedSubtab) {
      setSubtabs((prev) => ({ ...prev, [resolvedSection]: resolvedSubtab }));
    }
    if (openForm) {
      setOpenFormToken((prev) => prev + 1);
    } else {
      setOpenFormToken(0);
    }
    setMoreDrawerOpen(false);
  };

  const handleOpenStatement = async (customer: Customer) => {
    try {
      const stmt = await fetchCustomerStatement(customer.id);
      setPreviewDoc({
        type: 'statement',
        customer: stmt.customer,
        rows: stmt.rows,
        closingBalance: stmt.closingBalance,
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to load statement.');
    }
  };

  const handleOnboardingCompleted = async (sess: SessionInfo, onboardPayload: OnboardingPayload) => {
    setMemoryToken(sess.token);
    setSession(sess);
    setNeedsOnboarding(false);
    setAuthLocked(false);
    setServerLocked(true);
    setLoginEmail(sess.user.email);
    const payload = await fetchWorkspace();
    setWorkspace(payload);
    setLang(payload.organization.defaultLanguage || 'bn');
    celebrate({
      title: isBn ? 'অভিনন্দন! আপনার ওয়ার্কস্পেস প্রস্তুত' : 'Workspace Ready!',
      subtitle: isBn
        ? 'প্রতিষ্ঠান ও মূল শাখার তথ্য সকল ক্যাশ মেমো, ইনভয়েস ও রিপোর্টে সিঙ্ক হয়েছে।'
        : 'Organization and main branch synced across all memos, invoices, and reports.',
      refLabel: isBn ? 'শাখা' : 'Branch',
      refValue: onboardPayload.branchCode || 'MAIN',
      customerName: isBn
        ? onboardPayload.orgNameBn || onboardPayload.orgNameEn
        : onboardPayload.orgNameEn || onboardPayload.orgNameBn,
      amountLabel: isBn ? 'ওনার অ্যাকাউন্ট' : 'Owner Account',
      amountValue: sess.user.name,
      sound: 'sale',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F8FA] text-sm text-slate-500">
        {isBn ? 'বেপারী লোড হচ্ছে...' : 'Loading Bepari workspace...'}
      </div>
    );
  }

  if (needsOnboarding && !session) {
    return (
      <OnboardingWizard
        lang={lang}
        onToggleLang={() => setLang((prev) => (prev === 'bn' ? 'en' : 'bn'))}
        onCompleted={handleOnboardingCompleted}
      />
    );
  }

  if (authLocked && !session) {
    const canResume = signedOutManually && !serverLocked && !workspace?.organization.adminLockEnabled;
    return (
      <LoginScreen
        lang={lang}
        onToggleLang={() => setLang((prev) => (prev === 'bn' ? 'en' : 'bn'))}
        email={loginEmail}
        password={loginPassword}
        onEmailChange={setLoginEmail}
        onPasswordChange={setLoginPassword}
        error={authError}
        submitting={loginSubmitting}
        onSubmit={handleLoginSubmit}
        canQuickResume={canResume}
        onQuickResume={handleQuickResume}
      />
    );
  }

  if (loadError || !workspace || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA] p-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-md text-center space-y-3">
          <div className="text-sm font-semibold text-slate-900">
            {isBn ? 'ওয়ার্কস্পেস লোড করা যায়নি' : 'Unable to load workspace'}
          </div>
          <p className="text-xs text-slate-600">{loadError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-xs font-medium text-white bg-[#0F766E] rounded-lg"
          >
            {isBn ? 'পুনরায় চেষ্টা করুন' : 'Retry'}
          </button>
        </div>
      </div>
    );
  }

  const navItems: { id: SectionId; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'overview', label: t.nav.overview, icon: LayoutDashboard },
    { id: 'sales', label: t.nav.sales, icon: ReceiptText },
    { id: 'customers', label: t.nav.customers, icon: Users },
    { id: 'pos', label: t.nav.pos, icon: ShoppingCart },
    { id: 'products', label: t.nav.products, icon: Boxes },
    { id: 'purchases', label: t.nav.purchases, icon: Package },
    { id: 'vat', label: t.nav.vat, icon: FileSpreadsheet },
    { id: 'reports', label: t.nav.reports, icon: BarChart3 },
    { id: 'settings', label: t.nav.settings, icon: Settings },
  ];

  const activeBranchForForms = selectedBranchId > 0 ? selectedBranchId : workspace.branches[0]?.id || 1;

  return (
    <div className={`min-h-screen bg-[#F7F8FA] text-[#0F172A] flex flex-col lg:flex-row overflow-x-clip ${isBn ? 'font-[var(--font-bn)]' : ''}`}>
      {/* Desktop Compact Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-[232px] lg:fixed lg:inset-y-0 bg-white border-r border-slate-200 z-30">
        <div className="h-14 px-4 flex items-center border-b border-slate-200">
          <button
            type="button"
            onClick={() => handleNavigate('overview')}
            aria-label={isBn ? 'বেপারি হোম' : 'Bepari Home'}
            className="flex items-center focus:outline-none"
          >
            <BepariLogo lang={lang} size="sm" />
          </button>
        </div>

        <nav aria-label="Primary Sidebar" className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#0F766E]/10 text-[#0F766E]'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200 space-y-2">
          <div className="px-2">
            <label htmlFor="desktop-branch" className="sr-only">Branch Filter</label>
            <select
              id="desktop-branch"
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(Number(e.target.value))}
              className="w-full h-8 px-2 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700"
            >
              <option value={0}>{t.actions.allBranches}</option>
              {workspace.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {isBn ? b.nameBn : b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="px-2 flex items-center justify-between gap-2 text-[11px] text-slate-500">
            <span className="truncate">{session.user.name.split(' ')[0]} · {session.user.role}</span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                aria-label="Toggle language desktop"
                onClick={() => setLang((prev) => (prev === 'bn' ? 'en' : 'bn'))}
                className="font-semibold text-slate-700 hover:text-[#0F766E] whitespace-nowrap"
              >
                {lang === 'bn' ? 'EN' : 'বাংলা'}
              </button>
              <button
                type="button"
                data-testid="sign-out-button"
                onClick={handleSignOut}
                title={t.actions.signOut}
                aria-label={t.actions.signOut}
                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col lg:pl-[232px] min-w-0 w-full">
        {/* Minimalist Mobile App Header (Bepari Logo + Name | Search + Bell ONLY) & Clean Desktop Header */}
        <header className="sticky top-0 z-20 h-[52px] lg:h-14 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-3.5 sm:px-5 lg:px-6 flex items-center justify-between gap-1.5 sm:gap-3">
          <div className="flex items-center min-w-0 shrink-0">
            <button
              type="button"
              onClick={() => handleNavigate('overview')}
              aria-label={isBn ? 'বেপারি' : 'Bepari'}
              className="lg:hidden flex items-center active:opacity-80 transition-opacity"
            >
              <BepariLogo lang={lang} size="sm" />
            </button>
            <span className="hidden lg:inline text-sm font-semibold text-slate-900 truncate">
              {navItems.find((n) => n.id === section)?.label}
            </span>
          </div>

          <GlobalSearchBar
            workspace={workspace}
            lang={lang}
            onSelectInvoice={(inv) => setPreviewDoc({ type: 'invoice', invoice: inv })}
            onSelectProduct={(prod) => {
              setHighlightProductId(prod.id);
              handleNavigate('products');
            }}
            onSelectCustomer={(cust) => {
              setHighlightCustomerId(cust.id);
              handleNavigate('customers');
            }}
          />

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              data-testid="sound-toggle"
              onClick={toggleSound}
              aria-pressed={soundEnabled}
              aria-label={
                soundEnabled
                  ? isBn
                    ? 'সাউন্ড বন্ধ করুন'
                    : 'Mute feedback sounds'
                  : isBn
                    ? 'সাউন্ড চালু করুন'
                    : 'Enable feedback sounds'
              }
              title={
                soundEnabled
                  ? isBn
                    ? 'সাউন্ড চালু আছে (মিউট করতে ক্লিক করুন)'
                    : 'Sound ON (Click to mute)'
                  : isBn
                    ? 'সাউন্ড বন্ধ আছে (চালু করতে ক্লিক করুন)'
                    : 'Sound OFF (Click to enable)'
              }
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                soundEnabled
                  ? 'text-slate-600 hover:text-[#0F766E] hover:bg-slate-100'
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              {soundEnabled ? <Volume2 className="w-[18px] h-[18px]" /> : <VolumeX className="w-[18px] h-[18px]" />}
            </button>

            <NotificationCenter
              workspace={workspace}
              lang={lang}
              onReceivePayment={(inv) => {
                setEditingPayment(null);
                setPaymentInvoice(inv);
                setPaymentModalOpen(true);
              }}
              onViewProduct={(prod) => {
                setHighlightProductId(prod.id);
                handleNavigate('products');
              }}
              onNavigate={handleNavigate}
            />
          </div>
        </header>

        {/* Scrollable Workspace Content */}
        <main className="flex-1 p-3.5 sm:p-6 pb-20 lg:pb-8 max-w-7xl w-full mx-auto min-w-0">
          {section === 'overview' && (
            <OverviewView
              data={workspace}
              lang={lang}
              onNewInvoice={() => {
                setEditingInvoice(null);
                setInvoiceCustomerId(null);
                setInvoiceModalOpen(true);
              }}
              onReceivePayment={(inv) => {
                setEditingPayment(null);
                setPaymentInvoice(inv || null);
                setPaymentModalOpen(true);
              }}
              onNavigate={handleNavigate}
              onPreviewInvoice={(inv) => setPreviewDoc({ type: 'invoice', invoice: inv })}
              onPreviewMushak={(inv) => setPreviewDoc({ type: 'mushak_63', invoice: inv })}
            />
          )}

          {section === 'sales' && (
            <SalesWorkspace
              data={workspace}
              lang={lang}
              subtab={subtabs.sales || 'invoices'}
              onSubtabChange={(tab) => setSubtabs((prev) => ({ ...prev, sales: tab }))}
              onNewInvoice={() => {
                setEditingInvoice(null);
                setInvoiceCustomerId(null);
                setInvoiceModalOpen(true);
              }}
              onEditInvoice={(inv) => {
                setEditingInvoice(inv);
                setInvoiceCustomerId(null);
                setInvoiceModalOpen(true);
              }}
              onReceivePayment={(inv) => {
                setEditingPayment(null);
                setPaymentInvoice(inv || null);
                setPaymentModalOpen(true);
              }}
              onEditPayment={(pay) => {
                setEditingPayment(pay);
                setPaymentInvoice(null);
                setPaymentModalOpen(true);
              }}
              onPreviewInvoice={(inv) => setPreviewDoc({ type: 'invoice', invoice: inv })}
              onPreviewMushak={(inv) => setPreviewDoc({ type: 'mushak_63', invoice: inv })}
              onRefresh={() => loadWorkspaceData(selectedBranchId)}
            />
          )}

          {section === 'customers' && (
            <CustomersWorkspace
              data={workspace}
              lang={lang}
              openFormToken={openFormToken}
              highlightCustomerId={highlightCustomerId}
              onClearHighlight={() => setHighlightCustomerId(null)}
              onNewInvoiceForCustomer={(customerId) => {
                setEditingInvoice(null);
                setInvoiceCustomerId(customerId);
                setInvoiceModalOpen(true);
              }}
              onReceivePaymentForCustomer={(inv) => {
                setEditingPayment(null);
                setPaymentInvoice(inv || null);
                setPaymentModalOpen(true);
              }}
              onPreviewInvoice={(inv) => setPreviewDoc({ type: 'invoice', invoice: inv })}
              onPreviewStatement={handleOpenStatement}
              onRefresh={() => loadWorkspaceData(selectedBranchId)}
            />
          )}

          {section === 'pos' && (
            <PosCounterView
              data={workspace}
              lang={lang}
              activeBranchId={activeBranchForForms}
              onRefresh={() => loadWorkspaceData(selectedBranchId)}
              onCompleted={async (inv) => {
                await loadWorkspaceData(selectedBranchId);
                setPreviewDoc({ type: 'pos_receipt', invoice: inv });
                celebrate({
                  title: isBn ? 'বিক্রয় সম্পন্ন হয়েছে!' : 'POS Sale Completed!',
                  subtitle: isBn
                    ? 'ইনভয়েস, স্টক ও লেজারে স্বয়ংক্রিয়ভাবে সিঙ্ক হয়েছে।'
                    : 'Invoice, stock, and ledger synced automatically.',
                  refLabel: isBn ? 'মেমো' : 'Memo',
                  refValue: inv.invoiceNumber,
                  customerName: inv.customerName,
                  amountLabel: isBn ? 'মোট বিল' : 'Grand Total',
                  amountValue: formatMoney(inv.grandTotal, lang, workspace.organization.currencySymbol),
                  sound: 'sale',
                  primaryAction: {
                    label: isBn ? 'ক্যাশ মেমো দেখুন' : 'View Cash Memo',
                    onClick: () => setPreviewDoc({ type: 'pos_receipt', invoice: inv }),
                  },
                  secondaryAction: {
                    label: isBn ? 'টার্মিনাল প্রিন্ট' : 'Terminal Print',
                    onClick: () => printThermalReceipt(inv, workspace.organization, lang),
                  },
                });
              }}
            />
          )}

          {section === 'products' && (
            <ProductsDirectoryWorkspace
              data={workspace}
              lang={lang}
              activeBranchId={activeBranchForForms}
              highlightProductId={highlightProductId}
              onClearHighlight={() => setHighlightProductId(null)}
              onRefresh={() => loadWorkspaceData(selectedBranchId)}
            />
          )}

          {section === 'purchases' && (
            <PurchasesExpensesWorkspace
              data={workspace}
              lang={lang}
              subtab={subtabs.purchases || 'expenses'}
              onSubtabChange={(tab) => setSubtabs((prev) => ({ ...prev, purchases: tab }))}
              activeBranchId={activeBranchForForms}
              openFormToken={openFormToken}
              onRefresh={() => loadWorkspaceData(selectedBranchId)}
            />
          )}

          {section === 'vat' && (
            <VatMushakWorkspace
              data={workspace}
              lang={lang}
              subtab={subtabs.vat || 'mushak91'}
              onSubtabChange={(tab) => setSubtabs((prev) => ({ ...prev, vat: tab }))}
              onPreviewMushak={(inv) => setPreviewDoc({ type: 'mushak_63', invoice: inv })}
              onRefresh={() => loadWorkspaceData(selectedBranchId)}
            />
          )}

          {section === 'reports' && (
            <AccountingReportsWorkspace
              data={workspace}
              lang={lang}
              subtab={subtabs.reports || 'pnl'}
              onSubtabChange={(tab) => setSubtabs((prev) => ({ ...prev, reports: tab }))}
              onPreviewInvoice={(inv) => setPreviewDoc({ type: 'invoice', invoice: inv })}
              onPreviewMushak={(inv) => setPreviewDoc({ type: 'mushak_63', invoice: inv })}
              onRefresh={() => loadWorkspaceData(selectedBranchId)}
            />
          )}

          {section === 'settings' && (
            <SettingsSecurityWorkspace
              data={workspace}
              lang={lang}
              subtab={subtabs.settings || 'organization'}
              onSubtabChange={(tab) => setSubtabs((prev) => ({ ...prev, settings: tab }))}
              session={session}
              onSwitchUser={handleSwitchUser}
              onRefresh={() => loadWorkspaceData(selectedBranchId)}
            />
          )}
        </main>
      </div>

      {/* Native Mobile Bottom Tab Bar (5 items, 60px + safe-area, frosted surface) */}
      <nav
        aria-label="Mobile Navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200/90 pb-safe"
      >
        <div className="h-[60px] grid grid-cols-5 items-center">
          {(
            [
              { id: 'overview', label: t.nav.overview, icon: LayoutDashboard },
              { id: 'sales', label: isBn ? 'ইনভয়েস' : 'Invoices', icon: ReceiptText },
              { id: 'pos', label: isBn ? 'ক্যাশ' : 'POS', icon: ShoppingCart },
              { id: 'purchases', label: isBn ? 'খরচ' : 'Expenses', icon: Package },
            ] as { id: SectionId; label: string; icon: typeof LayoutDashboard }[]
          ).map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className={`relative h-full flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium active:scale-95 transition-transform ${
                  active ? 'text-[#0F766E]' : 'text-slate-500'
                }`}
              >
                {active && <span className="absolute top-0 w-8 h-[2.5px] bg-[#0F766E] rounded-b-full" />}
                <Icon className="w-[21px] h-[21px]" strokeWidth={active ? 2.25 : 1.8} />
                <span className="truncate max-w-[68px]">{item.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreDrawerOpen((v) => !v)}
            className={`relative h-full flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium active:scale-95 transition-transform ${
              ['customers', 'products', 'vat', 'reports', 'settings'].includes(section) || moreDrawerOpen
                ? 'text-[#0F766E]'
                : 'text-slate-500'
            }`}
          >
            {['customers', 'products', 'vat', 'reports', 'settings'].includes(section) && (
              <span className="absolute top-0 w-8 h-[2.5px] bg-[#0F766E] rounded-b-full" />
            )}
            <MoreHorizontal className="w-[21px] h-[21px]" strokeWidth={2} />
            <span>{t.nav.more}</span>
          </button>
        </div>
      </nav>

      {/* Native Mobile More Bottom Sheet (Branch + Language Switcher + Streamlined 5-Module Navigation) */}
      {moreDrawerOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-slate-900/45 backdrop-blur-[2px] flex items-end"
          onClick={() => setMoreDrawerOpen(false)}
        >
          <div
            className="bg-white w-full rounded-t-3xl px-4 pt-3 pb-7 pb-safe space-y-4 border-t border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto" />

            <div className="flex items-center justify-between pb-1 border-b border-slate-100">
              <BepariLogo lang={lang} size="sm" />
              <span className="text-[11px] font-medium text-slate-500 truncate max-w-[170px]">
                {isBn ? workspace.organization.nameBn || workspace.organization.name : workspace.organization.name}
              </span>
            </div>

            {/* Mobile Branch Switcher & Language Toggle */}
            <div className="grid grid-cols-12 gap-2.5 items-end">
              <div className="col-span-8">
                <label htmlFor="mobile-branch" className="block text-[11px] font-medium text-slate-500 mb-1.5 px-0.5">
                  {isBn ? 'শাখা ও গুদাম' : 'Active Branch'}
                </label>
                <select
                  id="mobile-branch"
                  value={selectedBranchId}
                  onChange={(e) => {
                    setSelectedBranchId(Number(e.target.value));
                    setMoreDrawerOpen(false);
                  }}
                  className="w-full h-11 px-3 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
                >
                  <option value={0}>{t.actions.allBranches}</option>
                  {workspace.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {isBn ? b.nameBn : b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-4">
                <span className="block text-[11px] font-medium text-slate-500 mb-1.5 px-0.5">
                  {isBn ? 'ভাষা' : 'Language'}
                </span>
                <button
                  type="button"
                  aria-label="Toggle language mobile"
                  onClick={() => setLang((prev) => (prev === 'bn' ? 'en' : 'bn'))}
                  className="w-full h-11 px-2.5 text-xs font-semibold text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl active:scale-[0.98] transition-all whitespace-nowrap"
                >
                  {lang === 'bn' ? 'English' : 'বাংলা'}
                </button>
              </div>
            </div>

            {/* Primary Directories: Customers & Products */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleNavigate('customers')}
                className={`p-3.5 flex items-center justify-between gap-2 text-left rounded-2xl border active:scale-[0.98] transition-all ${
                  section === 'customers'
                    ? 'bg-[#0F766E]/10 border-[#0F766E]/30 text-[#0F766E]'
                    : 'bg-slate-50/70 border-slate-200 text-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Users className="w-5 h-5 text-[#0F766E] shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold leading-snug truncate">{t.nav.customers}</div>
                    <div className="text-[10px] text-slate-500 truncate">{isBn ? 'খাতা ও বকেয়া' : 'Ledgers'}</div>
                  </div>
                </div>
                <span className="text-xs font-semibold tabular-nums text-slate-500 shrink-0">
                  {workspace.customers.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleNavigate('products')}
                className={`p-3.5 flex items-center justify-between gap-2 text-left rounded-2xl border active:scale-[0.98] transition-all ${
                  section === 'products'
                    ? 'bg-[#0F766E]/10 border-[#0F766E]/30 text-[#0F766E]'
                    : 'bg-slate-50/70 border-slate-200 text-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Boxes className="w-5 h-5 text-[#0F766E] shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold leading-snug truncate">{t.nav.products}</div>
                    <div className="text-[10px] text-slate-500 truncate">{isBn ? 'ক্যাটালগ ও স্টক' : 'Catalog'}</div>
                  </div>
                </div>
                <span className="text-xs font-semibold tabular-nums text-slate-500 shrink-0">
                  {workspace.products.length}
                </span>
              </button>
            </div>

            {/* Streamlined Modules: VAT, Reports & Vault, Settings */}
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'vat', label: t.nav.vat, icon: FileSpreadsheet },
                  { id: 'reports', label: t.nav.reports, icon: BarChart3 },
                  { id: 'settings', label: t.nav.settings, icon: Settings },
                ] as { id: SectionId; label: string; icon: typeof LayoutDashboard }[]
              ).map((item) => {
                const Icon = item.icon;
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavigate(item.id)}
                    className={`min-h-[68px] p-3 flex flex-col items-start justify-between gap-2 text-left rounded-2xl border active:scale-[0.98] transition-all ${
                      active
                        ? 'bg-[#0F766E]/10 border-[#0F766E]/30 text-[#0F766E]'
                        : 'bg-slate-50/70 border-slate-200 text-slate-800'
                    }`}
                  >
                    <Icon className="w-5 h-5 text-[#0F766E]" />
                    <span className="text-[11px] font-semibold leading-tight">{item.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-500 px-1">
              <span className="truncate">{session.user.name} · <span className="uppercase font-mono">{session.user.role}</span></span>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-lg whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{t.actions.signOut}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Creation / Edit & Document Preview Modals */}
      {invoiceModalOpen && (
        <InvoiceFormModal
          open={invoiceModalOpen}
          editingInvoice={editingInvoice}
          prefillCustomerId={invoiceCustomerId}
          onClose={() => {
            setInvoiceModalOpen(false);
            setEditingInvoice(null);
            setInvoiceCustomerId(null);
          }}
          onCreated={async (saved) => {
            const wasEdit = Boolean(editingInvoice);
            setInvoiceModalOpen(false);
            setEditingInvoice(null);
            setInvoiceCustomerId(null);
            await loadWorkspaceData(selectedBranchId);
            if (wasEdit) {
              notify({
                title: isBn ? 'ইনভয়েস হালনাগাদ হয়েছে।' : 'Invoice updated.',
                description: saved.invoiceNumber,
                variant: 'success',
                sound: 'save',
              });
            } else {
              setPreviewDoc({ type: 'invoice', invoice: saved });
              celebrate({
                title: isBn ? 'নতুন ইনভয়েস তৈরি হয়েছে!' : 'Invoice Posted!',
                subtitle: isBn
                  ? 'কাস্টমার লেজার ও ভ্যাট হিসাবে স্বয়ংক্রিয়ভাবে যুক্ত হয়েছে।'
                  : 'Posted to customer ledger and VAT register.',
                refLabel: isBn ? 'ইনভয়েস' : 'Invoice',
                refValue: saved.invoiceNumber,
                customerName: saved.customerName,
                amountLabel: isBn ? 'সর্বমোট বিল' : 'Grand Total',
                amountValue: formatMoney(saved.grandTotal, lang, workspace.organization.currencySymbol),
                sound: 'sale',
                primaryAction: {
                  label: isBn ? 'ইনভয়েস দেখুন' : 'View Invoice',
                  onClick: () => setPreviewDoc({ type: 'invoice', invoice: saved }),
                },
              });
            }
          }}
          onRefresh={() => loadWorkspaceData(selectedBranchId)}
          org={workspace.organization}
          lang={lang}
          branches={workspace.branches}
          activeBranchId={activeBranchForForms}
          customers={workspace.customers}
          products={workspace.products}
          taxRules={workspace.taxRules}
        />
      )}

      {paymentModalOpen && (
        <PaymentFormModal
          open={paymentModalOpen}
          editingPayment={editingPayment}
          onClose={() => {
            setPaymentModalOpen(false);
            setPaymentInvoice(null);
            setEditingPayment(null);
          }}
          onRecorded={async (summary) => {
            setPaymentModalOpen(false);
            setPaymentInvoice(null);
            setEditingPayment(null);
            await loadWorkspaceData(selectedBranchId);
            if (summary.isEdit) {
              notify({
                title: isBn ? 'পেমেন্ট তথ্য হালনাগাদ হয়েছে।' : 'Payment updated.',
                description: summary.reference || undefined,
                variant: 'success',
                sound: 'save',
              });
            } else {
              celebrate({
                title: isBn ? 'পেমেন্ট গ্রহণ সম্পন্ন!' : 'Payment Collected!',
                subtitle: summary.methodLabel,
                refLabel: isBn ? 'রেফারেন্স' : 'Ref',
                refValue: summary.reference,
                customerName: summary.customerName,
                amountLabel: isBn ? 'গৃহীত টাকা' : 'Amount Received',
                amountValue: formatMoney(summary.amount, lang, workspace.organization.currencySymbol),
                sound: 'payment',
              });
            }
          }}
          org={workspace.organization}
          lang={lang}
          branches={workspace.branches}
          activeBranchId={activeBranchForForms}
          customers={workspace.customers}
          prefillInvoice={paymentInvoice}
        />
      )}

      <DocumentPreviewModal
        doc={previewDoc}
        org={workspace.organization}
        lang={lang}
        onClose={() => setPreviewDoc(null)}
      />
    </div>
  );
}

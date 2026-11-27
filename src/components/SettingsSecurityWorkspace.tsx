import { useEffect, useState } from 'react';
import { Edit3, Lock, Plus, RotateCcw, Shield, Trash2, Upload } from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import type { Branch, InventoryMethod, Language, TaxMode, UserAccount, UserRole } from '../engine/types';
import { DICT } from '../i18n/translations';
import { apiRequest, type SessionInfo, type WorkspacePayload } from '../lib/api';
import { CashMemoCustomizer } from './CashMemoCustomizer';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { OrganizationLogo } from './OrganizationLogo';

interface Props {
  data: WorkspacePayload;
  lang: Language;
  subtab: string;
  onSubtabChange: (tab: string) => void;
  session: SessionInfo;
  onSwitchUser: (userId: number) => Promise<void>;
  onRefresh: () => Promise<void>;
}

export function SettingsSecurityWorkspace({
  data,
  lang,
  subtab,
  onSubtabChange,
  session,
  onSwitchUser,
  onRefresh,
}: Props) {
  const t = DICT[lang];
  const isBn = lang === 'bn';
  const org = data.organization;
  const { notify } = useFeedback();

  const [orgName, setOrgName] = useState(org.name);
  const [orgNameBn, setOrgNameBn] = useState(org.nameBn);
  const [bin, setBin] = useState(org.binNumber);
  const [tin, setTin] = useState(org.tinNumber);
  const [phone, setPhone] = useState(org.phone);
  const [email, setEmail] = useState(org.email);
  const [address, setAddress] = useState(org.address);
  const [proprietorName, setProprietorName] = useState(org.proprietorName || '');
  const [tagline, setTagline] = useState(org.tagline || '');
  const [website, setWebsite] = useState(org.website || '');
  const [businessDescription, setBusinessDescription] = useState(org.businessDescription || '');
  const [invMethod, setInvMethod] = useState<InventoryMethod>(org.inventoryMethod);
  const [vatMode, setVatMode] = useState<TaxMode>(org.vatMode);
  const [logoUrl, setLogoUrl] = useState(org.logoUrl || '');
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Sync local form state when organization refreshes from SQLite (e.g. via Cash Memo quick-fill)
  useEffect(() => {
    setOrgName(org.name);
    setOrgNameBn(org.nameBn);
    setBin(org.binNumber);
    setTin(org.tinNumber);
    setPhone(org.phone);
    setEmail(org.email);
    setAddress(org.address);
    setProprietorName(org.proprietorName || '');
    setTagline(org.tagline || '');
    setWebsite(org.website || '');
    setBusinessDescription(org.businessDescription || '');
    setInvMethod(org.inventoryMethod);
    setVatMode(org.vatMode);
    setLogoUrl(org.logoUrl || '');
  }, [org]);

  // Branch form
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [bCode, setBCode] = useState('');
  const [bName, setBName] = useState('');
  const [bNameBn, setBNameBn] = useState('');
  const [bAddress, setBAddress] = useState('');

  // User form
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [uName, setUName] = useState('');
  const [uEmail, setUEmail] = useState('');
  const [uRole, setURole] = useState<UserRole>('accountant');
  const [uPassword, setUPassword] = useState('');

  // Admin Lock form
  const [adminPass, setAdminPass] = useState('');

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<
    { type: 'branch'; item: Branch } | { type: 'user'; item: UserAccount } | null
  >(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.type)) {
      setError(isBn ? 'শুধুমাত্র PNG, JPG বা WebP লোগো ফাইল আপলোড করা যাবে।' : 'Only PNG, JPG, or WebP logo files are supported.');
      return;
    }
    setUploadingLogo(true);
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        try {
          const maxDim = 256;
          const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas unavailable');
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/png');
          setLogoUrl(dataUrl);
          await apiRequest('/api/organization', { method: 'PATCH', body: { logoUrl: dataUrl } });
          const msg = isBn ? 'প্রতিষ্ঠানের লোগো সফলভাবে হালনাগাদ হয়েছে।' : 'Organization logo updated successfully.';
          setMessage(msg);
          notify({
            title: msg,
            description: isBn ? 'সকল ক্যাশ মেমো, ইনভয়েস ও পিডিএফে অটো-সিঙ্ক হয়েছে।' : 'Synced across all Cash Memos, Invoices, and PDFs.',
            variant: 'success',
            sound: 'save',
          });
          await onRefresh();
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to process logo image.';
          setError(msg);
          notify({ title: msg, variant: 'error' });
        } finally {
          setUploadingLogo(false);
        }
      };
      img.onerror = () => {
        setError(isBn ? 'লোগো ফাইলটি পড়া যায়নি।' : 'Unable to read logo image.');
        setUploadingLogo(false);
      };
      img.src = String(reader.result || '');
    };
    reader.onerror = () => {
      setError(isBn ? 'লোগো ফাইলটি পড়া যায়নি।' : 'Unable to read logo image.');
      setUploadingLogo(false);
    };
    reader.readAsDataURL(file);
  };

  const handleResetLogo = async () => {
    setError(null);
    setMessage(null);
    setUploadingLogo(true);
    try {
      setLogoUrl('');
      await apiRequest('/api/organization', { method: 'PATCH', body: { logoUrl: '' } });
      const msg = isBn ? 'প্রতিষ্ঠানের কাস্টম লোগো সরানো হয়েছে।' : 'Custom organization logo cleared.';
      setMessage(msg);
      notify({ title: msg, variant: 'info', sound: 'delete' });
      await onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reset logo.';
      setError(msg);
      notify({ title: msg, variant: 'error' });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSaveOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await apiRequest('/api/organization', {
        method: 'PATCH',
        body: {
          name: orgName,
          nameBn: orgNameBn,
          binNumber: bin,
          tinNumber: tin,
          phone,
          email,
          address,
          proprietorName,
          tagline,
          website,
          businessDescription,
          inventoryMethod: invMethod,
          vatMode,
          logoUrl,
        },
      });
      const msg = isBn ? 'প্রতিষ্ঠানের তথ্য সংরক্ষিত হয়েছে।' : 'Organization settings saved.';
      setMessage(msg);
      notify({
        title: msg,
        description: isBn
          ? 'ক্যাশ মেমো, ইনভয়েস, স্টেটমেন্ট ও রিপোর্টে স্বয়ংক্রিয়ভাবে সিঙ্ক হয়েছে।'
          : 'Auto-synced across Cash Memos, Invoices, Statements, and Reports.',
        variant: 'success',
        sound: 'save',
      });
      await onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update organization.';
      setError(msg);
      notify({ title: msg, variant: 'error' });
    }
  };

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const body = { code: bCode, name: bName, nameBn: bNameBn || bName, address: bAddress };
      if (editingBranch) {
        await apiRequest(`/api/branches/${editingBranch.id}`, { method: 'PUT', body });
        const msg = isBn ? 'শাখার তথ্য হালনাগাদ হয়েছে।' : 'Branch updated.';
        setMessage(msg);
        notify({ title: msg, variant: 'success', sound: 'save' });
      } else {
        await apiRequest('/api/branches', { method: 'POST', body });
        const msg = isBn ? 'নতুন শাখা যুক্ত হয়েছে।' : 'Branch added.';
        setMessage(msg);
        notify({ title: msg, variant: 'success', sound: 'save' });
      }
      setEditingBranch(null);
      setBCode('');
      setBName('');
      setBNameBn('');
      setBAddress('');
      await onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save branch.';
      setError(msg);
      notify({ title: msg, variant: 'error' });
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const body = { name: uName, email: uEmail, role: uRole, password: uPassword || undefined };
      if (editingUser) {
        await apiRequest(`/api/users/${editingUser.id}`, { method: 'PUT', body });
        const msg = isBn ? 'ইউজারের তথ্য হালনাগাদ হয়েছে।' : 'Team member updated.';
        setMessage(msg);
        notify({ title: msg, variant: 'success', sound: 'save' });
      } else {
        await apiRequest('/api/users', { method: 'POST', body });
        const msg = isBn ? 'নতুন ইউজার যুক্ত হয়েছে।' : 'Team member added.';
        setMessage(msg);
        notify({ title: msg, variant: 'success', sound: 'save' });
      }
      setEditingUser(null);
      setUName('');
      setUEmail('');
      setURole('accountant');
      setUPassword('');
      await onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save team member.';
      setError(msg);
      notify({ title: msg, variant: 'error' });
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const label = deleteTarget.type === 'branch' ? (isBn ? 'শাখা মুছে ফেলা হয়েছে।' : 'Branch deleted.') : (isBn ? 'ইউজার মুছে ফেলা হয়েছে।' : 'Team member removed.');
      if (deleteTarget.type === 'branch') {
        await apiRequest(`/api/branches/${deleteTarget.item.id}`, { method: 'DELETE' });
      } else {
        await apiRequest(`/api/users/${deleteTarget.item.id}`, { method: 'DELETE' });
      }
      setDeleteTarget(null);
      notify({ title: label, variant: 'warning', sound: 'delete' });
      await onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete item.';
      setDeleteError(msg);
      notify({ title: msg, variant: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const handleEnableLock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await apiRequest('/api/auth/set-lock', {
        method: 'POST',
        body: { password: adminPass },
      });
      setAdminPass('');
      const msg = isBn ? 'অ্যাডমিন পাসওয়ার্ড সুরক্ষা সক্রিয় হয়েছে।' : 'Workspace admin password lock enabled.';
      setMessage(msg);
      notify({ title: msg, variant: 'success', sound: 'save' });
      await onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to enable password lock.';
      setError(msg);
      notify({ title: msg, variant: 'error' });
    }
  };

  const handleResetClean = async () => {
    setError(null);
    try {
      await apiRequest('/api/workspace/reset', { method: 'POST' });
      notify({
        title: isBn ? 'ওয়ার্কস্পেস পরিষ্কার (রিসেট) হয়েছে।' : 'Workspace reset to clean state.',
        variant: 'warning',
        sound: 'delete',
      });
      await onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reset workspace.';
      setError(msg);
      notify({ title: msg, variant: 'error' });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-3">
        {[
          { id: 'organization', label: t.tabs.organization },
          { id: 'design', label: t.tabs.design },
          { id: 'branches', label: t.tabs.branches },
          { id: 'users', label: t.tabs.users },
          { id: 'audit', label: t.tabs.audit },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              onSubtabChange(tab.id);
              setError(null);
              setMessage(null);
            }}
            className={`min-h-[38px] sm:min-h-0 px-3 py-2 text-xs font-medium rounded-xl sm:rounded-lg transition-colors whitespace-nowrap active:scale-[0.98] ${
              subtab === tab.id
                ? 'bg-slate-900 text-white'
                : 'bg-white sm:bg-transparent border border-slate-200 sm:border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
          {error}
        </div>
      )}
      {message && (
        <div className="p-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg">
          {message}
        </div>
      )}

      {/* ORGANIZATION SETTINGS */}
      {subtab === 'organization' && (
        <div className="space-y-6 max-w-3xl">
          <form onSubmit={handleSaveOrg} className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
            <h2 className="text-sm font-semibold text-slate-900">{t.tabs.organization}</h2>

            {/* Organization Logo Upload (Strict separation from Bepari App Icon) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3.5 min-w-0">
                <OrganizationLogo
                  logoUrl={logoUrl}
                  orgName={isBn ? orgNameBn || orgName : orgName}
                  size="lg"
                />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-900">
                    {isBn ? 'প্রতিষ্ঠানের লোগো' : 'Organization Logo'}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    {isBn
                      ? 'আপনার প্রতিষ্ঠানের ক্যাশ মেমো, ইনভয়েস, স্টেটমেন্ট ও আর্থিক রিপোর্টে ব্যবহৃত হবে (অ্যাপের আইকন অপরিবর্তিত থাকবে)।'
                      : 'Used on your organization Cash Memos, Tax Invoices, Statements, and PDF reports (the Bepari app icon stays independent).'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <label className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors whitespace-nowrap">
                  <Upload className="w-3.5 h-3.5 text-[#0F766E]" />
                  <span>{uploadingLogo ? (isBn ? 'সংরক্ষণ হচ্ছে...' : 'Saving...') : isBn ? 'লোগো আপলোড' : 'Upload Logo'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={uploadingLogo}
                    onChange={handleLogoFileChange}
                    className="sr-only"
                  />
                </label>
                {logoUrl && (
                  <button
                    type="button"
                    disabled={uploadingLogo}
                    onClick={handleResetLogo}
                    className="min-h-[38px] inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{isBn ? 'ডিফল্ট' : 'Reset'}</span>
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="org-name" className="block text-xs text-slate-600 mb-1">
                  {isBn ? 'প্রতিষ্ঠানের নাম (English)' : 'Organization Name (English)'}
                </label>
                <input id="org-name" type="text" value={orgName} onChange={(e) => setOrgName(e.target.value)} className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label htmlFor="org-namebn" className="block text-xs text-slate-600 mb-1">
                  {isBn ? 'প্রতিষ্ঠানের নাম (বাংলা)' : 'Organization Name (Bangla)'}
                </label>
                <input id="org-namebn" type="text" value={orgNameBn} onChange={(e) => setOrgNameBn(e.target.value)} className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label htmlFor="org-bin" className="block text-xs text-slate-600 mb-1">BIN (মূসক নিবন্ধন নং)</label>
                <input id="org-bin" type="text" value={bin} onChange={(e) => setBin(e.target.value)} className="w-full h-9 px-3 text-sm font-mono border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label htmlFor="org-tin" className="block text-xs text-slate-600 mb-1">TIN</label>
                <input id="org-tin" type="text" value={tin} onChange={(e) => setTin(e.target.value)} className="w-full h-9 px-3 text-sm font-mono border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label htmlFor="org-inv" className="block text-xs text-slate-600 mb-1">
                  {isBn ? 'ইনভেন্টরি ভ্যালুয়েশন পদ্ধতি' : 'Inventory Valuation Method'}
                </label>
                <select id="org-inv" value={invMethod} onChange={(e) => setInvMethod(e.target.value as InventoryMethod)} className="w-full h-9 px-3 text-sm bg-white border border-slate-300 rounded-lg">
                  <option value="weighted_avg">Weighted Average</option>
                  <option value="fifo">FIFO (First-In, First-Out)</option>
                </select>
              </div>
              <div>
                <label htmlFor="org-vatmode" className="block text-xs text-slate-600 mb-1">
                  {isBn ? 'মূসক হিসাবের ধরন' : 'Default VAT Mode'}
                </label>
                <select id="org-vatmode" value={vatMode} onChange={(e) => setVatMode(e.target.value as TaxMode)} className="w-full h-9 px-3 text-sm bg-white border border-slate-300 rounded-lg">
                  <option value="exclusive">{isBn ? 'ভ্যাট বহির্ভূত (Exclusive)' : 'Tax Exclusive'}</option>
                  <option value="inclusive">{isBn ? 'ভ্যাট অন্তর্ভুক্ত (Inclusive)' : 'Tax Inclusive'}</option>
                </select>
              </div>
              <div>
                <label htmlFor="org-phone" className="block text-xs text-slate-600 mb-1">{isBn ? 'ফোন' : 'Phone'}</label>
                <input id="org-phone" type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label htmlFor="org-email" className="block text-xs text-slate-600 mb-1">{isBn ? 'ইমেইল' : 'Email'}</label>
                <input id="org-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label htmlFor="org-proprietor" className="block text-xs text-slate-600 mb-1">
                  {isBn ? 'প্রোপ্রাইটর / ব্যবস্থাপনা পরিচালক' : 'Proprietor / Managing Director'}
                </label>
                <input
                  id="org-proprietor"
                  data-testid="org-proprietor"
                  type="text"
                  value={proprietorName}
                  onChange={(e) => setProprietorName(e.target.value)}
                  placeholder={isBn ? 'যেমন: প্রোঃ মোঃ সোহেল রানা' : 'e.g. Proprietor: Md. Sohel Rana'}
                  className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="org-tagline" className="block text-xs text-slate-600 mb-1">
                  {isBn ? 'প্রতিষ্ঠানের স্লোগান / ট্যাগলাইন' : 'Tagline / Slogan'}
                </label>
                <input
                  id="org-tagline"
                  data-testid="org-tagline"
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder={isBn ? 'যেমন: বিশ্বস্ত পাইকারি ও খুচরা সরবরাহকারী' : 'e.g. Trusted Wholesale & Retail Supplier'}
                  className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="org-website" className="block text-xs text-slate-600 mb-1">
                  {isBn ? 'ওয়েবসাইট / ফেসবুক পেজ' : 'Website / Social URL'}
                </label>
                <input
                  id="org-website"
                  data-testid="org-website"
                  type="text"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="www.yourbusiness.com.bd"
                  className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="org-addr" className="block text-xs text-slate-600 mb-1">{isBn ? 'ঠিকানা' : 'Address'}</label>
                <input id="org-addr" type="text" value={address} onChange={(e) => setAddress(e.target.value)} className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg" />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="org-biz-desc" className="block text-xs text-slate-600 mb-1">
                  {isBn ? 'ব্যবসার বিবরণ (ক্যাশ মেমো ও ডকুমেন্ট হেডারে স্বয়ংক্রিয়ভাবে ব্যবহৃত হবে)' : 'Business Description (Auto-synced to Cash Memos & Documents)'}
                </label>
                <textarea
                  id="org-biz-desc"
                  data-testid="org-biz-desc"
                  rows={2}
                  value={businessDescription}
                  onChange={(e) => setBusinessDescription(e.target.value)}
                  placeholder={isBn ? 'আপনার প্রতিষ্ঠানে বিক্রিত প্রধান পণ্য বা সেবার সংক্ষিপ্ত বিবরণ...' : 'Brief description of products or services offered...'}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg resize-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-[11px] text-slate-500">
                {isBn
                  ? 'এখানে সংরক্ষিত তথ্য স্বয়ংক্রিয়ভাবে সকল ক্যাশ মেমো, ইনভয়েস, স্টেটমেন্ট ও পিডিএফে সিঙ্ক হবে।'
                  : 'Saved details automatically sync across all Cash Memos, Invoices, Statements, and PDFs.'}
              </p>
              <button type="submit" data-testid="save-org-settings" className="px-4 py-2 text-xs font-medium text-white bg-[#0F766E] hover:bg-[#115E59] rounded-lg whitespace-nowrap shrink-0">
                {t.actions.save}
              </button>
            </div>
          </form>

          {/* Clean Workspace Reset Control */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-slate-900">
                {isBn ? 'ওয়ার্কস্পেস ডাটা রিসেট' : 'Workspace Data Reset'}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {isBn
                  ? 'প্রতিষ্ঠান ও শাখার তথ্য অক্ষুণ্ণ রেখে সকল লেনদেন, পণ্য ও কাস্টমার তালিকা মুছে নতুন করে শুরু করতে পারেন।'
                  : 'Clear transactional records, products, and party lists while keeping your organization and branches intact.'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleResetClean}
                className="px-3.5 py-2 text-xs font-medium text-rose-700 border border-rose-200 hover:bg-rose-50 rounded-lg whitespace-nowrap"
              >
                {t.actions.startClean}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DESIGN & CUSTOMIZATION (CASH MEMO STUDIO) */}
      {subtab === 'design' && (
        <CashMemoCustomizer
          org={org}
          sampleInvoice={data.invoices[0]}
          defaultBranch={data.branches.find((b) => b.isMain) ?? data.branches[0]}
          lang={lang}
          onSaved={onRefresh}
          onOpenOrgProfile={() => onSubtabChange('organization')}
        />
      )}

      {/* BRANCHES */}
      {subtab === 'branches' && (
        <div className="space-y-4 max-w-3xl">
          <form onSubmit={handleSaveBranch} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="text-sm font-semibold text-slate-900">
              {editingBranch
                ? isBn
                  ? `শাখা সম্পাদনা (${editingBranch.code})`
                  : `Edit Branch (${editingBranch.code})`
                : isBn
                  ? 'নতুন শাখা বা গুদাম যুক্ত করুন'
                  : 'Add Branch / Warehouse'}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <input type="text" required value={bCode} onChange={(e) => setBCode(e.target.value)} placeholder="Code (SYL)" className="h-9 px-3 text-sm font-mono border border-slate-300 rounded-lg" />
              <input type="text" required value={bName} onChange={(e) => setBName(e.target.value)} placeholder="Branch Name *" className="h-9 px-3 text-sm border border-slate-300 rounded-lg" />
              <input type="text" value={bNameBn} onChange={(e) => setBNameBn(e.target.value)} placeholder="বাংলা নাম" className="h-9 px-3 text-sm border border-slate-300 rounded-lg" />
              <input type="text" value={bAddress} onChange={(e) => setBAddress(e.target.value)} placeholder={isBn ? 'ঠিকানা' : 'Address'} className="h-9 px-3 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div className="flex justify-end gap-2">
              {editingBranch && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingBranch(null);
                    setBCode('');
                    setBName('');
                    setBNameBn('');
                    setBAddress('');
                  }}
                  className="px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  {t.actions.cancel}
                </button>
              )}
              <button type="submit" className="inline-flex items-center gap-1 px-4 py-2 text-xs font-medium text-white bg-[#0F766E] rounded-lg">
                <Plus className="w-3.5 h-3.5" />
                {t.actions.save}
              </button>
            </div>
          </form>

          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            {data.branches.map((b) => (
              <div key={b.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">
                    {isBn ? b.nameBn : b.name} <span className="font-mono text-xs text-slate-400 ml-1">({b.code})</span>
                    {b.isMain && (
                      <span className="ml-2 text-xs font-medium text-[#0F766E]">
                        · {isBn ? 'প্রধান শাখা' : 'Head Office'}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{b.address || '—'}</div>
                </div>
                <div className="inline-flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingBranch(b);
                      setBCode(b.code);
                      setBName(b.name);
                      setBNameBn(b.nameBn || '');
                      setBAddress(b.address || '');
                    }}
                    aria-label={`Edit branch ${b.name}`}
                    className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  {!b.isMain && (
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setDeleteTarget({ type: 'branch', item: b });
                      }}
                      aria-label={`Delete branch ${b.name}`}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* USERS & RBAC */}
      {subtab === 'users' && (
        <div className="space-y-5 max-w-3xl">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-[#0F766E]" />
                  {isBn ? 'টিম ইউজার ও রোল-ভিত্তিক পারমিশন (RBAC)' : 'Team Users & Role-Based Permissions'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isBn
                    ? `বর্তমান সেশন: ${session.user.name} (${session.user.role})`
                    : `Active session: ${session.user.name} (${session.user.role})`}
                </p>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {data.users.map((u) => (
                <div key={u.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{u.name}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {u.email} · <span className="uppercase font-mono text-slate-700">{u.role}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {session.user.id === u.id ? (
                      <span className="text-xs font-medium text-[#0F766E] mr-1">{isBn ? 'সক্রিয়' : 'Active'}</span>
                    ) : !org.adminLockEnabled ? (
                      <button
                        type="button"
                        onClick={() => onSwitchUser(u.id)}
                        className="px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-md whitespace-nowrap"
                      >
                        {isBn ? 'এই রোলে দেখুন' : 'Switch Role'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingUser(u);
                        setUName(u.name);
                        setUEmail(u.email);
                        setURole(u.role);
                        setUPassword('');
                      }}
                      aria-label={`Edit user ${u.name}`}
                      className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    {session.user.id !== u.id && (
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleteTarget({ type: 'user', item: u });
                        }}
                        aria-label={`Delete user ${u.name}`}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleSaveUser} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="text-sm font-semibold text-slate-900">
              {editingUser
                ? isBn
                  ? `ইউজার সম্পাদনা (${editingUser.name})`
                  : `Edit Team Member (${editingUser.name})`
                : isBn
                  ? 'নতুন ইউজার যুক্ত করুন'
                  : 'Add Team Member'}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input type="text" required value={uName} onChange={(e) => setUName(e.target.value)} placeholder={isBn ? 'পূর্ণ নাম *' : 'Full Name *'} className="h-9 px-3 text-sm border border-slate-300 rounded-lg" />
              <input type="email" required value={uEmail} onChange={(e) => setUEmail(e.target.value)} placeholder="Email *" className="h-9 px-3 text-sm border border-slate-300 rounded-lg" />
              <select value={uRole} onChange={(e) => setURole(e.target.value as UserRole)} className="h-9 px-3 text-sm bg-white border border-slate-300 rounded-lg">
                <option value="owner">Owner (Full Access)</option>
                <option value="accountant">Accountant (Ledger, VAT, Reversal)</option>
                <option value="manager">Branch Manager</option>
                <option value="cashier">POS Cashier</option>
                <option value="auditor">Auditor (Read-Only)</option>
              </select>
              <input type="password" value={uPassword} onChange={(e) => setUPassword(e.target.value)} placeholder={editingUser ? (isBn ? 'নতুন পাসওয়ার্ড (অপরিবর্তিত রাখতে খালি রাখুন)' : 'New password (leave blank to keep)') : isBn ? 'পাসওয়ার্ড (ঐচ্ছিক, ৬+ অক্ষর)' : 'Password (optional, 6+ chars)'} className="h-9 px-3 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div className="flex justify-end gap-2">
              {editingUser && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingUser(null);
                    setUName('');
                    setUEmail('');
                    setURole('accountant');
                    setUPassword('');
                  }}
                  className="px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  {t.actions.cancel}
                </button>
              )}
              <button type="submit" className="px-4 py-2 text-xs font-medium text-white bg-[#0F766E] rounded-lg">{t.actions.save}</button>
            </div>
          </form>

          {!org.adminLockEnabled && (
            <form onSubmit={handleEnableLock} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-slate-700" />
                {isBn ? 'ওয়ার্কস্পেস অ্যাডমিন পাসওয়ার্ড লক চালু করুন' : 'Enable Workspace Admin Password Lock'}
              </div>
              <p className="text-xs text-slate-500">
                {isBn
                  ? 'পাসওয়ার্ড সেট করলে (scrypt এনক্রিপ্টেড) লগইন ছাড়া কেউ ওয়ার্কস্পেসে প্রবেশ করতে পারবে না।'
                  : 'Protect this workspace with a server-side scrypt-hashed admin password before sharing.'}
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="password"
                  required
                  minLength={6}
                  value={adminPass}
                  onChange={(e) => setAdminPass(e.target.value)}
                  placeholder={isBn ? 'নতুন অ্যাডমিন পাসওয়ার্ড (৬+ অক্ষর)' : 'Choose admin password (6+ chars)'}
                  className="flex-1 h-9 px-3 text-sm border border-slate-300 rounded-lg"
                />
                <button type="submit" className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap">
                  {isBn ? 'পাসওয়ার্ড লক সক্রিয় করুন' : 'Enable Password Lock'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* AUDIT TRAIL */}
      {subtab === 'audit' && (
        <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl overflow-hidden">
          <div className="hidden md:block">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="py-2.5 px-4 text-left font-medium">{isBn ? 'সময়' : 'Timestamp'}</th>
                  <th className="py-2.5 px-4 text-left font-medium">{isBn ? 'ইউজার ও রোল' : 'Actor'}</th>
                  <th className="py-2.5 px-4 text-left font-medium">{isBn ? 'অ্যাকশন' : 'Action'}</th>
                  <th className="py-2.5 px-4 text-left font-medium">{isBn ? 'বিবরণ' : 'Summary'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2.5 px-4 font-mono text-slate-500 whitespace-nowrap">{log.createdAt.replace('T', ' ').slice(0, 19)}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span className="font-medium text-slate-900">{log.actorName}</span>{' '}
                      <span className="text-slate-400">({log.actorRole})</span>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[#0F766E] whitespace-nowrap">{log.action}</td>
                    <td className="py-2.5 px-4 text-slate-700">{log.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Audit Cards */}
          <div className="md:hidden divide-y divide-slate-100 text-xs">
            {data.auditLogs.map((log) => (
              <div key={log.id} className="p-4 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-[#0F766E]">{log.action}</span>
                  <span className="font-mono text-[11px] text-slate-400">{log.createdAt.replace('T', ' ').slice(0, 16)}</span>
                </div>
                <div className="text-slate-800">{log.summary}</div>
                <div className="text-[11px] text-slate-500">
                  {log.actorName} ({log.actorRole})
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        lang={lang}
        title={
          deleteTarget?.type === 'branch'
            ? isBn
              ? 'শাখা মুছে ফেলবেন?'
              : 'Delete Branch?'
            : isBn
              ? 'টিম ইউজার মুছে ফেলবেন?'
              : 'Delete Team Member?'
        }
        itemLabel={
          deleteTarget?.type === 'branch'
            ? `${isBn ? deleteTarget.item.nameBn : deleteTarget.item.name} (${deleteTarget.item.code})`
            : deleteTarget?.item
              ? `${deleteTarget.item.name} (${deleteTarget.item.email})`
              : ''
        }
        description={
          deleteTarget?.type === 'branch'
            ? isBn
              ? 'এই শাখায় কোনো স্টক বা লেনদেন যুক্ত না থাকলে শাখাটি স্থায়ীভাবে মুছে যাবে।'
              : 'Removes this branch permanently if no stock, staff, or transactions are linked.'
            : isBn
              ? 'এই ইউজারের অ্যাকাউন্ট ও সক্রিয় সেশন স্থায়ীভাবে বাতিল হয়ে যাবে।'
              : 'Permanently removes this team member account and revokes all active sessions.'
        }
        busy={deleting}
        error={deleteError}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

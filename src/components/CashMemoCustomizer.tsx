import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Database,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Minus,
  Palette,
  Plus,
  Printer,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Type,
} from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import type { Branch, Invoice, Language, Organization } from '../engine/types';
import { apiRequest } from '../lib/api';
import {
  buildEmptyStructuralInvoice,
  CASH_MEMO_FONTS,
  CASH_MEMO_FONT_IDS,
  CASH_MEMO_FONT_SIZE_BOUNDS,
  CASH_MEMO_TEMPLATES,
  CASH_MEMO_TEMPLATE_IDS,
  resolveCashMemoConfig,
  sanitizeCashMemoSettings,
  type CashMemoFontId,
  type CashMemoSettings,
  type CashMemoTemplateCustomization,
  type CashMemoTemplateId,
  type ThermalPaperWidth,
} from '../lib/cashMemoTemplates';
import { downloadPdfDocument, printThermalReceipt } from '../lib/pdfExport';
import { CashMemoPreviewFrame } from './CashMemoPreviewFrame';

interface Props {
  org: Organization;
  sampleInvoice?: Invoice;
  defaultBranch?: Branch;
  lang: Language;
  onSaved: () => Promise<void>;
  onOpenOrgProfile?: () => void;
}

type EditorSection = 'header' | 'typography' | 'style' | 'vat' | 'table';

function TemplateMiniThumb({
  id,
  primary,
  accent,
}: {
  id: CashMemoTemplateId;
  primary: string;
  accent: string;
}) {
  if (id === 'navy-amber') {
    return (
      <div className="w-full h-14 rounded-md border border-slate-200 bg-white overflow-hidden flex flex-col">
        <div
          className="h-3.5 w-full"
          style={{
            background: `linear-gradient(125deg, ${primary} 0%, ${primary} 62%, #FFFFFF 62%, #FFFFFF 67%, ${accent} 67%, ${accent} 100%)`,
          }}
        />
        <div className="flex-1 p-1.5 flex flex-col justify-between">
          <div className="h-1.5 w-16 rounded-sm bg-slate-800 mx-auto" />
          <div className="h-2 w-full rounded-[2px]" style={{ background: primary }} />
          <div className="space-y-0.5">
            <div className="h-0.5 w-full bg-slate-200" />
            <div className="h-0.5 w-4/5 bg-slate-200" />
          </div>
        </div>
      </div>
    );
  }
  if (id === 'crimson-black') {
    return (
      <div className="w-full h-14 rounded-md border border-slate-200 bg-white overflow-hidden flex flex-col">
        <div className="flex h-3">
          <div className="w-1/2" style={{ background: primary }} />
          <div className="w-1/2" style={{ background: accent }} />
        </div>
        <div className="flex-1 p-1.5 flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <div className="h-1.5 w-12 bg-slate-900 rounded-sm" />
            <div className="h-2.5 w-9 rounded-[2px]" style={{ background: accent }} />
          </div>
          <div className="h-2 w-full rounded-[2px]" style={{ background: primary }} />
          <div className="h-1 w-full bg-slate-200" />
        </div>
      </div>
    );
  }
  if (id === 'charcoal-gold') {
    return (
      <div className="w-full h-14 rounded-md border border-slate-200 bg-[#FEFCE8] overflow-hidden flex flex-col">
        <div
          className="h-5 w-full"
          style={{
            background: `linear-gradient(112deg, ${primary} 0%, ${primary} 64%, ${accent} 64%, ${accent} 100%)`,
          }}
        />
        <div className="flex-1 p-1.5 flex flex-col justify-between">
          <div className="h-2 w-full rounded-[2px]" style={{ background: primary }} />
          <div className="grid grid-cols-3 gap-1">
            <div className="h-3 bg-yellow-100 border border-slate-300" />
            <div className="h-3 bg-white border border-slate-300" />
            <div className="h-3 bg-yellow-100 border border-slate-300" />
          </div>
        </div>
      </div>
    );
  }
  if (id === 'bengali-classic') {
    return (
      <div className="w-full h-14 rounded-md border border-slate-200 bg-[#ECFDF5] overflow-hidden flex flex-col">
        <div className="h-5 bg-gradient-to-b from-amber-50 to-white border-b-2 px-1.5 flex flex-col justify-center items-center" style={{ borderColor: primary }}>
          <div className="h-1.5 w-14 rounded-sm" style={{ background: primary }} />
          <div className="h-1 w-8 rounded-full mt-0.5" style={{ background: primary }} />
        </div>
        <div className="flex-1 p-1.5 flex flex-col justify-between">
          <div className="flex h-2 w-full overflow-hidden rounded-[2px]">
            <div className="w-1/2" style={{ background: accent }} />
            <div className="w-1/4" style={{ background: primary }} />
            <div className="w-1/4 bg-sky-600" />
          </div>
          <div className="h-1.5 w-full bg-white border border-emerald-200" />
        </div>
      </div>
    );
  }
  if (id === 'ocean-corporate') {
    return (
      <div className="w-full h-14 rounded-md border border-slate-200 bg-white overflow-hidden flex flex-col">
        <div
          className="h-5 w-full"
          style={{
            background: `linear-gradient(108deg, #FFFFFF 0%, #FFFFFF 55%, ${primary} 55%, ${accent} 100%)`,
          }}
        />
        <div className="h-1.5 w-full" style={{ background: primary }} />
        <div className="flex-1 p-1.5 flex flex-col justify-between">
          <div className="h-2 w-full rounded-[2px]" style={{ background: primary }} />
          <div className="h-1 w-full bg-sky-100" />
        </div>
      </div>
    );
  }
  if (id === 'sunset-ember') {
    return (
      <div className="w-full h-14 rounded-md border border-slate-200 bg-white overflow-hidden flex flex-col">
        <div
          className="h-5 w-full"
          style={{
            background: `linear-gradient(108deg, #FFFFFF 0%, #FFFFFF 52%, ${primary} 52%, ${accent} 62%, ${accent} 100%)`,
          }}
        />
        <div className="flex-1 p-1.5 flex flex-col justify-between">
          <div className="h-2 w-full rounded-[2px]" style={{ background: `linear-gradient(90deg, #F59E0B, ${primary})` }} />
          <div className="h-1.5 w-full bg-amber-50 border border-amber-200" />
        </div>
      </div>
    );
  }
  // heritage-enterprise
  return (
    <div className="w-full h-14 rounded-md border border-slate-200 bg-[#F0F9FF] overflow-hidden flex flex-col">
      <div className="h-5 bg-yellow-100 border-l-4 flex items-center justify-center relative" style={{ borderColor: primary }}>
        <div className="h-1.5 w-14 rounded-sm" style={{ background: primary }} />
        <div className="absolute right-0 top-0 bottom-0 w-1.5 bg-red-600" />
      </div>
      <div className="h-1.5 w-full" style={{ background: accent }} />
      <div className="flex-1 p-1.5 flex flex-col justify-between">
        <div className="flex h-2 w-full">
          <div className="w-1/2" style={{ background: primary }} />
          <div className="w-1/4 bg-red-600" />
          <div className="w-1/4" style={{ background: accent }} />
        </div>
        <div className="h-1 w-full bg-white border border-emerald-200" />
      </div>
    </div>
  );
}

export function CashMemoCustomizer({
  org,
  sampleInvoice,
  defaultBranch,
  lang,
  onSaved,
  onOpenOrgProfile,
}: Props) {
  const isBn = lang === 'bn';
  const { notify } = useFeedback();
  const [settings, setSettings] = useState<CashMemoSettings>(() =>
    sanitizeCashMemoSettings(org.cashMemoSettings)
  );
  const [selectedId, setSelectedId] = useState<CashMemoTemplateId>(
    () => sanitizeCashMemoSettings(org.cashMemoSettings).activeTemplateId
  );
  const [section, setSection] = useState<EditorSection>('header');
  const [previewIncludeVat, setPreviewIncludeVat] = useState<boolean>(() => {
    const resolved = resolveCashMemoConfig(org.cashMemoSettings, undefined, org, lang);
    return resolved.config.defaultIncludeVat;
  });
  // Draft values ONLY for Organization DB fields that are currently empty in SQLite;
  // filled values sync directly into the Organization DB table on Save.
  const [missingOrgDraft, setMissingOrgDraft] = useState<{
    proprietorName: string;
    tagline: string;
    website: string;
    businessDescription: string;
    phone: string;
    email: string;
    address: string;
  }>({
    proprietorName: '',
    tagline: '',
    website: '',
    businessDescription: '',
    phone: '',
    email: '',
    address: '',
  });
  const [saving, setSaving] = useState(false);
  const [exportingTest, setExportingTest] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync if org.cashMemoSettings refreshes from server
  useEffect(() => {
    const next = sanitizeCashMemoSettings(org.cashMemoSettings);
    setSettings(next);
  }, [org.cashMemoSettings]);

  // Live merged Organization object for immediate preview of newly filled missing DB fields
  const effectiveOrg = useMemo<Organization>(
    () => ({
      ...org,
      proprietorName: org.proprietorName?.trim() || missingOrgDraft.proprietorName.trim(),
      tagline: org.tagline?.trim() || missingOrgDraft.tagline.trim(),
      website: org.website?.trim() || missingOrgDraft.website.trim(),
      businessDescription: org.businessDescription?.trim() || missingOrgDraft.businessDescription.trim(),
      phone: org.phone?.trim() || missingOrgDraft.phone.trim(),
      email: org.email?.trim() || missingOrgDraft.email.trim(),
      address: org.address?.trim() || missingOrgDraft.address.trim(),
    }),
    [org, missingOrgDraft]
  );

  const resolvedCurrent = useMemo(
    () => resolveCashMemoConfig(settings, selectedId, effectiveOrg, lang),
    [settings, selectedId, effectiveOrg, lang]
  );
  const cfg = resolvedCurrent.config;
  const selectedMeta = CASH_MEMO_TEMPLATES[selectedId];
  const isSelectedActive = settings.activeTemplateId === selectedId;

  const previewInvoice = useMemo(
    () => sampleInvoice || buildEmptyStructuralInvoice(effectiveOrg, defaultBranch, lang),
    [sampleInvoice, effectiveOrg, defaultBranch, lang]
  );
  const hasLiveDbInvoice = Boolean(sampleInvoice);

  // When switching templates in the gallery, align preview VAT mode with that template's default
  const handleSelectTemplate = (id: CashMemoTemplateId) => {
    setSelectedId(id);
    const nextResolved = resolveCashMemoConfig(settings, id, effectiveOrg, lang);
    setPreviewIncludeVat(nextResolved.config.defaultIncludeVat);
    setStatusMessage(null);
    setErrorMessage(null);
  };

  const updateField = <K extends keyof CashMemoTemplateCustomization>(
    field: K,
    value: CashMemoTemplateCustomization[K]
  ) => {
    setSettings((prev) => ({
      ...prev,
      templates: {
        ...prev.templates,
        [selectedId]: {
          ...(prev.templates[selectedId] ?? {}),
          [field]: value,
        },
      },
    }));
    if (field === 'defaultIncludeVat' && typeof value === 'boolean') {
      setPreviewIncludeVat(value);
    }
    setStatusMessage(null);
  };

  const handleThermalWidthChange = (width: ThermalPaperWidth) => {
    setSettings((prev) => ({ ...prev, thermalPaperWidth: width }));
    setStatusMessage(null);
  };

  const handleResetTemplate = () => {
    setSettings((prev) => {
      const nextTemplates = { ...prev.templates };
      delete nextTemplates[selectedId];
      return { ...prev, templates: nextTemplates };
    });
    setPreviewIncludeVat(CASH_MEMO_TEMPLATES[selectedId].defaults.defaultIncludeVat);
    const msg = isBn
      ? 'এই টেমপ্লেটের কাস্টমাইজেশন ডিফল্টে রিসেট করা হয়েছে (সংরক্ষণে ক্লিক করুন)।'
      : 'Current template reset to defaults (click Save to persist).';
    setStatusMessage(msg);
    notify({ title: msg, variant: 'info', sound: 'save' });
  };

  const persistSettings = async (nextSettings: CashMemoSettings, successText: string) => {
    setSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const payload: Record<string, unknown> = { cashMemoSettings: nextSettings };
      // Smart DB Sync: if user filled any missing organization profile fields inline, persist them once to DB
      if (!org.proprietorName?.trim() && missingOrgDraft.proprietorName.trim()) {
        payload.proprietorName = missingOrgDraft.proprietorName.trim();
      }
      if (!org.tagline?.trim() && missingOrgDraft.tagline.trim()) {
        payload.tagline = missingOrgDraft.tagline.trim();
      }
      if (!org.website?.trim() && missingOrgDraft.website.trim()) {
        payload.website = missingOrgDraft.website.trim();
      }
      if (!org.businessDescription?.trim() && missingOrgDraft.businessDescription.trim()) {
        payload.businessDescription = missingOrgDraft.businessDescription.trim();
      }
      if (!org.phone?.trim() && missingOrgDraft.phone.trim()) {
        payload.phone = missingOrgDraft.phone.trim();
      }
      if (!org.email?.trim() && missingOrgDraft.email.trim()) {
        payload.email = missingOrgDraft.email.trim();
      }
      if (!org.address?.trim() && missingOrgDraft.address.trim()) {
        payload.address = missingOrgDraft.address.trim();
      }

      await apiRequest('/api/organization', {
        method: 'PATCH',
        body: payload,
      });
      setSettings(nextSettings);
      setMissingOrgDraft({
        proprietorName: '',
        tagline: '',
        website: '',
        businessDescription: '',
        phone: '',
        email: '',
        address: '',
      });
      setStatusMessage(successText);
      notify({ title: successText, variant: 'success', sound: 'save' });
      await onSaved();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : isBn
            ? 'ক্যাশ মেমো ডিজাইন সংরক্ষণ করা যায়নি।'
            : 'Failed to save Cash Memo customization.';
      setErrorMessage(msg);
      notify({ title: msg, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleActivateAndSave = async () => {
    const next: CashMemoSettings = {
      ...settings,
      activeTemplateId: selectedId,
    };
    await persistSettings(
      next,
      isBn
        ? `"${selectedMeta.nameBn}" ক্যাশ মেমো অ্যাকটিভ ও সংরক্ষিত হয়েছে। এখন থেকে সকল POS বিক্রয়ে এই ডিজাইন ব্যবহৃত হবে।`
        : `"${selectedMeta.nameEn}" is now active and saved for all future POS Cash Memos.`
    );
  };

  const handleSaveOnly = async () => {
    await persistSettings(
      settings,
      isBn
        ? `"${selectedMeta.nameBn}" টেমপ্লেটের পরিবর্তন সংরক্ষিত হয়েছে।`
        : `Saved customization changes for "${selectedMeta.nameEn}".`
    );
  };

  const handleDownloadSamplePdf = async () => {
    setExportingTest(true);
    setErrorMessage(null);
    try {
      await downloadPdfDocument(
        {
          type: 'pos_receipt',
          invoice: previewInvoice,
          includeVat: previewIncludeVat,
          templateId: selectedId,
          settings,
        },
        effectiveOrg,
        lang
      );
      notify({
        title: isBn ? 'ক্যাশ মেমো পিডিএফ ডাউনলোড হয়েছে।' : 'Cash Memo PDF downloaded.',
        variant: 'info',
        sound: 'export',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'PDF export failed';
      setErrorMessage(msg);
      notify({ title: msg, variant: 'error' });
    } finally {
      setExportingTest(false);
    }
  };

  const activeMeta = CASH_MEMO_TEMPLATES[settings.activeTemplateId];

  return (
    <div className="space-y-5 pb-20" data-testid="cash-memo-customizer">
      {/* Studio Section Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-[#0F766E] shrink-0" />
            <h2 className="text-base font-semibold text-slate-900">
              {isBn ? 'ক্যাশ মেমো কাস্টমাইজেশন' : 'Cash Memo Customization'}
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {isBn
              ? `বর্তমান অ্যাকটিভ ডিজাইন: ${activeMeta.nameBn} — প্রতিটি টেমপ্লেট আলাদাভাবে কাস্টমাইজ করে অ্যাকটিভ করতে পারবেন।`
              : `Active POS Design: ${activeMeta.nameEn} — customize every template independently and activate your preferred design.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="inline-flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span className="whitespace-nowrap">{isBn ? 'টার্মিনাল পেপার:' : 'Thermal Width:'}</span>
            <select
              aria-label={isBn ? 'টার্মিনাল পেপার সাইজ' : 'Thermal Paper Width'}
              value={settings.thermalPaperWidth}
              onChange={(e) => handleThermalWidthChange(e.target.value as ThermalPaperWidth)}
              className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs font-mono font-medium text-slate-800"
            >
              <option value="80mm">80mm</option>
              <option value="58mm">58mm</option>
            </select>
          </div>

          {!isSelectedActive && (
            <button
              type="button"
              disabled={saving}
              onClick={handleSaveOnly}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isBn ? 'খসড়া সংরক্ষণ' : 'Save Draft'}</span>
            </button>
          )}

          <button
            type="button"
            data-testid="activate-cash-memo-template"
            disabled={saving}
            onClick={handleActivateAndSave}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#115E59] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            <span>
              {isSelectedActive
                ? isBn
                  ? 'পরিবর্তন সংরক্ষণ করুন'
                  : 'Save Changes'
                : isBn
                  ? 'এই ডিজাইন অ্যাকটিভ করুন'
                  : 'Activate This Design'}
            </span>
          </button>
        </div>
      </div>

      {errorMessage && (
        <div role="alert" className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
          {errorMessage}
        </div>
      )}
      {statusMessage && (
        <div role="status" className="p-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg">
          {statusMessage}
        </div>
      )}

      {/* 7-Template Visual Gallery */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold text-slate-800">
            {isBn
              ? 'ক্যাশ মেমো টেমপ্লেট নির্বাচন করুন (৭টি প্রফেশনাল ডিজাইন)'
              : 'Select Cash Memo Template (7 Professional Designs)'}
          </div>
          <div className="text-[11px] text-slate-500">
            {isBn ? 'ক্লিক করে আলাদাভাবে এডিট ও প্রিভিউ করুন' : 'Click any design to edit independently'}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
          {CASH_MEMO_TEMPLATE_IDS.map((id) => {
            const meta = CASH_MEMO_TEMPLATES[id];
            const isActive = settings.activeTemplateId === id;
            const isEditing = selectedId === id;
            const customColors = settings.templates[id];
            const primary = customColors?.primaryColor || meta.previewPrimary;
            const accent = customColors?.accentColor || meta.previewAccent;

            return (
              <button
                key={id}
                type="button"
                data-testid={`cash-memo-card-${id}`}
                data-active={isActive ? 'true' : 'false'}
                onClick={() => handleSelectTemplate(id)}
                className={`group text-left rounded-xl p-2 border transition-all flex flex-col gap-2 ${
                  isEditing
                    ? 'border-[#0F766E] bg-teal-50/40 ring-1 ring-[#0F766E]'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <TemplateMiniThumb id={id} primary={primary} accent={accent} />
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-slate-900 leading-snug line-clamp-2">
                    {isBn ? meta.nameBn : meta.nameEn}
                  </div>
                  {isActive && (
                    <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-[#0F766E]">
                      <Check className="w-3 h-3" />
                      <span>{isBn ? 'অ্যাকটিভ' : 'Active'}</span>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main 2-Column Customization Studio */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Editor Panel */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 truncate">
                {isBn ? selectedMeta.nameBn : selectedMeta.nameEn}
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                {isBn ? selectedMeta.subtitleBn : selectedMeta.subtitleEn}
              </div>
            </div>
            <button
              type="button"
              onClick={handleResetTemplate}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3 h-3" />
              <span>{isBn ? 'রিসেট' : 'Reset'}</span>
            </button>
          </div>

          {/* 5 Focused Sub-Section Tabs */}
          <div className="grid grid-cols-5 border-b border-slate-200 bg-white text-[11px]">
            {(
              [
                { id: 'header', labelBn: 'হেডার', labelEn: 'Header', icon: FileText },
                { id: 'typography', labelBn: 'ফন্ট ও সাইজ', labelEn: 'Fonts', icon: Type },
                { id: 'style', labelBn: 'রঙ', labelEn: 'Colors', icon: Sparkles },
                { id: 'vat', labelBn: 'মূসক', labelEn: 'VAT', icon: SlidersHorizontal },
                { id: 'table', labelBn: 'কলাম', labelEn: 'Columns', icon: Table2 },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = section === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-testid={`cm-tab-${tab.id}`}
                  onClick={() => setSection(tab.id)}
                  className={`py-2.5 px-1 flex flex-col items-center justify-center gap-1 font-medium border-b-2 transition-colors ${
                    active
                      ? 'border-[#0F766E] text-[#0F766E] bg-teal-50/30'
                      : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate max-w-full">{isBn ? tab.labelBn : tab.labelEn}</span>
                </button>
              );
            })}
          </div>

          <div className="p-4 space-y-4">
            {/* TAB 1: HEADER & DATABASE-FIRST IDENTITY */}
            {section === 'header' && (
              <div className="space-y-4">
                {/* Live Database-Synced Organization Identity Card */}
                <div
                  data-testid="cm-db-synced-card"
                  className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                      <Database className="w-3.5 h-3.5 text-[#0F766E] shrink-0" />
                      <span>{isBn ? 'ডাটাবেজ থেকে স্বয়ংক্রিয়ভাবে সিঙ্ককৃত তথ্য' : 'Auto-Synced from Organization Database'}</span>
                    </div>
                    {onOpenOrgProfile && (
                      <button
                        type="button"
                        onClick={onOpenOrgProfile}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0F766E] hover:text-[#115E59] whitespace-nowrap"
                      >
                        <span>{isBn ? 'সম্পাদনা' : 'Edit Profile'}</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <dl className="grid grid-cols-1 gap-1.5 text-[11px] text-slate-600">
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-400 shrink-0">{isBn ? 'প্রতিষ্ঠান:' : 'Business:'}</dt>
                      <dd className="font-medium text-slate-800 text-right truncate">
                        {isBn ? org.nameBn || org.name : org.name}
                      </dd>
                    </div>
                    {org.phone && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-400 shrink-0">{isBn ? 'ফোন:' : 'Phone:'}</dt>
                        <dd className="font-mono text-slate-800 text-right truncate">{org.phone}</dd>
                      </div>
                    )}
                    {org.email && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-400 shrink-0">{isBn ? 'ইমেইল:' : 'Email:'}</dt>
                        <dd className="text-slate-800 text-right truncate">{org.email}</dd>
                      </div>
                    )}
                    {org.address && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-400 shrink-0">{isBn ? 'ঠিকানা:' : 'Address:'}</dt>
                        <dd className="text-slate-800 text-right truncate">{org.address}</dd>
                      </div>
                    )}
                    {org.proprietorName && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-400 shrink-0">{isBn ? 'প্রোপ্রাইটর:' : 'Proprietor:'}</dt>
                        <dd className="text-slate-800 text-right truncate">{org.proprietorName}</dd>
                      </div>
                    )}
                    {org.tagline && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-400 shrink-0">{isBn ? 'স্লোগান:' : 'Tagline:'}</dt>
                        <dd className="text-slate-800 text-right truncate">{org.tagline}</dd>
                      </div>
                    )}
                    {org.website && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-400 shrink-0">{isBn ? 'ওয়েবসাইট:' : 'Website:'}</dt>
                        <dd className="text-slate-800 text-right truncate">{org.website}</dd>
                      </div>
                    )}
                    {org.businessDescription && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-400 shrink-0">{isBn ? 'বিবরণ:' : 'Description:'}</dt>
                        <dd className="text-slate-800 text-right truncate">{org.businessDescription}</dd>
                      </div>
                    )}
                  </dl>
                  <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-200/70">
                    {isBn
                      ? 'এসব তথ্য প্রতি টেমপ্লেটে আলাদাভাবে লিখতে হয় না — প্রতিষ্ঠানের তথ্য বদলালেই সব মেমো ও ইনভয়েসে সিঙ্ক হয়।'
                      : 'No need to re-type per template — updates in Organization Profile auto-sync to every Cash Memo & Invoice.'}
                  </p>
                </div>

                {/* Only render inputs for Organization DB fields that are currently MISSING in SQLite */}
                {(!org.proprietorName?.trim() ||
                  !org.tagline?.trim() ||
                  !org.website?.trim() ||
                  !org.businessDescription?.trim() ||
                  !org.phone?.trim() ||
                  !org.email?.trim() ||
                  !org.address?.trim()) && (
                  <div
                    data-testid="cm-missing-db-fields"
                    className="p-3 bg-white border border-slate-200 rounded-lg space-y-2.5"
                  >
                    <div>
                      <div className="text-xs font-semibold text-slate-800">
                        {isBn ? 'ডাটাবেজে অনুপস্থিত তথ্য যোগ করুন (ঐচ্ছিক)' : 'Fill Missing Profile Fields (Optional)'}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {isBn
                          ? 'এখানে লিখলে তা প্রতিষ্ঠানের ডাটাবেজে একবার সংরক্ষিত হয়ে সব জায়গায় সিঙ্ক হবে।'
                          : 'Values entered here save directly to your Organization Profile and sync everywhere.'}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {!org.proprietorName?.trim() && (
                        <div>
                          <label htmlFor="cm-missing-proprietor" className="block text-[11px] text-slate-600 mb-1">
                            {isBn ? 'প্রোপ্রাইটর / পদবি' : 'Proprietor / Manager'}
                          </label>
                          <input
                            id="cm-missing-proprietor"
                            type="text"
                            value={missingOrgDraft.proprietorName}
                            onChange={(e) => setMissingOrgDraft((p) => ({ ...p, proprietorName: e.target.value }))}
                            placeholder={isBn ? 'যেমন: প্রোঃ মোঃ সোহেল রানা' : 'e.g. Proprietor: Md. Sohel Rana'}
                            className="w-full h-8 px-2.5 text-xs border border-slate-300 rounded-lg"
                          />
                        </div>
                      )}
                      {!org.tagline?.trim() && (
                        <div>
                          <label htmlFor="cm-missing-tagline" className="block text-[11px] text-slate-600 mb-1">
                            {isBn ? 'ট্যাগলাইন / স্লোগান' : 'Tagline / Slogan'}
                          </label>
                          <input
                            id="cm-missing-tagline"
                            type="text"
                            value={missingOrgDraft.tagline}
                            onChange={(e) => setMissingOrgDraft((p) => ({ ...p, tagline: e.target.value }))}
                            placeholder={isBn ? 'প্রতিষ্ঠানের স্লোগান' : 'Business tagline'}
                            className="w-full h-8 px-2.5 text-xs border border-slate-300 rounded-lg"
                          />
                        </div>
                      )}
                      {!org.website?.trim() && (
                        <div>
                          <label htmlFor="cm-missing-website" className="block text-[11px] text-slate-600 mb-1">
                            {isBn ? 'ওয়েবসাইট' : 'Website'}
                          </label>
                          <input
                            id="cm-missing-website"
                            type="text"
                            value={missingOrgDraft.website}
                            onChange={(e) => setMissingOrgDraft((p) => ({ ...p, website: e.target.value }))}
                            placeholder="www.yourbusiness.com.bd"
                            className="w-full h-8 px-2.5 text-xs border border-slate-300 rounded-lg"
                          />
                        </div>
                      )}
                      {!org.phone?.trim() && (
                        <div>
                          <label htmlFor="cm-missing-phone" className="block text-[11px] text-slate-600 mb-1">
                            {isBn ? 'মোবাইল / ফোন' : 'Phone'}
                          </label>
                          <input
                            id="cm-missing-phone"
                            type="text"
                            value={missingOrgDraft.phone}
                            onChange={(e) => setMissingOrgDraft((p) => ({ ...p, phone: e.target.value }))}
                            className="w-full h-8 px-2.5 text-xs border border-slate-300 rounded-lg"
                          />
                        </div>
                      )}
                      {!org.email?.trim() && (
                        <div>
                          <label htmlFor="cm-missing-email" className="block text-[11px] text-slate-600 mb-1">
                            {isBn ? 'ইমেইল' : 'Email'}
                          </label>
                          <input
                            id="cm-missing-email"
                            type="email"
                            value={missingOrgDraft.email}
                            onChange={(e) => setMissingOrgDraft((p) => ({ ...p, email: e.target.value }))}
                            className="w-full h-8 px-2.5 text-xs border border-slate-300 rounded-lg"
                          />
                        </div>
                      )}
                      {!org.address?.trim() && (
                        <div>
                          <label htmlFor="cm-missing-address" className="block text-[11px] text-slate-600 mb-1">
                            {isBn ? 'ঠিকানা' : 'Address'}
                          </label>
                          <input
                            id="cm-missing-address"
                            type="text"
                            value={missingOrgDraft.address}
                            onChange={(e) => setMissingOrgDraft((p) => ({ ...p, address: e.target.value }))}
                            className="w-full h-8 px-2.5 text-xs border border-slate-300 rounded-lg"
                          />
                        </div>
                      )}
                    </div>

                    {!org.businessDescription?.trim() && (
                      <div>
                        <label htmlFor="cm-missing-desc" className="block text-[11px] text-slate-600 mb-1">
                          {isBn ? 'ব্যবসার বিবরণ' : 'Business Description'}
                        </label>
                        <textarea
                          id="cm-missing-desc"
                          rows={2}
                          value={missingOrgDraft.businessDescription}
                          onChange={(e) => setMissingOrgDraft((p) => ({ ...p, businessDescription: e.target.value }))}
                          placeholder={isBn ? 'যেমন: পাইকারি ও খুচরা বিক্রেতা' : 'Products or services summary'}
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg resize-none"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Template-Specific Document Header Labels (Non-DB Fields) */}
                <div className="space-y-3 pt-1 border-t border-slate-100">
                  <div className="text-xs font-semibold text-slate-800">
                    {isBn ? 'এই টেমপ্লেটের নিজস্ব শিরোনাম ও প্রারম্ভিক লেখা' : 'Template Document Labels'}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="cm-show-invocation" className="text-xs font-medium text-slate-700">
                      {isBn ? 'উপরে ধর্মীয়/প্রারম্ভিক বাণী দেখান' : 'Show Top Invocation Line'}
                    </label>
                    <input
                      id="cm-show-invocation"
                      type="checkbox"
                      checked={cfg.showInvocation}
                      onChange={(e) => updateField('showInvocation', e.target.checked)}
                      className="h-4 w-4 accent-[#0F766E] rounded"
                    />
                  </div>

                  {cfg.showInvocation && (
                    <div>
                      <label htmlFor="cm-invocation" className="block text-xs text-slate-600 mb-1">
                        {isBn ? 'প্রারম্ভিক লেখা' : 'Invocation Text'}
                      </label>
                      <input
                        id="cm-invocation"
                        type="text"
                        value={cfg.invocationText}
                        onChange={(e) => updateField('invocationText', e.target.value)}
                        className="w-full h-9 px-3 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                  )}

                  <div>
                    <label htmlFor="cm-memo-title" className="block text-xs text-slate-600 mb-1">
                      {isBn ? 'মেমো শিরোনাম / ব্যাজ' : 'Memo Title / Badge'}
                    </label>
                    <input
                      id="cm-memo-title"
                      type="text"
                      value={cfg.memoTitle}
                      onChange={(e) => updateField('memoTitle', e.target.value)}
                      className="w-full h-9 px-3 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: TYPOGRAPHY (PER-SECTION FONT FAMILY & PIXEL SIZES) */}
            {section === 'typography' && (
              <div className="space-y-3.5" data-testid="cm-typography-panel">
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {isBn
                    ? 'এই টেমপ্লেটের হেডার, কাস্টমার তথ্য, টেবিল ও ফুটারের ফন্ট এবং পিক্সেল সাইজ আলাদাভাবে ছোট-বড় করুন। লাইভ প্রিভিউ ও পিডিএফ উভয়েই কার্যকর হবে।'
                    : 'Customize font family and exact pixel size independently for Header, Customer Info, Table, and Footer. Applies live to preview, PDF, and thermal print.'}
                </p>

                {(
                  [
                    {
                      sectionKey: 'header',
                      titleBn: '১. হেডার (প্রতিষ্ঠানের নাম ও ঠিকানা)',
                      titleEn: '1. Header (Business Title & Address)',
                      fontField: 'headerFontFamily' as const,
                      sizes: [
                        {
                          field: 'headerTitleSize' as const,
                          labelBn: 'প্রতিষ্ঠানের নামের সাইজ',
                          labelEn: 'Business Title Size',
                          bounds: CASH_MEMO_FONT_SIZE_BOUNDS.headerTitleSize,
                        },
                        {
                          field: 'headerMetaSize' as const,
                          labelBn: 'ঠিকানা / স্লোগান / প্রোপ্রাইটর সাইজ',
                          labelEn: 'Address / Meta Size',
                          bounds: CASH_MEMO_FONT_SIZE_BOUNDS.headerMetaSize,
                        },
                      ],
                    },
                    {
                      sectionKey: 'body',
                      titleBn: '২. কাস্টমার ও তারিখ অংশ',
                      titleEn: '2. Customer & Date Block',
                      fontField: 'bodyFontFamily' as const,
                      sizes: [
                        {
                          field: 'bodyFontSize' as const,
                          labelBn: 'কাস্টমার তথ্যের ফন্ট সাইজ',
                          labelEn: 'Customer Details Size',
                          bounds: CASH_MEMO_FONT_SIZE_BOUNDS.bodyFontSize,
                        },
                      ],
                    },
                    {
                      sectionKey: 'table',
                      titleBn: '৩. পণ্যের টেবিল ও মোট হিসাব',
                      titleEn: '3. Line Items Table & Totals',
                      fontField: 'tableFontFamily' as const,
                      sizes: [
                        {
                          field: 'tableHeaderSize' as const,
                          labelBn: 'টেবিল হেডার সাইজ',
                          labelEn: 'Table Header Size',
                          bounds: CASH_MEMO_FONT_SIZE_BOUNDS.tableHeaderSize,
                        },
                        {
                          field: 'tableCellSize' as const,
                          labelBn: 'টেবিল বিবরণ ও অঙ্কের সাইজ',
                          labelEn: 'Table Row & Totals Size',
                          bounds: CASH_MEMO_FONT_SIZE_BOUNDS.tableCellSize,
                        },
                      ],
                    },
                    {
                      sectionKey: 'footer',
                      titleBn: '৪. ফুটার, কথায় ও স্বাক্ষর',
                      titleEn: '4. Footer, Amount in Words & Signatures',
                      fontField: 'footerFontFamily' as const,
                      sizes: [
                        {
                          field: 'footerFontSize' as const,
                          labelBn: 'ফুটার ও স্বাক্ষরের ফন্ট সাইজ',
                          labelEn: 'Footer & Signature Size',
                          bounds: CASH_MEMO_FONT_SIZE_BOUNDS.footerFontSize,
                        },
                      ],
                    },
                  ] as const
                ).map((group) => (
                  <div
                    key={group.sectionKey}
                    className="p-3 bg-slate-50/70 border border-slate-200 rounded-xl space-y-2.5"
                  >
                    <div className="text-xs font-semibold text-slate-900">
                      {isBn ? group.titleBn : group.titleEn}
                    </div>

                    <div>
                      <label htmlFor={`cm-${group.fontField}`} className="block text-[11px] text-slate-600 mb-1">
                        {isBn ? 'ফন্ট নির্বাচন করুন' : 'Font Family'}
                      </label>
                      <select
                        id={`cm-${group.fontField}`}
                        data-testid={`cm-${group.fontField}`}
                        value={cfg[group.fontField]}
                        onChange={(e) => updateField(group.fontField, e.target.value as CashMemoFontId)}
                        className="w-full h-8 px-2.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0F766E]"
                      >
                        {CASH_MEMO_FONT_IDS.map((fid) => (
                          <option key={fid} value={fid}>
                            {isBn ? CASH_MEMO_FONTS[fid].labelBn : CASH_MEMO_FONTS[fid].labelEn}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      {group.sizes.map((sz) => {
                        const currentVal = cfg[sz.field];
                        return (
                          <div key={sz.field} className="space-y-1">
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <label htmlFor={`cm-${sz.field}`} className="text-slate-600">
                                {isBn ? sz.labelBn : sz.labelEn}
                              </label>
                              <span
                                data-testid={`cm-${sz.field}-val`}
                                className="font-mono font-semibold text-slate-900 tabular-nums"
                              >
                                {currentVal}px
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                data-testid={`cm-${sz.field}-dec`}
                                aria-label={`Decrease ${sz.labelEn}`}
                                disabled={currentVal <= sz.bounds.min}
                                onClick={() => updateField(sz.field, Math.max(sz.bounds.min, currentVal - 1))}
                                className="w-7 h-7 inline-flex items-center justify-center bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-40 rounded-md shrink-0"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <input
                                id={`cm-${sz.field}`}
                                data-testid={`cm-${sz.field}`}
                                type="range"
                                min={sz.bounds.min}
                                max={sz.bounds.max}
                                value={currentVal}
                                onChange={(e) => updateField(sz.field, Number(e.target.value))}
                                className="flex-1 accent-[#0F766E]"
                              />
                              <button
                                type="button"
                                data-testid={`cm-${sz.field}-inc`}
                                aria-label={`Increase ${sz.labelEn}`}
                                disabled={currentVal >= sz.bounds.max}
                                onClick={() => updateField(sz.field, Math.min(sz.bounds.max, currentVal + 1))}
                                className="w-7 h-7 inline-flex items-center justify-center bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-40 rounded-md shrink-0"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* TAB 3: COLORS & LAYOUT */}
            {section === 'style' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      { key: 'primaryColor', labelBn: 'প্রধান রঙ (Primary)', labelEn: 'Primary Color' },
                      { key: 'accentColor', labelBn: 'অ্যাকসেন্ট রঙ (Accent)', labelEn: 'Accent Color' },
                      { key: 'tableHeaderColor', labelBn: 'টেবিল হেডার রঙ', labelEn: 'Table Header Color' },
                      { key: 'paperTint', labelBn: 'পেপার ব্যাকগ্রাউন্ড', labelEn: 'Paper Background' },
                    ] as const
                  ).map((item) => (
                    <div key={item.key} className="border border-slate-200 rounded-lg p-2.5 space-y-1.5">
                      <label htmlFor={`cm-${item.key}`} className="block text-[11px] font-medium text-slate-700">
                        {isBn ? item.labelBn : item.labelEn}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          id={`cm-${item.key}`}
                          type="color"
                          value={cfg[item.key]}
                          onChange={(e) => updateField(item.key, e.target.value)}
                          className="h-7 w-9 rounded border border-slate-300 cursor-pointer bg-white"
                        />
                        <input
                          type="text"
                          aria-label={`${item.labelEn} hex`}
                          value={cfg[item.key]}
                          onChange={(e) => {
                            const v = e.target.value.trim();
                            if (/^#[0-9a-fA-F]{6}$/.test(v)) updateField(item.key, v);
                          }}
                          className="w-full h-7 px-2 text-xs font-mono border border-slate-200 rounded bg-slate-50"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <label htmlFor="cm-min-rows" className="block text-xs text-slate-600 mb-1">
                    {isBn ? `ন্যূনতম টেবিল সারি (${cfg.minRows})` : `Minimum Table Rows (${cfg.minRows})`}
                  </label>
                  <input
                    id="cm-min-rows"
                    type="range"
                    min={0}
                    max={14}
                    value={cfg.minRows}
                    onChange={(e) => updateField('minRows', Number(e.target.value))}
                    className="w-full accent-[#0F766E] mt-1"
                  />
                </div>

                <div className="space-y-2.5 pt-2 border-t border-slate-100">
                  <label className="flex items-center justify-between gap-2 text-xs text-slate-700 cursor-pointer">
                    <span>{isBn ? 'প্রতিষ্ঠানের লোগো দেখান' : 'Show Business Logo'}</span>
                    <input
                      type="checkbox"
                      checked={cfg.showLogo}
                      onChange={(e) => updateField('showLogo', e.target.checked)}
                      className="h-4 w-4 accent-[#0F766E] rounded"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2 text-xs text-slate-700 cursor-pointer">
                    <span>{isBn ? 'ব্যাকগ্রাউন্ড ওয়াটারমার্ক দেখান' : 'Show Background Watermark'}</span>
                    <input
                      type="checkbox"
                      checked={cfg.showWatermark}
                      onChange={(e) => updateField('showWatermark', e.target.checked)}
                      className="h-4 w-4 accent-[#0F766E] rounded"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* TAB 3: MUSHAK & ACCOUNTING */}
            {section === 'vat' && (
              <div className="space-y-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                  <div className="text-xs font-semibold text-slate-800">
                    {isBn ? 'ক্যাশ মেমোতে ডিফল্ট মূসক (VAT) নীতি' : 'Default Cash Memo VAT / Mushak Policy'}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {isBn
                      ? 'এখান থেকে ডিফল্ট সেট করতে পারবেন। এছাড়াও প্রতিটি বিক্রয়ের পর ক্যাশ মেমো ডাউনলোড উইন্ডোতে “মূসক সহ” ও “মূসক ছাড়া” উভয় বাটনই থাকবে।'
                      : 'Sets the default preview state. Both "With Mushak" and "Without Mushak" download buttons remain available on every POS Cash Memo.'}
                  </p>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => updateField('defaultIncludeVat', true)}
                      className={`py-2 px-3 text-xs font-medium rounded-lg border transition-colors ${
                        cfg.defaultIncludeVat
                          ? 'bg-[#0F766E] text-white border-[#0F766E]'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {isBn ? 'ডিফল্ট: মূসক সহ' : 'Default: With Mushak'}
                    </button>
                    <button
                      type="button"
                      onClick={() => updateField('defaultIncludeVat', false)}
                      className={`py-2 px-3 text-xs font-medium rounded-lg border transition-colors ${
                        !cfg.defaultIncludeVat
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {isBn ? 'ডিফল্ট: মূসক ছাড়া' : 'Default: No Mushak'}
                    </button>
                  </div>
                </div>

                <div className="space-y-2.5 pt-1">
                  {(
                    [
                      { key: 'showBinNumber', bn: 'বিআইএন (BIN) নম্বর প্রদর্শন (মূসক সহ মেমোতে)', en: 'Show BIN Number (when With Mushak)' },
                      { key: 'showMushakRef', bn: 'মূসক ৬.৩ চালান রেফারেন্স প্রদর্শন', en: 'Show Mushak 6.3 Reference' },
                      { key: 'showPaymentMethod', bn: 'পেমেন্ট মাধ্যম দেখান (নগদ/বিকাশ/ব্যাংক)', en: 'Show Payment Method' },
                      { key: 'showAmountInWords', bn: 'টাকা (কথায়) / In Words সারি দেখান', en: 'Show Amount in Words Line' },
                      { key: 'showAdvanceAndDue', bn: 'জমা (Advance) ও বকেয়া/জের (Due) সারি দেখান', en: 'Show Paid / Advance & Due Rows' },
                    ] as const
                  ).map((row) => (
                    <label
                      key={row.key}
                      className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0 text-xs text-slate-700 cursor-pointer"
                    >
                      <span>{isBn ? row.bn : row.en}</span>
                      <input
                        type="checkbox"
                        checked={cfg[row.key]}
                        onChange={(e) => updateField(row.key, e.target.checked)}
                        className="h-4 w-4 accent-[#0F766E] rounded shrink-0"
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 4: COLUMNS, FOOTER & SIGNATURES */}
            {section === 'table' && (
              <div className="space-y-3">
                <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                  {isBn ? 'টেবিল কলামের শিরোনাম' : 'Table Column Headers'}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label htmlFor="cm-col-sl" className="block text-[11px] text-slate-600 mb-1">
                      {isBn ? 'ক্রমিক' : 'SL Col'}
                    </label>
                    <input
                      id="cm-col-sl"
                      type="text"
                      value={cfg.colSl}
                      onChange={(e) => updateField('colSl', e.target.value)}
                      className="w-full h-8 px-2.5 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="cm-col-desc" className="block text-[11px] text-slate-600 mb-1">
                      {isBn ? 'বিবরণ কলাম' : 'Description Col'}
                    </label>
                    <input
                      id="cm-col-desc"
                      type="text"
                      value={cfg.colDesc}
                      onChange={(e) => updateField('colDesc', e.target.value)}
                      className="w-full h-8 px-2.5 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label htmlFor="cm-col-qty" className="block text-[11px] text-slate-600 mb-1">
                      {isBn ? 'পরিমাণ' : 'Qty Col'}
                    </label>
                    <input
                      id="cm-col-qty"
                      type="text"
                      value={cfg.colQty}
                      onChange={(e) => updateField('colQty', e.target.value)}
                      className="w-full h-8 px-2.5 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label htmlFor="cm-col-rate" className="block text-[11px] text-slate-600 mb-1">
                      {isBn ? 'দর / রেট' : 'Rate Col'}
                    </label>
                    <input
                      id="cm-col-rate"
                      type="text"
                      value={cfg.colRate}
                      onChange={(e) => updateField('colRate', e.target.value)}
                      className="w-full h-8 px-2.5 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label htmlFor="cm-col-amt" className="block text-[11px] text-slate-600 mb-1">
                      {isBn ? 'টাকা / মোট' : 'Amount Col'}
                    </label>
                    <input
                      id="cm-col-amt"
                      type="text"
                      value={cfg.colAmount}
                      onChange={(e) => updateField('colAmount', e.target.value)}
                      className="w-full h-8 px-2.5 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 space-y-3">
                  <div>
                    <label htmlFor="cm-footer-note" className="block text-xs text-slate-600 mb-1">
                      {isBn ? 'ফুটার নোট / শর্তাবলি' : 'Footer Note / Terms'}
                    </label>
                    <input
                      id="cm-footer-note"
                      type="text"
                      value={cfg.footerNote}
                      placeholder={isBn ? 'যেমন: বিঃ দ্রঃ বিক্রিত মাল ফেরত লওয়া হয় না।' : 'e.g., Goods sold cannot be returned.'}
                      onChange={(e) => updateField('footerNote', e.target.value)}
                      className="w-full h-9 px-3 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="cm-cust-sign" className="block text-xs text-slate-600 mb-1">
                        {isBn ? 'ক্রেতার স্বাক্ষর লেবেল' : 'Customer Signature Label'}
                      </label>
                      <input
                        id="cm-cust-sign"
                        type="text"
                        value={cfg.customerSignLabel}
                        onChange={(e) => updateField('customerSignLabel', e.target.value)}
                        className="w-full h-9 px-3 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label htmlFor="cm-auth-sign" className="block text-xs text-slate-600 mb-1">
                        {isBn ? 'বিক্রেতা / অনুমোদিত স্বাক্ষর' : 'Authorized Signature Label'}
                      </label>
                      <input
                        id="cm-auth-sign"
                        type="text"
                        value={cfg.authorizedSignLabel}
                        onChange={(e) => updateField('authorizedSignLabel', e.target.value)}
                        className="w-full h-9 px-3 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Live Preview Panel */}
        <div className="lg:col-span-7 bg-slate-100/80 border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-800">
                {isBn ? 'লাইভ ক্যাশ মেমো প্রিভিউ' : 'Live Cash Memo Preview'}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                {hasLiveDbInvoice
                  ? isBn
                    ? `ডাটাবেজ ইনভয়েস: ${previewInvoice.invoiceNumber}`
                    : `Live DB Invoice: ${previewInvoice.invoiceNumber}`
                  : isBn
                    ? 'খালি মেমো কাঠামো (ডাটাবেজে কোনো ইনভয়েস নেই)'
                    : 'Empty Structural Layout (No invoices in DB yet)'}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Live With/Without Mushak Preview Toggle */}
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setPreviewIncludeVat(true)}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                    previewIncludeVat ? 'bg-[#0F766E] text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {isBn ? 'মূসক সহ' : 'With Mushak'}
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewIncludeVat(false)}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                    !previewIncludeVat ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {isBn ? 'মূসক ছাড়া' : 'No Mushak'}
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  printThermalReceipt(previewInvoice, effectiveOrg, lang, {
                    includeVat: previewIncludeVat,
                    paperWidth: settings.thermalPaperWidth,
                    settings,
                  });
                  notify({
                    title: isBn ? 'টার্মিনাল প্রিন্ট প্রিভিউ খোলা হয়েছে।' : 'Thermal print dialog opened.',
                    variant: 'info',
                    sound: 'export',
                  });
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5 text-slate-500" />
                <span>{isBn ? 'টার্মিনাল টেস্ট' : 'Test Thermal'}</span>
              </button>

              <button
                type="button"
                disabled={exportingTest}
                onClick={handleDownloadSamplePdf}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-60 rounded-lg whitespace-nowrap"
              >
                {exportingTest ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5 text-[#0F766E]" />}
                <span>{isBn ? 'PDF প্রিভিউ' : 'Export PDF'}</span>
              </button>
            </div>
          </div>

          <div className="p-3 sm:p-5">
            <CashMemoPreviewFrame
              invoice={previewInvoice}
              org={effectiveOrg}
              lang={lang}
              includeVat={previewIncludeVat}
              templateId={selectedId}
              settings={settings}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

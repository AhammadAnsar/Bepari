import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImagePlus, RefreshCw, Trash2, X } from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import { formatMoney, formatNumber } from '../engine/format';
import type { Branch, Language, Organization, Product, TaxRule } from '../engine/types';
import { DICT } from '../i18n/translations';
import { createProductApi, updateProductApi } from '../lib/api';
import { computeProductMargin } from '../lib/productDirectory';

interface Props {
  open: boolean;
  product: Product | null;
  org: Organization;
  lang: Language;
  branches: Branch[];
  activeBranchId: number;
  taxRules: TaxRule[];
  existingCategories: string[];
  existingBrands: string[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function generateAutoBarcode(): string {
  const rand = Math.floor(100000000 + Math.random() * 900000000);
  return `8941${rand}`;
}

async function compressImageToJpegDataUrl(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Only JPG, PNG, or WebP images are supported.');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Image file must be under 5 MB.');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.onload = () => {
        const maxSide = 640;
        let width = img.width;
        let height = img.height;
        if (width > maxSide || height > maxSide) {
          if (width >= height) {
            height = Math.round((height * maxSide) / width);
            width = maxSide;
          } else {
            width = Math.round((width * maxSide) / height);
            height = maxSide;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Unable to process image in browser.'));
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        if (dataUrl.length > 480_000) {
          resolve(canvas.toDataURL('image/jpeg', 0.65));
        } else {
          resolve(dataUrl);
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function ProductFormModal({
  open,
  product,
  org,
  lang,
  branches,
  activeBranchId,
  taxRules,
  existingCategories,
  existingBrands,
  onClose,
  onSaved,
}: Props) {
  const t = DICT[lang];
  const isBn = lang === 'bn';
  const { notify } = useFeedback();
  const isEdit = Boolean(product);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const money = (v: number) => formatMoney(v, lang, org.currencySymbol);

  const [name, setName] = useState('');
  const [nameBn, setNameBn] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [brand, setBrand] = useState('');
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [category, setCategory] = useState('General');
  const [unit, setUnit] = useState('pcs');
  const [hsCode, setHsCode] = useState('');
  const [taxRuleId, setTaxRuleId] = useState<number>(taxRules[0]?.id || 1);
  const [costPrice, setCostPrice] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [trackInventory, setTrackInventory] = useState(true);
  const [reorderLevel, setReorderLevel] = useState('5');
  const [initialStock, setInitialStock] = useState('10');
  const [branchId, setBranchId] = useState<number>(activeBranchId || branches[0]?.id || 1);
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (product) {
      setName(product.name);
      setNameBn(product.nameBn || '');
      setSku(product.sku);
      setBarcode(product.barcode || '');
      setBrand(product.brand || '');
      setSize(product.size || '');
      setColor(product.color || '');
      setCategory(product.category || 'General');
      setUnit(product.unit || 'pcs');
      setHsCode(product.hsCode || '');
      setTaxRuleId(product.taxRuleId || taxRules[0]?.id || 1);
      setCostPrice(String(product.costPrice));
      setSalePrice(String(product.salePrice));
      setTrackInventory(product.trackInventory);
      setReorderLevel(String(product.reorderLevel));
      setDescription(product.description || '');
      setImageUrl(product.imageUrl || '');
    } else {
      setName('');
      setNameBn('');
      setSku('');
      setBarcode(generateAutoBarcode());
      setBrand('');
      setSize('');
      setColor('');
      setCategory(existingCategories[0] || 'Textiles');
      setUnit('pcs');
      setHsCode('');
      setTaxRuleId(taxRules[0]?.id || 1);
      setCostPrice('');
      setSalePrice('');
      setTrackInventory(true);
      setReorderLevel('5');
      setInitialStock('10');
      setBranchId(activeBranchId || branches[0]?.id || 1);
      setDescription('');
      setImageUrl('');
    }
  }, [open, product, activeBranchId, branches, taxRules, existingCategories]);

  if (!open) return null;

  const parsedCost = Number(costPrice) || 0;
  const parsedSale = Number(salePrice) || 0;
  const margin = computeProductMargin(parsedSale, parsedCost);

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const compressed = await compressImageToJpegDataUrl(file);
      setImageUrl(compressed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to upload image.');
    } finally {
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError(isBn ? 'পণ্যের নাম আবশ্যক।' : 'Product name is required.');
      return;
    }
    setSubmitting(true);
    try {
      if (isEdit && product) {
        await updateProductApi(product.id, {
          sku: sku.trim(),
          barcode: barcode.trim(),
          name: name.trim(),
          nameBn: nameBn.trim() || name.trim(),
          category: category.trim() || 'General',
          brand: brand.trim(),
          size: size.trim(),
          color: color.trim(),
          unit: unit.trim() || 'pcs',
          hsCode: hsCode.trim(),
          salePrice: parsedSale,
          costPrice: parsedCost,
          taxRuleId,
          trackInventory,
          reorderLevel: Number(reorderLevel) || 0,
          description: description.trim(),
          imageUrl,
        });
      } else {
        await createProductApi({
          sku: sku.trim() || undefined,
          barcode: barcode.trim() || undefined,
          name: name.trim(),
          nameBn: nameBn.trim() || name.trim(),
          category: category.trim() || 'General',
          brand: brand.trim(),
          size: size.trim(),
          color: color.trim(),
          unit: unit.trim() || 'pcs',
          hsCode: hsCode.trim(),
          salePrice: parsedSale,
          costPrice: parsedCost,
          taxRuleId,
          trackInventory,
          reorderLevel: Number(reorderLevel) || 0,
          initialStock: trackInventory ? Number(initialStock) || 0 : 0,
          branchId,
          description: description.trim(),
          imageUrl,
        });
      }
      await onSaved();
      notify({
        title: isEdit
          ? isBn
            ? 'পণ্যের তথ্য হালনাগাদ হয়েছে।'
            : 'Product updated.'
          : isBn
            ? 'নতুন পণ্য যুক্ত হয়েছে।'
            : 'New product added.',
        description: isBn && nameBn.trim() ? nameBn.trim() : name.trim(),
        variant: 'success',
        sound: 'save',
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to save product.';
      setError(msg);
      notify({ title: msg, variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? (isBn ? 'পণ্য সম্পাদনা' : 'Edit Product') : t.actions.newProduct}
        className="bg-white w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[90vh] rounded-t-3xl sm:rounded-2xl border-t sm:border border-slate-200 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0">
          <div className="w-10 h-1.5 bg-slate-300 rounded-full" />
        </div>

        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {isEdit
                ? isBn
                  ? 'পণ্যের তথ্য সম্পাদনা'
                  : 'Edit Product'
                : isBn
                  ? 'নতুন পণ্য বা সেবা যুক্ত করুন'
                  : 'Add New Product / Service'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isBn
                ? 'মূল্য, ব্র্যান্ড, সাইজ, কালার, মূসক হার ও প্রোডাক্ট ছবি নির্ধারণ করুন'
                : 'Configure pricing, brand, size, color, Mushak VAT rule, and catalog photo'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close product form"
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div role="alert" className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
              {error}
            </div>
          )}

          {/* Product Image Upload Row */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 pb-4 border-b border-slate-200">
            <div className="w-28 h-21 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden shrink-0 flex items-center justify-center">
              {imageUrl ? (
                <img src={imageUrl} alt={name || 'Product'} className="w-full h-full object-cover" />
              ) : (
                <ImagePlus className="w-6 h-6 text-slate-400" />
              )}
            </div>
            <div className="space-y-1.5 min-w-0">
              <div className="text-xs font-semibold text-slate-900">
                {isBn ? 'প্রোডাক্ট ছবি' : 'Product Photo'}
              </div>
              <p className="text-[11px] text-slate-500">
                {isBn
                  ? 'JPG, PNG বা WebP (স্বয়ংক্রিয়ভাবে অপ্টিমাইজড হয়ে সংরক্ষণ হবে)'
                  : 'JPG, PNG, or WebP — automatically resized for fast catalog loading'}
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImagePick}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
                >
                  {imageUrl ? (isBn ? 'ছবি পরিবর্তন' : 'Change Photo') : isBn ? 'ছবি আপলোড করুন' : 'Upload Photo'}
                </button>
                {imageUrl && (
                  <button
                    type="button"
                    onClick={() => setImageUrl('')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-lg"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {isBn ? 'মুছুন' : 'Remove'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Core Identification */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="pf-name" className="block text-xs font-medium text-slate-700 mb-1">
                {isBn ? 'পণ্যের নাম (ইংরেজি) *' : 'Product Name (EN) *'}
              </label>
              <input
                id="pf-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Combed Cotton Poplin"
                className="w-full h-10 sm:h-9 px-3 text-sm border border-slate-300 rounded-xl sm:rounded-lg focus:outline-none focus:border-[#0F766E]"
              />
            </div>
            <div>
              <label htmlFor="pf-namebn" className="block text-xs font-medium text-slate-700 mb-1">
                {isBn ? 'পণ্যের বাংলা নাম' : 'Bangla Name'}
              </label>
              <input
                id="pf-namebn"
                type="text"
                value={nameBn}
                onChange={(e) => setNameBn(e.target.value)}
                placeholder="যেমন: কম্বড কটন পপলিন"
                className="w-full h-10 sm:h-9 px-3 text-sm border border-slate-300 rounded-xl sm:rounded-lg focus:outline-none focus:border-[#0F766E]"
              />
            </div>

            <div>
              <label htmlFor="pf-sku" className="block text-xs font-medium text-slate-700 mb-1">
                SKU {isBn ? '(খালি রাখলে অটো)' : '(blank = auto)'}
              </label>
              <input
                id="pf-sku"
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="TEX-105"
                className="w-full h-10 sm:h-9 px-3 text-sm font-mono border border-slate-300 rounded-xl sm:rounded-lg focus:outline-none focus:border-[#0F766E]"
              />
            </div>

            <div>
              <label htmlFor="pf-barcode" className="block text-xs font-medium text-slate-700 mb-1">
                {isBn ? 'বারকোড (EAN / Code-128)' : 'Barcode (EAN / Code-128)'}
              </label>
              <div className="flex gap-1.5">
                <input
                  id="pf-barcode"
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="8941101001050"
                  className="flex-1 min-w-0 h-10 sm:h-9 px-3 text-sm font-mono border border-slate-300 rounded-xl sm:rounded-lg focus:outline-none focus:border-[#0F766E]"
                />
                <button
                  type="button"
                  onClick={() => setBarcode(generateAutoBarcode())}
                  title={isBn ? 'নতুন বারকোড তৈরি' : 'Generate barcode'}
                  className="px-2.5 h-10 sm:h-9 text-slate-600 hover:text-slate-900 border border-slate-300 rounded-xl sm:rounded-lg bg-slate-50 hover:bg-slate-100"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="pf-brand" className="block text-xs font-medium text-slate-700 mb-1">
                {isBn ? 'ব্র্যান্ড' : 'Brand'}
              </label>
              <input
                id="pf-brand"
                type="text"
                list="bepari-brands-list"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder={isBn ? 'যেমন: Bengal Loom' : 'e.g. Bengal Loom'}
                className="w-full h-10 sm:h-9 px-3 text-sm border border-slate-300 rounded-xl sm:rounded-lg focus:outline-none focus:border-[#0F766E]"
              />
              <datalist id="bepari-brands-list">
                {existingBrands.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>

            <div>
              <label htmlFor="pf-category" className="block text-xs font-medium text-slate-700 mb-1">
                {isBn ? 'ক্যাটাগরি' : 'Category'}
              </label>
              <input
                id="pf-category"
                type="text"
                list="bepari-categories-list"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Textiles"
                className="w-full h-10 sm:h-9 px-3 text-sm border border-slate-300 rounded-xl sm:rounded-lg focus:outline-none focus:border-[#0F766E]"
              />
              <datalist id="bepari-categories-list">
                {existingCategories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <div>
              <label htmlFor="pf-size" className="block text-xs font-medium text-slate-700 mb-1">
                {isBn ? 'সাইজ / মাপ (ঐচ্ছিক)' : 'Size (Optional)'}
              </label>
              <input
                id="pf-size"
                type="text"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder={isBn ? 'যেমন: XL / 42 / 500ml' : 'e.g. XL / 42 / 500ml'}
                className="w-full h-10 sm:h-9 px-3 text-sm border border-slate-300 rounded-xl sm:rounded-lg focus:outline-none focus:border-[#0F766E]"
              />
            </div>

            <div>
              <label htmlFor="pf-color" className="block text-xs font-medium text-slate-700 mb-1">
                {isBn ? 'কালার / রঙ (ঐচ্ছিক)' : 'Color (Optional)'}
              </label>
              <input
                id="pf-color"
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder={isBn ? 'যেমন: নেভি ব্লু / সাদা' : 'e.g. Navy Blue / White'}
                className="w-full h-10 sm:h-9 px-3 text-sm border border-slate-300 rounded-xl sm:rounded-lg focus:outline-none focus:border-[#0F766E]"
              />
            </div>
          </div>

          {/* Pricing, Margin & Tax */}
          <div className="pt-4 border-t border-slate-200 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-900">
                {isBn ? 'মূল্য, মুনাফা ও মূসক (VAT)' : 'Pricing, Margin & Mushak VAT'}
              </div>
              {parsedSale > 0 && (
                <div className="text-xs tabular-nums text-slate-600">
                  {isBn ? 'একক লাভ:' : 'Gross Profit:'}{' '}
                  <span className={margin.profit >= 0 ? 'font-semibold text-emerald-700' : 'font-semibold text-rose-700'}>
                    {money(margin.profit)} ({formatNumber(margin.marginPct, lang)}%)
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label htmlFor="pf-cost" className="block text-xs font-medium text-slate-700 mb-1">
                  {isBn ? 'ক্রয় মূল্য *' : 'Cost Price *'}
                </label>
                <input
                  id="pf-cost"
                  type="number"
                  required
                  min="0"
                  step="any"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  className="w-full h-10 sm:h-9 px-3 text-sm font-mono border border-slate-300 rounded-xl sm:rounded-lg focus:outline-none focus:border-[#0F766E]"
                />
              </div>
              <div>
                <label htmlFor="pf-sale" className="block text-xs font-medium text-slate-700 mb-1">
                  {isBn ? 'বিক্রয় মূল্য *' : 'Sale Price *'}
                </label>
                <input
                  id="pf-sale"
                  type="number"
                  required
                  min="0"
                  step="any"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  className="w-full h-10 sm:h-9 px-3 text-sm font-mono border border-slate-300 rounded-xl sm:rounded-lg focus:outline-none focus:border-[#0F766E]"
                />
              </div>
              <div>
                <label htmlFor="pf-unit" className="block text-xs font-medium text-slate-700 mb-1">
                  {isBn ? 'একক (Unit)' : 'Unit'}
                </label>
                <input
                  id="pf-unit"
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="pcs / roll / box"
                  className="w-full h-10 sm:h-9 px-3 text-sm border border-slate-300 rounded-xl sm:rounded-lg focus:outline-none focus:border-[#0F766E]"
                />
              </div>
              <div>
                <label htmlFor="pf-hs" className="block text-xs font-medium text-slate-700 mb-1">
                  HS {isBn ? 'কোড' : 'Code'}
                </label>
                <input
                  id="pf-hs"
                  type="text"
                  value={hsCode}
                  onChange={(e) => setHsCode(e.target.value)}
                  placeholder="5208.21"
                  className="w-full h-10 sm:h-9 px-3 text-sm font-mono border border-slate-300 rounded-xl sm:rounded-lg focus:outline-none focus:border-[#0F766E]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="pf-tax" className="block text-xs font-medium text-slate-700 mb-1">
                {isBn ? 'প্রযোজ্য মূসক (NBR VAT Rule)' : 'Applicable Mushak VAT Rule'}
              </label>
              <select
                id="pf-tax"
                value={taxRuleId}
                onChange={(e) => setTaxRuleId(Number(e.target.value))}
                className="w-full h-10 sm:h-9 px-3 text-sm bg-white border border-slate-300 rounded-xl sm:rounded-lg focus:outline-none focus:border-[#0F766E]"
              >
                {taxRules.map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    {isBn ? tr.nameBn : tr.name} ({tr.rate}%)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Inventory Tracking */}
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={trackInventory}
                onChange={(e) => setTrackInventory(e.target.checked)}
                className="rounded border-slate-300 text-[#0F766E] focus:ring-[#0F766E]"
              />
              {isBn ? 'এই পণ্যের স্টক ও গুদাম হিসাব ট্র্যাক করুন' : 'Track stock & multi-branch inventory for this item'}
            </label>

            {trackInventory && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="pf-reorder" className="block text-xs font-medium text-slate-700 mb-1">
                    {isBn ? 'রিঅর্ডার সতর্কতা সীমা' : 'Low-Stock Reorder Level'}
                  </label>
                  <input
                    id="pf-reorder"
                    type="number"
                    min="0"
                    step="any"
                    value={reorderLevel}
                    onChange={(e) => setReorderLevel(e.target.value)}
                    className="w-full h-10 sm:h-9 px-3 text-sm font-mono border border-slate-300 rounded-xl sm:rounded-lg focus:outline-none focus:border-[#0F766E]"
                  />
                </div>
                {!isEdit && (
                  <>
                    <div>
                      <label htmlFor="pf-stock" className="block text-xs font-medium text-slate-700 mb-1">
                        {isBn ? 'প্রারম্ভিক মজুদ' : 'Opening Stock'}
                      </label>
                      <input
                        id="pf-stock"
                        type="number"
                        min="0"
                        step="any"
                        value={initialStock}
                        onChange={(e) => setInitialStock(e.target.value)}
                        className="w-full h-10 sm:h-9 px-3 text-sm font-mono border border-slate-300 rounded-xl sm:rounded-lg focus:outline-none focus:border-[#0F766E]"
                      />
                    </div>
                    <div>
                      <label htmlFor="pf-branch" className="block text-xs font-medium text-slate-700 mb-1">
                        {isBn ? 'প্রারম্ভিক শাখা' : 'Initial Branch'}
                      </label>
                      <select
                        id="pf-branch"
                        value={branchId}
                        onChange={(e) => setBranchId(Number(e.target.value))}
                        className="w-full h-10 sm:h-9 px-3 text-sm bg-white border border-slate-300 rounded-xl sm:rounded-lg"
                      >
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {isBn ? b.nameBn : b.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="pf-desc" className="block text-xs font-medium text-slate-700 mb-1">
              {isBn ? 'বিস্তারিত বিবরণ (ঐচ্ছিক)' : 'Product Description (optional)'}
            </label>
            <textarea
              id="pf-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isBn ? 'কাপড়ের মান, প্যাকিং বা স্পেসিফিকেশন লিখুন...' : 'Material specs, packing size, or handling notes...'}
              className="w-full p-3 text-sm border border-slate-300 rounded-xl sm:rounded-lg focus:outline-none focus:border-[#0F766E]"
            />
          </div>
        </form>

        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50/70 flex items-center justify-end gap-2 shrink-0 pb-safe">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200/70 rounded-xl sm:rounded-lg"
          >
            {t.actions.cancel}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={(e) => {
              const form = (e.currentTarget.closest('[role="dialog"]')?.querySelector('form') as HTMLFormElement | null);
              form?.requestSubmit();
            }}
            className="min-h-[40px] px-5 py-2 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#115E59] disabled:opacity-60 rounded-xl sm:rounded-lg"
          >
            {submitting
              ? isBn
                ? 'সংরক্ষণ হচ্ছে...'
                : 'Saving...'
              : isEdit
                ? isBn
                  ? 'পরিবর্তন সংরক্ষণ'
                  : 'Save Changes'
                : t.actions.save}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

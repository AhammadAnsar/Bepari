import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Upload, X } from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import type { Language } from '../engine/types';
import {
  bulkImportCustomersApi,
  bulkImportProductsApi,
  type CustomerBulkImportItem,
  type ProductUpsertPayload,
} from '../lib/api';

interface Props {
  open: boolean;
  mode: 'products' | 'customers';
  lang: Language;
  activeBranchId?: number;
  onClose: () => void;
  onImported: () => Promise<void>;
}

function splitCsvOrTsvRow(line: string): string[] {
  if (line.includes('\t')) {
    return line.split('\t').map((cell) => cell.trim().replace(/^"|"$/g, ''));
  }
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function BulkImportModal({
  open,
  mode,
  lang,
  activeBranchId,
  onClose,
  onImported,
}: Props) {
  const isBn = lang === 'bn';
  const { notify } = useFeedback();
  const [rawText, setRawText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const isProducts = mode === 'products';

  const sampleCsv = isProducts
    ? 'name,nameBn,sku,brand,size,color,category,unit,salePrice,costPrice,initialStock,description\nPremium Cotton Panjabi,প্রিমিয়াম কটন পাঞ্জাবি,PNJ-101,Aarong,XL,Navy Blue,Apparel,pcs,2450,1650,25,100% combed cotton festive collection\nBashundhara A4 Paper 80GSM,বসুন্ধরা এ৪ পেপার ৮০ জিএসএম,PPR-80,Bashundhara,A4,White,Stationery,ream,520,440,60,500 sheets bright white laser paper'
    : 'name,nameBn,phone,email,address,binNumber,creditLimit,openingBalance\nRahman Traders,রহমান ট্রেডার্স,01711223344,rahman@example.com,Motijheel Dhaka,001234567-0101,100000,0\nKarim Enterprise,করিম এন্টারপ্রাইজ,01819556677,karim@example.com,Agrabad Chattogram,,50000,2500';

  const handleDownloadSample = () => {
    const blob = new Blob(['\uFEFF' + sampleCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = isProducts ? 'bepari-products-template.csv' : 'bepari-customers-template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setRawText(text);
    setError(null);
  };

  const parsedRows = useMemo(() => {
    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return { products: [] as ProductUpsertPayload[], customers: [] as CustomerBulkImportItem[] };

    const firstRow = splitCsvOrTsvRow(lines[0]).map((h) => h.toLowerCase());
    const hasHeader =
      firstRow.includes('name') ||
      firstRow.includes('sku') ||
      firstRow.includes('phone') ||
      firstRow.includes('saleprice') ||
      firstRow.includes('নাম');
    const dataLines = hasHeader ? lines.slice(1) : lines;

    if (isProducts) {
      const products: ProductUpsertPayload[] = [];
      for (const line of dataLines) {
        const cols = splitCsvOrTsvRow(line);
        const name = cols[0] || '';
        const nameBn = cols[1] || name;
        if (!name && !nameBn) continue;
        products.push({
          name: name || nameBn,
          nameBn: nameBn || name,
          sku: cols[2] || undefined,
          brand: cols[3] || '',
          size: cols[4] || '',
          color: cols[5] || '',
          category: cols[6] || 'General',
          unit: cols[7] || 'pcs',
          salePrice: Math.max(0, Number(cols[8]) || 0),
          costPrice: Math.max(0, Number(cols[9]) || 0),
          initialStock: Math.max(0, Number(cols[10]) || 0),
          description: cols[11] || '',
        });
      }
      return { products, customers: [] };
    } else {
      const customers: CustomerBulkImportItem[] = [];
      for (const line of dataLines) {
        const cols = splitCsvOrTsvRow(line);
        const name = cols[0] || '';
        const nameBn = cols[1] || name;
        if (!name && !nameBn) continue;
        customers.push({
          name: name || nameBn,
          nameBn: nameBn || name,
          phone: cols[2] || '',
          email: cols[3] || '',
          address: cols[4] || '',
          binNumber: cols[5] || '',
          creditLimit: Math.max(0, Number(cols[6]) || 0),
          openingBalance: Number(cols[7]) || 0,
        });
      }
      return { products: [], customers };
    }
  }, [rawText, isProducts]);

  const count = isProducts ? parsedRows.products.length : parsedRows.customers.length;

  const handleImportSubmit = async () => {
    if (count === 0) {
      setError(
        isBn
          ? 'ইমপোর্ট করার জন্য অন্তত ১টি বৈধ সারি দিন।'
          : 'Please provide at least 1 valid row to import.'
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (isProducts) {
        const res = await bulkImportProductsApi(parsedRows.products, activeBranchId);
        await onImported();
        notify({
          title: isBn ? 'পণ্য বাল্ক ইমপোর্ট সম্পন্ন!' : 'Products Bulk Imported!',
          description: isBn
            ? `নতুন: ${res.importedCount} টি, আপডেট: ${res.updatedCount} টি`
            : `Created: ${res.importedCount}, Updated: ${res.updatedCount}`,
          variant: 'success',
          sound: 'save',
        });
      } else {
        const res = await bulkImportCustomersApi(parsedRows.customers);
        await onImported();
        notify({
          title: isBn ? 'গ্রাহক বাল্ক ইমপোর্ট সম্পন্ন!' : 'Customers Bulk Imported!',
          description: isBn
            ? `নতুন: ${res.importedCount} জন, আপডেট: ${res.updatedCount} জন`
            : `Created: ${res.importedCount}, Updated: ${res.updatedCount}`,
          variant: 'success',
          sound: 'save',
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk import failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-[1px] p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-xl">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-[#0F766E]" />
            <h3 className="text-sm font-semibold text-slate-900">
              {isProducts
                ? isBn
                  ? 'পণ্য বাল্ক ইমপোর্ট (CSV / Excel)'
                  : 'Bulk Import Products (CSV / Excel)'
                : isBn
                  ? 'গ্রাহক বাল্ক ইমপোর্ট (CSV / Excel)'
                  : 'Bulk Import Customers (CSV / Excel)'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {error && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700">
              {error}
            </div>
          )}

          {/* Top Toolbar: Download Sample, Upload CSV, or Load Sample */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="space-y-0.5">
              <div className="font-semibold text-slate-800">
                {isBn
                  ? '১. CSV ফাইল আপলোড করুন অথবা সরাসরি Excel থেকে কপি-পেস্ট করুন'
                  : '1. Upload a CSV file or copy-paste directly from Excel / Google Sheets'}
              </div>
              <div className="text-[11px] text-slate-500 font-mono">
                {isProducts
                  ? 'Columns: name, nameBn, sku, brand, size, color, category, unit, salePrice, costPrice, initialStock, description'
                  : 'Columns: name, nameBn, phone, email, address, binNumber, creditLimit, openingBalance'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadSample}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isBn ? 'স্যাম্পল CSV ডাউনলোড' : 'Sample CSV'}</span>
              </button>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#0D655E] rounded-lg cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>{isBn ? 'CSV ফাইল নির্বাচন' : 'Upload CSV'}</span>
                <input
                  type="file"
                  accept=".csv,.txt,.tsv"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Copy-Paste Textarea */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-medium text-slate-700">
                {isBn
                  ? 'এক্সেল / গুগল শিট থেকে রো কপি করে এখানে পেস্ট করুন:'
                  : 'Paste CSV or tab-separated rows from Excel / Google Sheets:'}
              </label>
              <button
                type="button"
                onClick={() => setRawText(sampleCsv)}
                className="text-[11px] font-medium text-[#0F766E] hover:underline"
              >
                {isBn ? 'উদাহরণ ডাটা বসিয়ে দেখুন' : 'Fill sample data'}
              </button>
            </div>
            <textarea
              rows={5}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={sampleCsv}
              className="w-full p-2.5 border border-slate-300 rounded-lg font-mono text-[11px]"
            />
          </div>

          {/* Live Preview Table */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800">
                {isBn ? `প্রিভিউ (${count} টি সারি প্রস্তুত)` : `Live Preview (${count} rows ready)`}
              </span>
            </div>

            {count > 0 && (
              <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-56">
                {isProducts ? (
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                        <th className="py-1.5 px-2.5">{isBn ? 'নাম' : 'Name'}</th>
                        <th className="py-1.5 px-2.5">SKU</th>
                        <th className="py-1.5 px-2.5">{isBn ? 'ব্র্যান্ড / সাইজ / কালার' : 'Brand / Size / Color'}</th>
                        <th className="py-1.5 px-2.5 text-right">{isBn ? 'বিক্রয় মূল্য' : 'Sale Price'}</th>
                        <th className="py-1.5 px-2.5 text-right">{isBn ? 'ক্রয় মূল্য' : 'Cost Price'}</th>
                        <th className="py-1.5 px-2.5 text-right">{isBn ? 'প্রারম্ভিক স্টক' : 'Opening Stock'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {parsedRows.products.slice(0, 30).map((p, i) => (
                        <tr key={i}>
                          <td className="py-1.5 px-2.5 font-medium text-slate-900">
                            {p.name}
                            {p.nameBn && p.nameBn !== p.name && (
                              <span className="text-slate-500 ml-1">({p.nameBn})</span>
                            )}
                          </td>
                          <td className="py-1.5 px-2.5 font-mono text-slate-600">{p.sku || 'AUTO'}</td>
                          <td className="py-1.5 px-2.5 text-slate-600">
                            {[p.brand, p.size, p.color].filter(Boolean).join(' · ') || '—'}
                          </td>
                          <td className="py-1.5 px-2.5 text-right tabular-nums">{p.salePrice}</td>
                          <td className="py-1.5 px-2.5 text-right tabular-nums">{p.costPrice}</td>
                          <td className="py-1.5 px-2.5 text-right tabular-nums">{p.initialStock || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                        <th className="py-1.5 px-2.5">{isBn ? 'নাম' : 'Name'}</th>
                        <th className="py-1.5 px-2.5">{isBn ? 'মোবাইল' : 'Phone'}</th>
                        <th className="py-1.5 px-2.5">{isBn ? 'ঠিকানা' : 'Address'}</th>
                        <th className="py-1.5 px-2.5">BIN</th>
                        <th className="py-1.5 px-2.5 text-right">{isBn ? 'ক্রেডিট লিমিট' : 'Credit Limit'}</th>
                        <th className="py-1.5 px-2.5 text-right">{isBn ? 'প্রারম্ভিক বকেয়া' : 'Opening Balance'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {parsedRows.customers.slice(0, 30).map((c, i) => (
                        <tr key={i}>
                          <td className="py-1.5 px-2.5 font-medium text-slate-900">{c.name}</td>
                          <td className="py-1.5 px-2.5 font-mono text-slate-600">{c.phone || '—'}</td>
                          <td className="py-1.5 px-2.5 text-slate-600">{c.address || '—'}</td>
                          <td className="py-1.5 px-2.5 font-mono text-slate-600">{c.binNumber || '—'}</td>
                          <td className="py-1.5 px-2.5 text-right tabular-nums">{c.creditLimit || 0}</td>
                          <td className="py-1.5 px-2.5 text-right tabular-nums">{c.openingBalance || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            {isBn ? 'বাতিল' : 'Cancel'}
          </button>
          <button
            type="button"
            disabled={submitting || count === 0}
            onClick={handleImportSubmit}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#0D655E] rounded-lg disabled:opacity-50"
          >
            {submitting
              ? isBn
                ? 'ইমপোর্ট হচ্ছে...'
                : 'Importing...'
              : isBn
                ? `${count} টি রেকর্ড ইমপোর্ট করুন`
                : `Import ${count} Records`}
          </button>
        </div>
      </div>
    </div>
  );
}

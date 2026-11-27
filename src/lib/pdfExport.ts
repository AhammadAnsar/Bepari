import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import type { Invoice, Language, Organization } from '../engine/types';
import {
  renderThermalReceiptHtml,
  type CashMemoSettings,
  type ThermalPaperWidth,
} from './cashMemoTemplates';
import { buildPdfTemplate, type PdfExportSpec } from './pdfTemplates';

/**
 * Prints an 80mm or 58mm POS thermal receipt directly via an isolated hidden iframe
 * (never calling window.open), compatible with embedded preview iframes and desktop/mobile POS terminals.
 */
export function printThermalReceipt(
  invoice: Invoice,
  org: Organization,
  lang: Language,
  options?: {
    includeVat?: boolean;
    paperWidth?: ThermalPaperWidth;
    settings?: CashMemoSettings;
  }
): void {
  if (typeof document === 'undefined') return;
  const html = renderThermalReceiptHtml(invoice, org, lang, options);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.title = 'POS Thermal Receipt Print';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  document.body.appendChild(iframe);

  const cleanup = () => {
    try {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    } catch {
      // ignore cleanup errors
    }
  };

  try {
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc || !iframe.contentWindow) {
      cleanup();
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();

    const triggerPrint = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        window.setTimeout(cleanup, 1500);
      }
    };

    if (doc.readyState === 'complete') {
      window.setTimeout(triggerPrint, 120);
    } else {
      iframe.onload = () => window.setTimeout(triggerPrint, 120);
      window.setTimeout(triggerPrint, 600);
    }
  } catch {
    cleanup();
  }
}

/**
 * Generates and downloads a real multi-page PDF file directly in the browser
 * (without invoking window.print), preserving full Bengali OpenType glyph shaping
 * and A4 layout even when triggered from a narrow 390px mobile viewport.
 */
export async function downloadPdfDocument(
  spec: PdfExportSpec,
  org: Organization,
  lang: Language
): Promise<string> {
  const rendered = buildPdfTemplate(spec, org, lang);

  // Ensure web fonts (Noto Sans Bengali / IBM Plex Sans) are loaded before rasterizing
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Proceed even if font readiness check rejects in restricted environments
    }
  }

  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  host.style.zIndex = '-1';
  host.style.background = '#FFFFFF';
  host.style.pointerEvents = 'none';
  host.innerHTML = rendered.html;
  document.body.appendChild(host);

  try {
    const target = host.firstElementChild as HTMLElement;
    const canvas = await html2canvas(target, {
      scale: 2,
      backgroundColor: '#FFFFFF',
      useCORS: true,
      logging: false,
      width: rendered.widthPx,
      windowWidth: rendered.widthPx,
    });

    if (Array.isArray(rendered.pageFormat)) {
      // 80mm thermal receipt PDF sized dynamically to content height
      const pageWidthMm = rendered.pageFormat[0];
      const pageHeightMm = Math.max(95, (canvas.height * pageWidthMm) / canvas.width + 6);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [pageWidthMm, pageHeightMm],
        compress: true,
      });
      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', 0, 3, pageWidthMm, (canvas.height * pageWidthMm) / canvas.width);
      pdf.save(rendered.filename);
      return rendered.filename;
    }

    // Standard A4 multi-page PDF (210mm x 297mm)
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pageWidthMm = pdf.internal.pageSize.getWidth();
    const pageHeightMm = pdf.internal.pageSize.getHeight();
    const marginMm = 6;
    const usableWidthMm = pageWidthMm - marginMm * 2;
    const usableHeightMm = pageHeightMm - marginMm * 2;

    const pxPerMm = canvas.width / usableWidthMm;
    const sliceHeightPx = Math.floor(usableHeightMm * pxPerMm);

    let offsetY = 0;
    let pageIndex = 0;

    while (offsetY < canvas.height) {
      const currentSliceHeight = Math.min(sliceHeightPx, canvas.height - offsetY);
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = currentSliceHeight;
      const ctx = pageCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        ctx.drawImage(
          canvas,
          0,
          offsetY,
          canvas.width,
          currentSliceHeight,
          0,
          0,
          canvas.width,
          currentSliceHeight
        );
      }

      if (pageIndex > 0) {
        pdf.addPage();
      }
      const renderedHeightMm = currentSliceHeight / pxPerMm;
      pdf.addImage(
        pageCanvas.toDataURL('image/png'),
        'PNG',
        marginMm,
        marginMm,
        usableWidthMm,
        renderedHeightMm
      );

      offsetY += currentSliceHeight;
      pageIndex += 1;
    }

    pdf.save(rendered.filename);
    return rendered.filename;
  } finally {
    host.remove();
  }
}

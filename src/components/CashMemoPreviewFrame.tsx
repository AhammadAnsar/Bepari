import { useEffect, useMemo, useRef, useState } from 'react';
import type { Invoice, Language, Organization } from '../engine/types';
import {
  renderCashMemoHtml,
  type CashMemoSettings,
  type CashMemoTemplateId,
} from '../lib/cashMemoTemplates';

const SHEET_WIDTH_PX = 720;

interface Props {
  invoice: Invoice;
  org: Organization;
  lang: Language;
  includeVat: boolean;
  templateId?: CashMemoTemplateId;
  settings?: CashMemoSettings;
  paymentMethodLabel?: string;
}

/**
 * Renders the 720px print-accurate Cash Memo HTML inside an automatically
 * scaled responsive container so both desktop and 390px mobile viewports
 * display the complete memo with zero horizontal overflow.
 */
export function CashMemoPreviewFrame({
  invoice,
  org,
  lang,
  includeVat,
  templateId,
  settings,
  paymentMethodLabel,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [scaledHeight, setScaledHeight] = useState(900);

  const html = useMemo(
    () =>
      renderCashMemoHtml(invoice, org, lang, {
        includeVat,
        templateId,
        settings,
        paymentMethodLabel,
      }),
    [invoice, org, lang, includeVat, templateId, settings, paymentMethodLabel]
  );

  useEffect(() => {
    const container = containerRef.current;
    const sheet = sheetRef.current;
    if (!container || !sheet) return;

    const recalc = () => {
      const availWidth = container.clientWidth;
      const nextScale = availWidth > 0 ? Math.min(1, availWidth / SHEET_WIDTH_PX) : 1;
      const rawHeight = sheet.scrollHeight || sheet.offsetHeight || 860;
      setScale(nextScale);
      setScaledHeight(Math.ceil(rawHeight * nextScale));
    };

    recalc();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(recalc);
      ro.observe(container);
      ro.observe(sheet);
      return () => ro.disconnect();
    }

    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [html]);

  const renderedWidth = Math.round(SHEET_WIDTH_PX * scale);

  return (
    <div
      ref={containerRef}
      data-testid="cash-memo-preview-stage"
      data-include-vat={includeVat ? 'true' : 'false'}
      className="w-full flex justify-center overflow-hidden"
    >
      <div
        className="relative overflow-hidden shadow-sm rounded-sm bg-white"
        style={{
          width: `${renderedWidth}px`,
          height: `${scaledHeight}px`,
        }}
      >
        <div
          ref={sheetRef}
          style={{
            width: `${SHEET_WIDTH_PX}px`,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}

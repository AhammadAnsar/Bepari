/**
 * Pure TypeScript ISO/IEC 15417 Code-128B barcode encoder and SVG generator.
 * Zero external dependencies — renders crisply in both browser React views
 * and html2canvas / jsPDF direct PDF label exports.
 */

// 107 standard Code-128 patterns (0..105 are 11-module, 106 STOP is 13-module)
const CODE128_PATTERNS: readonly string[] = [
  '11011001100', '11001101100', '11001100110', '10010011000', '10010001100',
  '10001001100', '10011001000', '10011000100', '10001100100', '11001001000',
  '11001000100', '11000100100', '10110011100', '10011011100', '10011001110',
  '10111001100', '10011101100', '10011100110', '11001110010', '11001011100',
  '11001001110', '11011100100', '11001110100', '11101101110', '11101001100',
  '11100101100', '11100100110', '11101100100', '11100110100', '11100110010',
  '11011011000', '11011000110', '11000110110', '10100011000', '10001011000',
  '10001000110', '10110001000', '10001101000', '10001100010', '11010001000',
  '11000101000', '11000100010', '10110111000', '10110001110', '10001101110',
  '10111011000', '10111000110', '10001110110', '11101110110', '11010001110',
  '11000101110', '11011101000', '11011100010', '11011101110', '11101011000',
  '11101000110', '11100010110', '11101101000', '11101100010', '11100011010',
  '11101111010', '11001000010', '11110001010', '10100110000', '10100001100',
  '10010110000', '10010000110', '10000101100', '10000100110', '10110010000',
  '10110000100', '10011010000', '10011000010', '10000110100', '10000110010',
  '11000010010', '11001010000', '11110111010', '11000010100', '10001111010',
  '10100111100', '10010111100', '10010011110', '10111100100', '10011110100',
  '10011110010', '11110100100', '11110010100', '11110010010', '11011011110',
  '11011110110', '11110110110', '10101111000', '10100011110', '10001011110',
  '10111101000', '10111100010', '11110101000', '11110100010', '10111011110',
  '10111101110', '11101011110', '11110101110', '11010000100', '11010010000',
  '11010011100', '1100011101011',
];

const START_B = 104;
const STOP_CODE = 106;

function escapeSvgText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface EncodedBarcode {
  value: string;
  bars: boolean[];
  totalModules: number;
}

/**
 * Sanitizes input to printable ASCII (32..126) for Code-128B encoding.
 */
export function sanitizeBarcodeValue(raw: string): string {
  const cleaned = String(raw ?? '')
    .trim()
    .replace(/[^\x20-\x7E]/g, '')
    .slice(0, 48);
  return cleaned || 'BEPARI-SKU';
}

export function encodeCode128B(rawValue: string): EncodedBarcode {
  const value = sanitizeBarcodeValue(rawValue);
  const codes: number[] = [START_B];
  let checksum = START_B;

  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i) - 32;
    const clamped = code >= 0 && code <= 94 ? code : 0;
    codes.push(clamped);
    checksum += clamped * (i + 1);
  }

  codes.push(checksum % 103);
  codes.push(STOP_CODE);

  const bitString = codes.map((c) => CODE128_PATTERNS[c]).join('');
  const bars = Array.from(bitString, (ch) => ch === '1');
  return {
    value,
    bars,
    totalModules: bars.length,
  };
}

export interface BarcodeSvgOptions {
  height?: number;
  moduleWidth?: number;
  quietZone?: number;
  showText?: boolean;
  barColor?: string;
}

/**
 * Produces a standalone, crisp vector SVG string of the Code-128B barcode.
 */
export function renderCode128BSvg(rawValue: string, options: BarcodeSvgOptions = {}): string {
  const height = options.height ?? 44;
  const moduleWidth = options.moduleWidth ?? 1.5;
  const quietZone = options.quietZone ?? 8;
  const showText = options.showText ?? true;
  const barColor = options.barColor ?? '#0F172A';

  const encoded = encodeCode128B(rawValue);
  const barsWidth = encoded.totalModules * moduleWidth;
  const totalWidth = Math.ceil(barsWidth + quietZone * 2);
  const textHeight = showText ? 15 : 0;
  const totalHeight = height + textHeight + 4;

  // Group contiguous 1-bits into single <rect> elements for clean vector output
  const rects: string[] = [];
  let i = 0;
  while (i < encoded.bars.length) {
    if (!encoded.bars[i]) {
      i++;
      continue;
    }
    const start = i;
    while (i < encoded.bars.length && encoded.bars[i]) {
      i++;
    }
    const runLen = i - start;
    const x = (quietZone + start * moduleWidth).toFixed(2);
    const w = (runLen * moduleWidth).toFixed(2);
    rects.push(`<rect x="${x}" y="2" width="${w}" height="${height}" fill="${barColor}" />`);
  }

  const labelMarkup = showText
    ? `<text x="${(totalWidth / 2).toFixed(1)}" y="${height + 14}" text-anchor="middle" font-family="'JetBrains Mono',ui-monospace,monospace" font-size="10.5" fill="#334155" letter-spacing="1">${escapeSvgText(encoded.value)}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="100%" height="${totalHeight}" shape-rendering="crispEdges" role="img" aria-label="Barcode ${escapeSvgText(encoded.value)}" style="display:block;max-width:${totalWidth}px;margin:0 auto;">${rects.join('')}${labelMarkup}</svg>`;
}

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import pdfMake from 'pdfmake/build/pdfmake';
import { buildCompactLabelDocument, type CompactLabelContent } from './compactLabelDocument';
import { LABEL_SIZE_PRESETS } from './labelSizes';
import { PDF_FONTS } from '../fonts';

// Real rasterization guard: a label whose content overflows its page height
// silently spills onto a SECOND physical label (pdfmake starts a new page).
// This renders worst-case content on every preset and asserts one page per label.

function b64(path: string): string {
  return readFileSync(path).toString('base64');
}

const vfs: Record<string, string> = {
  'Roboto-Regular.ttf': b64('public/fonts/Roboto-Regular.ttf'),
  'Roboto-Bold.ttf': b64('public/fonts/Roboto-Bold.ttf'),
  'Roboto-Italic.ttf': b64('public/fonts/Roboto-Italic.ttf'),
  'Roboto-BoldItalic.ttf': b64('public/fonts/Roboto-BoldItalic.ttf'),
};

// Opaque PNGs stand in for QR / Code128 (bwip-js needs a DOM canvas; only the
// reserved space matters for pagination).
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function worstCaseLabel(index: string): CompactLabelContent {
  return {
    id: 'CASE-2026-000123',
    qrDataUrl: PIXEL,
    barcodeDataUrl: PIXEL,
    title: 'Mohammed Abdulrahman Al Suwaidi Trading Establishment LLC',
    lines: [
      'SN WD-WX91A1234567890',
      'Western Digital Blue WD20EZBX · 2 TB',
      'HDD 3.5" SATA',
      '07/07/2026 14:35',
    ],
    footer: 'Space Data Recovery — Dubai Cleanroom Lab',
    index,
  };
}

function countPages(buf: Uint8Array): number {
  const text = Buffer.from(buf).toString('latin1');
  return (text.match(/\/Type \/Page[^s]/g) ?? []).length;
}

function render(labels: CompactLabelContent[], sizeId: string): Promise<Uint8Array> {
  const size = LABEL_SIZE_PRESETS.find((p) => p.id === sizeId)!;
  const def = buildCompactLabelDocument(labels, size);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdf = (pdfMake as any).createPdf(def, undefined, PDF_FONTS, vfs);
  return new Promise((resolve, reject) => {
    try {
      pdf.getBuffer((buf: Uint8Array) => resolve(buf), undefined, (err: unknown) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

describe('label pagination: worst-case content stays one page per label', () => {
  it.each(LABEL_SIZE_PRESETS.map((p) => p.id))('%s renders 3 labels as exactly 3 pages', async (sizeId) => {
    const labels = [worstCaseLabel('1/3'), worstCaseLabel('2/3'), worstCaseLabel('3/3')];
    const buf = await render(labels, sizeId);
    expect(countPages(buf)).toBe(3);
  });
});

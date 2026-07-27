import { describe, it, expect } from 'vitest';
import { renderTemplate } from './renderTemplate';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../templateConfig';
import { sampleInvoiceData } from './sampleData';
import { toEngineData } from './adapters/invoiceAdapter';
import type { TranslationContext } from '../types';

// Regression lock for QA STU-01: page margins are tenant-configurable and also
// arrive from stored configs / the gallery / hand-edited JSON, so a margin pair
// wider than the sheet could collapse the content box — pdfmake then emits a
// blank or broken page, surfaced only as a generic "could not render".
// renderTemplate now clamps, so no config can produce an unprintable page box.

const CTX: TranslationContext = {
  t: (_k: string, en: string) => en,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

/** margins are CSS order [top, right, bottom, left]. */
const build = (margins: [number, number, number, number], paper: Record<string, unknown> = {}) => {
  const config = {
    ...BUILT_IN_TEMPLATE_CONFIGS.invoice,
    paper: { ...BUILT_IN_TEMPLATE_CONFIGS.invoice.paper, margins, ...paper },
  } as typeof BUILT_IN_TEMPLATE_CONFIGS.invoice;
  return renderTemplate(config, toEngineData(sampleInvoiceData(), config), CTX);
};

/** pdfmake order is [left, top, right, bottom]. */
const A4_W = 595.28;
const A4_H = 841.89;

describe('page margin clamping (STU-01)', () => {
  it('leaves sane margins exactly as configured (parity)', () => {
    const doc = build([40, 35, 40, 35]);
    expect(doc.pageMargins).toEqual([35, 40, 35, 40]);
  });

  it('keeps at least an inch of content width when the horizontal pair is oversized', () => {
    const doc = build([40, 900, 40, 900]);
    const [left, , right] = doc.pageMargins as [number, number, number, number];
    expect(left + right).toBeLessThanOrEqual(A4_W - 72);
    // Scaled proportionally rather than one side absorbing the whole correction.
    expect(left).toBe(right);
  });

  it('keeps at least an inch of content height when the vertical pair is oversized', () => {
    const doc = build([900, 40, 900, 40]);
    const [, top, , bottom] = doc.pageMargins as [number, number, number, number];
    expect(top + bottom).toBeLessThanOrEqual(A4_H - 72);
    expect(top).toBe(bottom);
  });

  it('preserves the ratio between an uneven oversized pair', () => {
    const doc = build([40, 800, 40, 400]);
    const [left, , right] = doc.pageMargins as [number, number, number, number];
    // right(800) : left(400) → roughly 2:1 after scaling.
    expect(right / left).toBeGreaterThan(1.9);
    expect(right / left).toBeLessThan(2.1);
  });

  it('coerces negative and non-finite margins to zero', () => {
    const doc = build([-50, Number.NaN, -10, 30]);
    const [left, top, right, bottom] = doc.pageMargins as [number, number, number, number];
    expect(top).toBe(0);
    expect(bottom).toBe(0);
    expect(right).toBe(0);
    expect(left).toBe(30);
  });

  it('clamps against the ROTATED page box in landscape', () => {
    // 700pt vertical margins fit portrait A4 (842) but not landscape (595).
    const doc = build([700, 40, 700, 40], { orientation: 'landscape' });
    const [, top, , bottom] = doc.pageMargins as [number, number, number, number];
    expect(top + bottom).toBeLessThanOrEqual(A4_W - 72);
  });

  it('clamps against a custom label page box', () => {
    const doc = build([100, 100, 100, 100], { size: 'custom', dimensions: [283, 170] });
    const [left, top, right, bottom] = doc.pageMargins as [number, number, number, number];
    expect(left + right).toBeLessThanOrEqual(283 - 72);
    expect(top + bottom).toBeLessThanOrEqual(170 - 72);
  });
});

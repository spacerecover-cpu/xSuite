import { describe, it, expect } from 'vitest';
import type { Content, DynamicContent, TDocumentDefinitions, Watermark } from 'pdfmake/interfaces';
import { renderTemplate } from './renderTemplate';
import type { EngineDocData } from './types';
import type { TranslationContext } from '../types';
import { BUILT_IN_TEMPLATE_CONFIGS, resolveTemplateConfig } from '../templateConfig';
import { PDF_COLORS, PDF_STYLES } from '../styles';

// ---------------------------------------------------------------------------
// Phase 1c — the assembler CONSUMES the premium config groups. The contract:
// every feature is gated on the presence of its config group, so a template
// with no premium groups renders identically (parity wall + baseline snapshot).
// ---------------------------------------------------------------------------

const englishCtx: TranslationContext = {
  t: (_key: string, englishText: string) => englishText,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

function makeData(): EngineDocData {
  return {
    documentTitle: { en: 'TAX INVOICE', ar: 'فاتورة ضريبية' },
    identity: {
      basic_info: { company_name: 'Acme Data Recovery', legal_name: 'Acme Data Recovery LLC' },
      location: { address_line1: '12 Lab Street', city: 'Muscat', country: 'Oman' },
      contact_info: { phone_primary: '+968 1234 5678', email_general: 'lab@acme.test' },
      branding: { brand_tagline: 'Recovered. Verified. Delivered.' },
      online_presence: { website: 'https://acme.test' },
    },
    parties: {
      to: { title: { en: 'Customer', ar: 'العميل' }, name: 'Jane Client', rows: [] },
    },
    meta: [{ label: { en: 'Invoice No:', ar: 'رقم:' }, value: 'INV-0042' }],
    lineItems: {
      columns: [
        { key: 'description', visible: true, label: { en: 'Description', ar: 'الوصف' }, width: 220, align: 'left' },
        { key: 'lineTotal', visible: true, label: { en: 'Total', ar: 'المجموع' }, align: 'right' },
      ],
      rows: [{ description: 'RAID-5 logical recovery', lineTotal: '1000.000 OMR' }],
    },
    totals: [{ label: { en: 'Total:', ar: 'الإجمالي:' }, value: '1050.000 OMR', emphasis: true }],
    terms: { title: { en: 'Payment Terms', ar: 'شروط الدفع' }, body: 'Net 14 days.' },
    bank: null,
    qrCaption: null,
  };
}

function collectLineColors(node: unknown, out: string[]): void {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) collectLineColors(child, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  if (typeof obj.lineColor === 'string') out.push(obj.lineColor);
  for (const value of Object.values(obj)) collectLineColors(value, out);
}

function collectText(node: unknown, out: string[]): void {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  if (typeof obj.text === 'string') out.push(obj.text);
  for (const value of Object.values(obj)) collectText(value, out);
}

/** Find the color of the first text node whose text equals `needle`. */
function findTextColor(node: unknown, needle: string): string | undefined {
  if (node == null || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const c = findTextColor(child, needle);
      if (c !== undefined) return c;
    }
    return undefined;
  }
  const obj = node as Record<string, unknown>;
  if (obj.text === needle && typeof obj.color === 'string') return obj.color;
  for (const value of Object.values(obj)) {
    const c = findTextColor(value, needle);
    if (c !== undefined) return c;
  }
  return undefined;
}

const styleColor = (def: TDocumentDefinitions, name: string): string | undefined =>
  (def.styles as Record<string, { color?: string }> | undefined)?.[name]?.color;
const styleSize = (def: TDocumentDefinitions, name: string): number | undefined =>
  (def.styles as Record<string, { fontSize?: number }> | undefined)?.[name]?.fontSize;

const GREEN = '#10b981';

describe('renderTemplate — colors group', () => {
  it('keeps body styles NEUTRAL when no colors group is set (parity)', () => {
    const def = renderTemplate(BUILT_IN_TEMPLATE_CONFIGS.invoice, makeData(), englishCtx, 'LOGO', null);
    expect(styleColor(def, 'value')).toBe(PDF_COLORS.text);
    expect(styleColor(def, 'tableCell')).toBe(PDF_COLORS.text);
    expect(styleColor(def, 'label')).toBe(PDF_COLORS.textLight);
  });

  it('applies the full palette to body + accent surfaces when colors is set', () => {
    const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, {
      colors: { accent: GREEN, text: '#064e3b', label: '#6b7280' },
    });
    const def = renderTemplate(config, makeData(), englishCtx, 'LOGO', null);

    expect(styleColor(def, 'value')).toBe('#064e3b');
    expect(styleColor(def, 'tableCell')).toBe('#064e3b');
    expect(styleColor(def, 'label')).toBe('#6b7280');
    expect(styleColor(def, 'sectionTitle')).toBe(GREEN);
    expect(styleColor(def, 'totalValue')).toBe(GREEN);

    // Header divider rule + document title adopt the accent.
    const lineColors: string[] = [];
    collectLineColors(def.content, lineColors);
    expect(lineColors).toContain(GREEN);
    expect(findTextColor(def.content, 'TAX INVOICE')).toBe(GREEN);
  });
});

describe('renderTemplate — typography group', () => {
  it('keeps the tenant font + built-in sizes when no typography group is set (parity)', () => {
    // Built-ins now ship a default font scale; strip it to exercise the no-typography path.
    const noTypo = { ...BUILT_IN_TEMPLATE_CONFIGS.invoice, typography: undefined };
    const def = renderTemplate(noTypo, makeData(), englishCtx, null, null);
    expect((def.defaultStyle as { font?: string }).font).toBe('Roboto');
    expect(styleSize(def, 'tableCell')).toBe((PDF_STYLES.tableCell as { fontSize?: number }).fontSize);
  });

  it('applies the font family and scales the named style sizes', () => {
    const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, {
      typography: { fontFamily: 'Tajawal', baseScale: 1.25, sizes: { tableHeader: 11 } },
    });
    const def = renderTemplate(config, makeData(), englishCtx, null, null);
    expect((def.defaultStyle as { font?: string }).font).toBe('Tajawal');
    const baseCell = (PDF_STYLES.tableCell as { fontSize?: number }).fontSize ?? 0;
    expect(styleSize(def, 'tableCell')).toBe(baseCell * 1.25);
    expect(styleSize(def, 'tableHeader')).toBe(11); // absolute override wins
  });
});

describe('renderTemplate — page numbers', () => {
  const pageSizeArg = { width: 595.28, height: 841.89 } as never;

  it('does not render a page-number line by default', () => {
    const def = renderTemplate(BUILT_IN_TEMPLATE_CONFIGS.invoice, makeData(), englishCtx, null, 'QR');
    const footer = def.footer as DynamicContent;
    const out = footer(2, 5, pageSizeArg) as Content;
    const texts: string[] = [];
    collectText(out, texts);
    expect(texts.some((t) => /Page \d+ of \d+/.test(t))).toBe(false);
  });

  it('renders "Page X of Y" in the footer when enabled', () => {
    const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, {
      pageNumbers: { enabled: true, format: 'Page {page} of {pages}' },
    });
    const def = renderTemplate(config, makeData(), englishCtx, null, 'QR');
    const footer = def.footer as DynamicContent;
    const out = footer(2, 5, pageSizeArg) as Content;
    const texts: string[] = [];
    collectText(out, texts);
    expect(texts).toContain('Page 2 of 5');
  });

  it('emits a footer for page numbers even when there is no page-footer content', () => {
    // A minimal doc with no footer/qr trailing run still gets page numbers.
    const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.case_label, undefined, {
      pageNumbers: { enabled: true, format: '{page}/{pages}' },
    });
    const def = renderTemplate(config, makeData(), englishCtx, null, null);
    const footer = def.footer as DynamicContent;
    expect(footer).toBeTypeOf('function');
    const out = footer(1, 3, pageSizeArg) as Content;
    const texts: string[] = [];
    collectText(out, texts);
    expect(texts).toContain('1/3');
  });
});

describe('renderTemplate — watermark settings', () => {
  it('keeps the legacy branding.watermark shape (no angle) for parity', () => {
    const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, {
      branding: { watermark: 'DRAFT' },
    });
    const def = renderTemplate(config, makeData(), englishCtx, null, null);
    const wm = def.watermark as Watermark & { angle?: number };
    expect(wm.text).toBe('DRAFT');
    expect(wm.angle).toBeUndefined();
  });

  it('applies angle / opacity / fontSize from the watermark group', () => {
    const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, {
      watermark: { text: 'CONFIDENTIAL', angle: -30, opacity: 0.12, fontSize: 80 },
    });
    const def = renderTemplate(config, makeData(), englishCtx, null, null);
    const wm = def.watermark as Watermark & { angle?: number };
    expect(wm.text).toBe('CONFIDENTIAL');
    expect(wm.angle).toBe(-30);
    expect(wm.opacity).toBe(0.12);
    expect(wm.fontSize).toBe(80);
  });
});

describe('renderTemplate — page fitting / density', () => {
  const baseMargins = BUILT_IN_TEMPLATE_CONFIGS.invoice.paper.margins;
  const baseCell = (PDF_STYLES.tableCell as { fontSize?: number }).fontSize ?? 0;
  // Density is independent of the default font scale, so strip typography to test it in isolation.
  const invoiceNoTypo = { ...BUILT_IN_TEMPLATE_CONFIGS.invoice, typography: undefined };

  it('does not change margins or sizes by default (parity)', () => {
    const def = renderTemplate(invoiceNoTypo, makeData(), englishCtx, null, null);
    expect(def.pageMargins).toEqual(baseMargins);
    expect(styleSize(def, 'tableCell')).toBe(baseCell);
  });

  it('comfortable density is a no-op', () => {
    const config = resolveTemplateConfig(invoiceNoTypo, undefined, {
      pageFitting: { density: 'comfortable' },
    });
    const def = renderTemplate(config, makeData(), englishCtx, null, null);
    expect(def.pageMargins).toEqual(baseMargins);
    expect(styleSize(def, 'tableCell')).toBe(baseCell);
  });

  it('compact density tightens margins and shrinks fonts', () => {
    const config = resolveTemplateConfig(invoiceNoTypo, undefined, {
      pageFitting: { density: 'compact' },
    });
    const def = renderTemplate(config, makeData(), englishCtx, null, null);
    const margins = def.pageMargins as [number, number, number, number];
    expect(margins[0]).toBeLessThan(baseMargins[0]);
    expect(styleSize(def, 'tableCell')!).toBeLessThan(baseCell);
  });
});

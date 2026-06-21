import { describe, it, expect } from 'vitest';
import type { Content, TDocumentDefinitions, Watermark } from 'pdfmake/interfaces';
import { renderTemplate } from './renderTemplate';
import {
  resolveAccentColors,
  resolveAccentHex,
  resolveWatermark,
  isAccentOptIn,
  resolveHeader,
} from './branding';
import type { EngineDocData } from './types';
import type { TranslationContext } from '../types';
import { BUILT_IN_TEMPLATE_CONFIGS, resolveTemplateConfig } from '../templateConfig';
import { PDF_COLORS } from '../styles';

// ---------------------------------------------------------------------------
// M7 — engine branding: OPT-IN accent + text watermark.
//
// The load-bearing contract these tests guard: PDFs are NEUTRAL by default.
// - accent absent / 'inherit' / malformed → neutral PDF_COLORS (no behavior
//   change vs. the legacy builders),
// - an explicit accent hex → applied to the SMALL accent surface set (the
//   header divider rule color + the section-title text color), and nowhere else,
// - a watermark string → present as a pdfmake `watermark` object on the docDef;
//   absent/empty → no `watermark` key at all.
// ---------------------------------------------------------------------------

const englishCtx: TranslationContext = {
  t: (_key: string, englishText: string) => englishText,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

/** A minimal financial EngineDocData with a section that emits a bilingual section title. */
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
      to: {
        title: { en: 'Customer Information', ar: 'معلومات العميل' },
        name: 'Jane Client',
        rows: [{ label: { en: 'Phone:', ar: 'الهاتف:' }, value: '+968 9999 0000' }],
      },
    },
    meta: [{ label: { en: 'Invoice No:', ar: 'رقم الفاتورة:' }, value: 'INVO-0042' }],
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

/**
 * Walk the pdfmake content tree and collect every `lineColor` value (the header
 * divider rule sets `lineColor` on a canvas line). Used to assert the rule color.
 */
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

function styleColor(def: TDocumentDefinitions, styleName: string): string | undefined {
  const styles = def.styles as Record<string, { color?: string }> | undefined;
  return styles?.[styleName]?.color;
}

const ACCENT_HEX = '#7c3aed';

describe('branding — accent resolution (pure)', () => {
  it('treats the inherit sentinel as neutral (not opted in)', () => {
    expect(resolveAccentHex({ accent: 'inherit' })).toBeNull();
    expect(isAccentOptIn({ accent: 'inherit' })).toBe(false);
    const colors = resolveAccentColors({ accent: 'inherit' });
    expect(colors.rule).toBe(PDF_COLORS.primary);
    expect(colors.sectionTitle).toBe(PDF_COLORS.primary);
  });

  it('treats empty / whitespace / malformed values as neutral', () => {
    for (const bad of ['', '   ', 'royal', '#12', '#1234', 'rgb(0,0,0)', '162660']) {
      expect(resolveAccentHex({ accent: bad })).toBeNull();
      expect(resolveAccentColors({ accent: bad }).rule).toBe(PDF_COLORS.primary);
    }
  });

  it('accepts an explicit #RRGGBB / #RGB hex (case-insensitive, trimmed) as opt-in', () => {
    expect(resolveAccentHex({ accent: '#7C3AED' })).toBe('#7c3aed');
    expect(resolveAccentHex({ accent: '  #abc  ' })).toBe('#abc');
    expect(isAccentOptIn({ accent: ACCENT_HEX })).toBe(true);
    const colors = resolveAccentColors({ accent: ACCENT_HEX });
    expect(colors.rule).toBe(ACCENT_HEX);
    expect(colors.sectionTitle).toBe(ACCENT_HEX);
  });
});

describe('branding — watermark resolution (pure)', () => {
  it('resolves a non-empty string, trimming surrounding whitespace', () => {
    expect(resolveWatermark({ watermark: 'DRAFT' })).toBe('DRAFT');
    expect(resolveWatermark({ watermark: '  COPY  ' })).toBe('COPY');
  });

  it('resolves null / empty / whitespace-only to null (no watermark)', () => {
    expect(resolveWatermark({ watermark: null })).toBeNull();
    expect(resolveWatermark({ watermark: '' })).toBeNull();
    expect(resolveWatermark({ watermark: '   ' })).toBeNull();
  });
});

describe('renderTemplate — accent surfaces (default = neutral)', () => {
  it('keeps the header rule + section titles NEUTRAL when accent is absent', () => {
    const def = renderTemplate(BUILT_IN_TEMPLATE_CONFIGS.invoice, makeData(), englishCtx, null, null);

    const lineColors: string[] = [];
    collectLineColors(def.content, lineColors);
    // The header divider rule renders in the neutral primary.
    expect(lineColors).toContain(PDF_COLORS.primary);
    // The accent hex must NOT appear anywhere on the neutral default.
    expect(lineColors).not.toContain(ACCENT_HEX);

    // Section-title styles stay neutral primary.
    expect(styleColor(def, 'sectionTitle')).toBe(PDF_COLORS.primary);
    expect(styleColor(def, 'bilingualHeader')).toBe(PDF_COLORS.primary);
  });

  it('applies an explicit accent hex to the header rule + section-title styles only', () => {
    const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, {
      branding: { accent: ACCENT_HEX },
    });
    const def = renderTemplate(config, makeData(), englishCtx, null, null);

    const lineColors: string[] = [];
    collectLineColors(def.content, lineColors);
    // The header divider rule now adopts the accent...
    expect(lineColors).toContain(ACCENT_HEX);

    // ...and so do the section-title text styles.
    expect(styleColor(def, 'sectionTitle')).toBe(ACCENT_HEX);
    expect(styleColor(def, 'bilingualHeader')).toBe(ACCENT_HEX);

    // Bounded surface: body/table styles are NOT accented — table cells keep the
    // neutral text color and table headers keep the neutral primary fill.
    expect(styleColor(def, 'tableCell')).toBe(PDF_COLORS.text);
    const tableHeader = (def.styles as Record<string, { fillColor?: string }>).tableHeader;
    expect(tableHeader.fillColor).toBe(PDF_COLORS.primary);
  });
});

describe('renderTemplate — watermark', () => {
  it('emits NO watermark key by default', () => {
    const def = renderTemplate(BUILT_IN_TEMPLATE_CONFIGS.invoice, makeData(), englishCtx, null, null);
    expect('watermark' in def).toBe(false);
  });

  it('emits a pdfmake watermark object when branding.watermark is a string', () => {
    const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, {
      branding: { watermark: 'DRAFT' },
    });
    const def = renderTemplate(config, makeData(), englishCtx, null, null);
    const wm = def.watermark as Watermark;
    expect(wm).toBeDefined();
    expect(wm.text).toBe('DRAFT');
    // Reuses the shared neutral watermark visual params.
    expect(wm.bold).toBe(true);
    expect(typeof wm.opacity).toBe('number');
    expect(typeof wm.fontSize).toBe('number');
    expect(wm.color).toBe('#e2e8f0');
  });

  it('does not emit a watermark for an empty / whitespace-only string', () => {
    const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, {
      branding: { watermark: '   ' },
    });
    const def = renderTemplate(config, makeData(), englishCtx, null, null);
    expect('watermark' in def).toBe(false);
  });

  it('accent and watermark compose on one document', () => {
    const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, {
      branding: { accent: ACCENT_HEX, watermark: 'CONFIDENTIAL' },
    });
    const def = renderTemplate(config, makeData(), englishCtx, null, null);
    expect((def.watermark as Watermark).text).toBe('CONFIDENTIAL');
    expect(styleColor(def, 'sectionTitle')).toBe(ACCENT_HEX);
    const lineColors: string[] = [];
    collectLineColors(def.content as Content, lineColors);
    expect(lineColors).toContain(ACCENT_HEX);
  });
});

describe('resolveHeader logo margin/maxHeight', () => {
  it('defaults logoMarginBottom to 5 and logoMaxHeight to null', () => {
    const r = resolveHeader({ header: {} });
    expect(r.logoMarginBottom).toBe(5);
    expect(r.logoMaxHeight).toBeNull();
  });
  it('passes through configured values', () => {
    const r = resolveHeader({ header: { logoMarginBottom: 12, logoMaxHeight: 40 } });
    expect(r.logoMarginBottom).toBe(12);
    expect(r.logoMaxHeight).toBe(40);
  });
});

import { describe, it, expect } from 'vitest';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { renderTemplate } from './renderTemplate';
import type { EngineDocData } from './types';
import type { TranslationContext } from '../types';
import {
  BUILT_IN_TEMPLATE_CONFIGS,
  resolveTemplateConfig,
  type DocumentTemplateConfig,
} from '../templateConfig';

// ---------------------------------------------------------------------------
// renderTemplate — config-driven assembler tests.
//
// These assert the engine HONORS the resolved config (paper geometry, section
// order, section visibility) and — the load-bearing one — that a bilingual
// Arabic label supplied via `config.labels` actually appears in the rendered
// pdfmake content. That last assertion guards the null-Arabic-title regression
// the engine was built to fix: the engine must read the REAL Arabic string from
// config, not pass `null` into the bilingual style helpers.
//
// We do not snapshot here (the existing __goldens__ characterization owns that
// for the hand-written builders). Instead we walk the structural tree with a
// helper and make targeted assertions.
// ---------------------------------------------------------------------------

/**
 * A minimal, synthetic bilingual translation context. Values are fabricated:
 * `fontFamily: 'Roboto'` is the default pdfmake font (safe for getStylesWithFont),
 * and the bilingual/RTL flags exercise the Arabic code paths in the renderers.
 * No DB access, no font loading, no real records.
 */
const bilingualCtx: TranslationContext = {
  t: (_key: string, englishText: string) => englishText,
  isRTL: true,
  isBilingual: true,
  languageCode: 'ar',
  fontFamily: 'Roboto',
};

const englishCtx: TranslationContext = {
  t: (_key: string, englishText: string) => englishText,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

/**
 * A tiny 1x1 transparent PNG data URI, so the QR/footer renderers take their
 * image branch without needing real binary assets. Fabricated, deterministic.
 */
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/**
 * Build a minimal, document-agnostic EngineDocData covering the financial
 * sections the registry renders (header/parties/meta/lineItems/totals/terms/
 * qr/footer). The Arabic label strings here and in the config are what the
 * bilingual assertion looks for. All values are synthetic.
 */
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
        { key: 'quantity', visible: true, label: { en: 'Qty', ar: 'الكمية' }, width: 40, align: 'center' },
        { key: 'lineTotal', visible: true, label: { en: 'Total', ar: 'المجموع' }, align: 'right' },
      ],
      rows: [{ description: 'RAID-5 logical recovery', quantity: '1', lineTotal: '1000.000 OMR' }],
    },
    totals: [
      { label: { en: 'Subtotal:', ar: 'المجموع الفرعي:' }, value: '1000.000 OMR' },
      { label: { en: 'Total:', ar: 'الإجمالي:' }, value: '1050.000 OMR', emphasis: true },
    ],
    terms: { title: { en: 'Payment Terms', ar: 'شروط الدفع' }, body: 'Net 14 days.' },
    bank: null,
    qrCaption: 'Scan to pay this invoice',
  };
}

/** Collect every leaf `text` string in a pdfmake content tree (recursively). */
function collectTexts(node: unknown, out: string[]): void {
  if (node == null) return;
  if (typeof node === 'string') {
    out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectTexts(child, out);
    return;
  }
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    // `text` can itself be a string, array, or nested object — recurse into it.
    if ('text' in obj) collectTexts(obj.text, out);
    for (const key of Object.keys(obj)) {
      if (key === 'text') continue;
      collectTexts(obj[key], out);
    }
  }
}

/**
 * All text leaves across the document content AND the footer — invoking the
 * footer if it happens to be a function (the engine renders footer as content
 * today, but a future page-footer callback must still be exercised, per task).
 */
function allTexts(def: TDocumentDefinitions): string[] {
  const out: string[] = [];
  collectTexts(def.content, out);
  const footer = def.footer as
    | ((currentPage: number, pageCount: number, pageSize?: unknown) => Content)
    | Content
    | undefined;
  if (typeof footer === 'function') {
    collectTexts(footer(1, 1), out);
  } else if (footer != null) {
    collectTexts(footer, out);
  }
  return out;
}

describe('renderTemplate — page geometry', () => {
  it('honors pageSize, orientation, and margins from config.paper', () => {
    const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, {
      paper: { size: 'Letter', orientation: 'landscape', margins: [10, 20, 30, 40] },
    });
    const def = renderTemplate(config, makeData(), englishCtx, null, TINY_PNG);

    // 'Letter' maps to pdfmake's uppercase 'LETTER'.
    expect(def.pageSize).toBe('LETTER');
    expect(def.pageOrientation).toBe('landscape');
    expect(def.pageMargins).toEqual([10, 20, 30, 40]);
  });

  it('keeps A4 / portrait / built-in margins by default', () => {
    const config = BUILT_IN_TEMPLATE_CONFIGS.invoice;
    const def = renderTemplate(config, makeData(), englishCtx, null, TINY_PNG);
    expect(def.pageSize).toBe('A4');
    expect(def.pageOrientation).toBe('portrait');
    expect(def.pageMargins).toEqual(config.paper.margins);
  });

  it('wires the tenant font into defaultStyle and styles', () => {
    const def = renderTemplate(BUILT_IN_TEMPLATE_CONFIGS.invoice, makeData(), englishCtx, null, null);
    expect(def.defaultStyle).toEqual({ font: 'Roboto' });
    expect(def.styles).toBeDefined();
  });
});

describe('renderTemplate — section order & visibility', () => {
  it('renders registered sections and produces non-empty content', () => {
    const def = renderTemplate(BUILT_IN_TEMPLATE_CONFIGS.invoice, makeData(), englishCtx, null, TINY_PNG);
    expect(Array.isArray(def.content)).toBe(true);
    expect((def.content as Content[]).length).toBeGreaterThan(0);
  });

  it('emits sections in ascending config order (header title before totals)', () => {
    // header (order 0) carries the document title; totals (order 4) carries
    // the grand-total value. Title must appear before the total in the stream.
    const def = renderTemplate(BUILT_IN_TEMPLATE_CONFIGS.invoice, makeData(), englishCtx, null, null);
    const texts = allTexts(def);
    const titleIdx = texts.findIndex((t) => t.includes('TAX INVOICE'));
    const totalIdx = texts.findIndex((t) => t.includes('1050.000 OMR'));
    expect(titleIdx).toBeGreaterThanOrEqual(0);
    expect(totalIdx).toBeGreaterThanOrEqual(0);
    expect(titleIdx).toBeLessThan(totalIdx);
  });

  it('reorders when an override moves a section (footer to the front)', () => {
    // Move footer to order -1 so it renders first; its tagline text must then
    // precede the document title text.
    const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, {
      sections: [{ key: 'footer', order: -1 }],
    });
    const def = renderTemplate(config, makeData(), englishCtx, null, null);
    const texts = allTexts(def);
    const taglineIdx = texts.findIndex((t) => t.includes('Recovered. Verified. Delivered.'));
    const titleIdx = texts.findIndex((t) => t.includes('TAX INVOICE'));
    expect(taglineIdx).toBeGreaterThanOrEqual(0);
    expect(titleIdx).toBeGreaterThanOrEqual(0);
    expect(taglineIdx).toBeLessThan(titleIdx);
  });

  it('omits a section whose config visibility is false', () => {
    const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, {
      sections: [{ key: 'terms', visible: false }],
    });
    const def = renderTemplate(config, makeData(), englishCtx, null, null);
    const texts = allTexts(def);
    // The terms body must be gone...
    expect(texts.some((t) => t.includes('Net 14 days.'))).toBe(false);
    // ...while a still-visible section (the document title) remains.
    expect(texts.some((t) => t.includes('TAX INVOICE'))).toBe(true);
  });

  it('skips unknown / unregistered section keys without crashing', () => {
    const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, {
      sections: [{ key: 'someFutureSection', visible: true, order: 99 }],
    });
    expect(() => renderTemplate(config, makeData(), englishCtx, null, null)).not.toThrow();
  });
});

describe('renderTemplate — bilingual Arabic labels (null-Arabic-title guard)', () => {
  it('renders the real Arabic document title in bilingual mode (not null)', () => {
    // Bilingual side-by-side, Arabic-leading. The engine must surface the ACTUAL
    // Arabic string, never null (the null-Arabic-title regression this engine
    // was built to fix). M5 GAP 1: the header now prefers the adapter-supplied
    // `data.documentTitle` over the static `config.labels.documentTitle`, so the
    // rendered Arabic title is the one the DATA carries (`makeData()`'s
    // `documentTitle.ar`). The config still customizes the EN/AR labels for
    // tenants who don't supply a data title, but the data title wins when set.
    const config: DocumentTemplateConfig = resolveTemplateConfig(
      BUILT_IN_TEMPLATE_CONFIGS.invoice,
      undefined,
      {
        language: { mode: 'bilingual_sidebyside', primary: 'ar' },
        labels: { documentTitle: { en: 'TAX INVOICE', ar: 'فاتورة ضريبية مخصصة' } },
      },
    );
    const data = makeData();
    const def = renderTemplate(config, data, bilingualCtx, null, TINY_PNG);
    const texts = allTexts(def);

    // The REAL Arabic title from the data (not null) must appear in the output.
    const arabicTitle = data.documentTitle.ar as string;
    expect(arabicTitle).toBe('فاتورة ضريبية');
    expect(texts.some((t) => t.includes(arabicTitle))).toBe(true);
  });

  it('does not surface the Arabic title when the mode is english-only', () => {
    const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, {
      language: { mode: 'en', primary: 'en' },
      labels: { documentTitle: { en: 'TAX INVOICE', ar: 'فاتورة ضريبية مخصصة' } },
    });
    const def = renderTemplate(config, makeData(), englishCtx, null, null);
    const texts = allTexts(def);
    expect(texts.some((t) => t.includes('فاتورة ضريبية مخصصة'))).toBe(false);
    expect(texts.some((t) => t.includes('TAX INVOICE'))).toBe(true);
  });
});

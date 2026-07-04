import { describe, it, expect } from 'vitest';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { toEngineData } from './adapters/quoteAdapter';
import { renderTemplate } from './renderTemplate';
import type { TranslationContext, QuoteDocumentData } from '../types';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../templateConfig';
import { buildQuoteFixture as makeQuoteData, TINY_PNG } from './quoteParity.fixtures';

// ---------------------------------------------------------------------------
// Quote ENGINE GOLDEN.
//
// Renders a representative quote through the config-driven engine
// (toEngineData → renderTemplate) and asserts its CONTENT/STRUCTURE: the
// bilingual document title, every line-item row + value,
// subtotal/discount/net/VAT/total, customer, terms/notes + bank box, and a
// repeating page-footer callback.
//
// These probes were the ENGINE half of the former legacy↔engine parity suite;
// the legacy `buildQuoteDocument` was the comparison oracle and was deleted in
// Task 10 after a final byte-for-byte parity run proved the engine output
// identical. The engine is now the sole quote render path, so these are its
// golden. All inputs are synthetic — no DB, no font loading.
// ---------------------------------------------------------------------------

const englishCtx: TranslationContext = {
  t: (_key: string, englishText: string) => englishText,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

const bilingualCtx: TranslationContext = {
  t: (_key: string, englishText: string) => englishText,
  isRTL: false,
  isBilingual: true,
  languageCode: 'ar',
  fontFamily: 'Roboto',
};

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
    if ('text' in obj) collectTexts(obj.text, out);
    for (const key of Object.keys(obj)) {
      if (key === 'text') continue;
      collectTexts(obj[key], out);
    }
  }
}

/** All text leaves across the content AND the (possibly-callback) footer. */
function allTexts(def: TDocumentDefinitions): string[] {
  const out: string[] = [];
  collectTexts(def.content, out);
  const footer = def.footer as
    | ((currentPage: number, pageCount: number, pageSize?: unknown) => Content)
    | Content
    | undefined;
  if (typeof footer === 'function') {
    collectTexts(footer(1, 1, undefined), out);
  } else if (footer != null) {
    collectTexts(footer, out);
  }
  return out;
}

/** Render the quote via the config-driven engine. */
function renderEngine(
  data: QuoteDocumentData,
  ctx: TranslationContext = englishCtx,
): TDocumentDefinitions {
  const config = BUILT_IN_TEMPLATE_CONFIGS.quote;
  const engineData = toEngineData(data, config);
  return renderTemplate(config, engineData, ctx, null, TINY_PNG);
}

describe('quote engine golden — the engine is the sole render path', () => {
  it('renders the QUOTATION title (single language)', () => {
    const data = makeQuoteData();
    const engine = allTexts(renderEngine(data));
    expect(engine.some((t) => t.includes('QUOTATION'))).toBe(true);
  });

  it('renders the bilingual QUOTATION title', () => {
    const data = makeQuoteData();
    // Engine reads bilingual from config language mode, not ctx — assert the
    // engine emits the Arabic title from config.
    const config = BUILT_IN_TEMPLATE_CONFIGS.quote;
    const bilingualConfig = {
      ...config,
      language: { mode: 'bilingual_stacked' as const, primary: 'en' as const },
    };
    const engineData = toEngineData(data, bilingualConfig);
    const engineJoined = allTexts(
      renderTemplate(bilingualConfig, engineData, bilingualCtx, null, TINY_PNG),
    ).join('|');

    expect(engineJoined).toContain('عرض أسعار');
    expect(engineJoined).toContain('QUOTATION');
  });

  it('renders every line-item row + value', () => {
    const data = makeQuoteData();
    const engine = allTexts(renderEngine(data));

    for (const desc of ['RAID-5 logical recovery', 'Donor drive sourcing']) {
      expect(engine.some((t) => t.includes(desc))).toBe(true);
    }
    // Line-item monetary values (AED, 2dp, 'after').
    for (const val of ['1,000.00 AED', '250.00 AED', '500.00 AED']) {
      expect(engine.some((t) => t.includes(val))).toBe(true);
    }
  });

  it('renders subtotal / discount / net / VAT / total', () => {
    const data = makeQuoteData();
    const engineJoined = allTexts(renderEngine(data)).join('|');

    for (const val of ['1,500.00 AED', '100.00 AED', '1,400.00 AED', '70.00 AED', '1,470.00 AED']) {
      expect(engineJoined).toContain(val);
    }
  });

  it('handles a percentage discount', () => {
    // 10% of 1500 = 150 discount → net 1350, VAT 5% = 67.50, total 1417.50.
    const data = makeQuoteData({
      discount_type: 'percentage',
      discount_amount: 10,
      tax_amount: 67.5,
      total_amount: 1417.5,
    });
    const engineJoined = allTexts(renderEngine(data)).join('|');

    for (const val of ['150.00 AED', '1,350.00 AED', '67.50 AED', '1,417.50 AED']) {
      expect(engineJoined).toContain(val);
    }
  });

  it('renders the customer block', () => {
    const data = makeQuoteData();
    const engine = allTexts(renderEngine(data));

    for (const probe of ['Jane Client', 'jane@client.test', '+971 50 123 4567', 'QUO-2026-0042']) {
      expect(engine.some((t) => t.includes(probe))).toBe(true);
    }
  });

  it('renders the validity (valid_until) in the meta', () => {
    const data = makeQuoteData();
    const engine = allTexts(renderEngine(data)).join('|');
    // 2026-07-13 → "13 Jul 2026" via dd MMM yyyy.
    expect(engine).toContain('13 Jul 2026');
  });

  it('renders the per-record Quote Terms + Notes as their own section, alongside the standard template terms and the bank box', () => {
    const data = makeQuoteData();
    // Standard (Studio) terms and per-record terms are now INDEPENDENT sections:
    // both render — the per-record terms no longer override the template.
    const config = {
      ...BUILT_IN_TEMPLATE_CONFIGS.quote,
      termsContent: {
        terms: { en: 'TEMPLATE STANDARD TERMS' },
        notes: { en: 'TEMPLATE STANDARD NOTES' },
      },
    };
    const engineData = toEngineData(data, config);
    const engine = allTexts(renderTemplate(config, engineData, englishCtx, null, TINY_PNG));

    // Per-record "Quote Terms" section (from the edited quote).
    for (const probe of [
      'Quote Terms',
      'Quote valid for 30 days. 50% advance required to begin.',
      'Diagnostics are non-destructive.',
    ]) {
      expect(engine.some((t) => t.includes(probe))).toBe(true);
    }
    // The standard Terms & Conditions section renders the template content independently.
    expect(engine.some((t) => t.includes('TEMPLATE STANDARD TERMS'))).toBe(true);
    expect(engine.some((t) => t.includes('TEMPLATE STANDARD NOTES'))).toBe(true);
    // Bank box detail rows — its own section now.
    for (const probe of ['Acme Data Recovery LLC', 'First National Bank', 'AE12 0000 0000 0123 4567 89', 'FNBKAEXX']) {
      expect(engine.some((t) => t.includes(probe))).toBe(true);
    }
  });

  it('emits a repeating page-footer callback (gap — page footer)', () => {
    const def = renderEngine(makeQuoteData());
    expect(typeof def.footer).toBe('function');

    const footerFn = def.footer as (cp: number, pc: number) => Content;
    const footerTexts: string[] = [];
    collectTexts(footerFn(1, 1), footerTexts);
    expect(footerTexts.some((t) => t.includes('Recovered. Verified. Delivered.'))).toBe(true);
    expect(footerTexts.some((t) => t.includes('https://acme.test'))).toBe(true);
  });
});

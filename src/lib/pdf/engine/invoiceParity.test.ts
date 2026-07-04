import { describe, it, expect } from 'vitest';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { toEngineData } from './adapters/invoiceAdapter';
import { renderTemplate } from './renderTemplate';
import type { TranslationContext, InvoiceDocumentData } from '../types';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../templateConfig';
import { buildInvoiceFixture as makeInvoiceData, TINY_PNG } from './invoiceParity.fixtures';

// ---------------------------------------------------------------------------
// Invoice ENGINE GOLDEN.
//
// Renders a representative invoice through the config-driven engine
// (toEngineData → renderTemplate) and asserts its CONTENT/STRUCTURE: the
// document title, every line-item row + value, subtotal/discount/VAT/total,
// Amount Paid + Balance Due, every payment-history row, and that a repeating
// page-footer callback exists.
//
// These probes were the ENGINE half of the former legacy↔engine parity suite;
// the legacy `buildInvoiceDocument` was the comparison oracle and was deleted in
// Task 10 after a final byte-for-byte parity run proved the engine output
// identical. The engine is now the sole invoice render path, so these are its
// golden. They pin the four M5 gaps closed:
//   1. title precedence (proforma renders PROFORMA, not the static TAX INVOICE)
//   2. repeating page footer (a `footer:` callback, not trailing content)
//   3. bilingual terms/notes + bank layout (Payment Terms / Notes stacks)
//   4. payment history + Amount Paid / Balance Due totals
//
// All inputs are synthetic — no DB, no font loading.
// ---------------------------------------------------------------------------

const englishCtx: TranslationContext = {
  t: (_key: string, englishText: string) => englishText,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
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

/** Render the invoice via the config-driven engine. */
function renderEngine(
  data: InvoiceDocumentData,
  ctx: TranslationContext = englishCtx,
): TDocumentDefinitions {
  const config = BUILT_IN_TEMPLATE_CONFIGS.invoice;
  const engineData = toEngineData(data, config);
  return renderTemplate(config, engineData, ctx, null, TINY_PNG);
}

describe('invoice engine golden — the engine is the sole render path', () => {
  it('renders the document title (tax invoice)', () => {
    const data = makeInvoiceData();
    const engine = allTexts(renderEngine(data));
    expect(engine.some((t) => t.includes('TAX INVOICE'))).toBe(true);
  });

  it('renders the proforma title (gap 1 — title precedence)', () => {
    const data = makeInvoiceData({ invoice_type: 'proforma' });
    const engine = allTexts(renderEngine(data));
    expect(engine.some((t) => t.includes('PROFORMA INVOICE'))).toBe(true);
    // Crucially, the engine must NOT fall back to the config's static title.
    expect(engine.some((t) => t.includes('TAX INVOICE'))).toBe(false);
  });

  it('renders every line-item row + value', () => {
    const data = makeInvoiceData();
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
    const data = makeInvoiceData();
    const engineJoined = allTexts(renderEngine(data)).join('|');

    for (const val of ['1,500.00 AED', '100.00 AED', '1,400.00 AED', '70.00 AED', '1,470.00 AED']) {
      expect(engineJoined).toContain(val);
    }
  });

  it('renders Amount Paid + Balance Due (gap 4 — paid/balance)', () => {
    const data = makeInvoiceData();
    const engine = allTexts(renderEngine(data));

    expect(engine.some((t) => t.includes('Amount Paid:'))).toBe(true);
    expect(engine.some((t) => t.includes('Balance Due:'))).toBe(true);

    // Values: paid 470.00, balance 1000.00.
    const engineJoined = engine.join('|');
    expect(engineJoined).toContain('470.00 AED');
    expect(engineJoined).toContain('1,000.00 AED');
  });

  it('renders every payment-history row (gap 4 — payment history)', () => {
    const data = makeInvoiceData();
    const engine = allTexts(renderEngine(data));

    // The section title + each row's document number, method, recorder, and
    // running balance must appear.
    for (const probe of ['Payment History', 'RCPT-0001', 'RCPT-0002', 'Bank Transfer', 'Cash', 'Alex Accounts', 'TRX-1001', 'CASH-9']) {
      expect(engine.some((t) => t.includes(probe))).toBe(true);
    }
    // Running balances (statement-style).
    const engineJoined = engine.join('|');
    expect(engineJoined).toContain('1,170.00 AED');
    expect(engineJoined).toContain('1,000.00 AED');
  });

  it('omits payment history + paid/balance on a proforma (parity)', () => {
    const data = makeInvoiceData({ invoice_type: 'proforma' });
    const engine = allTexts(renderEngine(data));
    expect(engine.some((t) => t.includes('Payment History'))).toBe(false);
    expect(engine.some((t) => t.includes('Amount Paid:'))).toBe(false);
    expect(engine.some((t) => t.includes('Balance Due:'))).toBe(false);
  });

  it('renders the per-record Invoice Terms + Notes as their own section, alongside the standard template terms and the bank box', () => {
    const data = makeInvoiceData();
    // Standard (Studio) terms and per-record terms are now INDEPENDENT sections:
    // both render — the per-record terms no longer override the template.
    const config = {
      ...BUILT_IN_TEMPLATE_CONFIGS.invoice,
      termsContent: {
        terms: { en: 'TEMPLATE STANDARD TERMS' },
        notes: { en: 'TEMPLATE STANDARD NOTES' },
      },
    };
    const engineData = toEngineData(data, config);
    const engine = allTexts(renderTemplate(config, engineData, englishCtx, null, TINY_PNG));

    // Per-record "Invoice Terms" section (from the edited invoice).
    for (const probe of ['Invoice Terms', 'Net 14 days from the invoice date.', 'Thank you for trusting our lab with your data recovery.']) {
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

  it('emits a repeating page-footer callback (gap 2)', () => {
    const def = renderEngine(makeInvoiceData());
    // The engine must promote footer/qr to a pdfmake page `footer:` callback.
    expect(typeof def.footer).toBe('function');

    // The page footer carries the tagline + website on every page.
    const footerFn = def.footer as (cp: number, pc: number) => Content;
    const footerTexts: string[] = [];
    collectTexts(footerFn(1, 1), footerTexts);
    expect(footerTexts.some((t) => t.includes('Recovered. Verified. Delivered.'))).toBe(true);
    expect(footerTexts.some((t) => t.includes('https://acme.test'))).toBe(true);
  });
});

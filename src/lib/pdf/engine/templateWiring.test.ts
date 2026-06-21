import { describe, it, expect } from 'vitest';
import { renderTemplate } from './renderTemplate';
import { renderSignature } from './sections/signature';
import { resolveLabel } from './labels';
import { toEngineData as invoiceToEngine } from './adapters/invoiceAdapter';
import { sampleInvoiceData, buildPreviewEngineData } from './sampleData';
import { BUILT_IN_TEMPLATE_CONFIGS, resolveTemplateConfig } from '../templateConfig';
import type { LanguageConfig } from '../templateConfig';
import type { EngineContext, EngineDocData } from './types';
import type { TranslationContext } from '../types';

// ---------------------------------------------------------------------------
// Template Studio wiring fixes: language (stacked vs side-by-side), signature
// fallback, generic QR payload, and the side-by-side parties+meta layout.
// ---------------------------------------------------------------------------

const ctx: TranslationContext = {
  t: (_k, en) => en,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

/** Recursively collect every text/qr string in a pdfmake content tree. */
function collectStrings(node: unknown, out: string[]): void {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((c) => collectStrings(c, out));
  const o = node as Record<string, unknown>;
  if (typeof o.text === 'string') out.push(o.text);
  if (typeof o.qr === 'string') out.push(o.qr);
  Object.values(o).forEach((v) => collectStrings(v, out));
}

/** Find a `columns` or `table` grouping node whose subtree contains BOTH needles. */
function findGroupWithBoth(node: unknown, a: string, b: string): boolean {
  if (node == null || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some((c) => findGroupWithBoth(c, a, b));
  const o = node as Record<string, unknown>;
  for (const key of ['columns', 'table'] as const) {
    if (o[key] != null && typeof o[key] === 'object') {
      const strings: string[] = [];
      collectStrings(o[key], strings);
      const joined = strings.join(' ');
      if (joined.includes(a) && joined.includes(b)) return true;
    }
  }
  return Object.values(o).some((v) => findGroupWithBoth(v, a, b));
}

describe('resolveLabel: bilingual modes are distinct', () => {
  const label = { en: 'Total:', ar: 'الإجمالي:' };

  it('joins inline with a pipe for side-by-side', () => {
    const lang: LanguageConfig = { mode: 'bilingual_sidebyside', primary: 'en' };
    expect(resolveLabel(label, lang)).toBe('Total: | الإجمالي:');
  });

  it('joins with a newline for stacked', () => {
    const lang: LanguageConfig = { mode: 'bilingual_stacked', primary: 'en' };
    expect(resolveLabel(label, lang)).toBe('Total:\nالإجمالي:');
  });

  it('leads with the primary language', () => {
    const lang: LanguageConfig = { mode: 'bilingual_sidebyside', primary: 'ar' };
    expect(resolveLabel(label, lang)).toBe('الإجمالي: | Total:');
  });
});

describe('renderTemplate: Arabic-capable font for bilingual documents', () => {
  it('uses the Arabic family for English-lead bilingual so Arabic glyphs shape (no right-align)', () => {
    const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, {
      language: { mode: 'bilingual_sidebyside', primary: 'en' },
    });
    const data = invoiceToEngine(sampleInvoiceData(), config);
    const def = renderTemplate(config, data, ctx, null, null);
    expect((def.defaultStyle as { font?: string }).font).toBe('Tajawal');
    // English leads → stays LTR (only Arabic-lead flips alignment).
    expect((def.defaultStyle as { alignment?: string }).alignment).toBeUndefined();
  });

  it('keeps the Latin font for pure English', () => {
    const config = BUILT_IN_TEMPLATE_CONFIGS.invoice;
    const data = invoiceToEngine(sampleInvoiceData(), config);
    const def = renderTemplate(config, data, ctx, null, null);
    expect((def.defaultStyle as { font?: string }).font).toBe('Roboto');
  });
});

describe('renderSignature: always renders a line when shown', () => {
  const engine: EngineContext = { config: BUILT_IN_TEMPLATE_CONFIGS.invoice, ctx };

  it('renders a default Authorized Signature line when the document supplies none', () => {
    const data: EngineDocData = {
      ...invoiceToEngine(sampleInvoiceData(), BUILT_IN_TEMPLATE_CONFIGS.invoice),
      signatures: undefined,
    };
    const out = renderSignature(engine, data);
    expect(out).not.toBeNull();
    const strings: string[] = [];
    collectStrings(out, strings);
    expect(strings.join(' ')).toContain('Authorized Signature');
  });

  it('renders the document-supplied lines when present', () => {
    const data = invoiceToEngine(sampleInvoiceData(), BUILT_IN_TEMPLATE_CONFIGS.invoice);
    const out = renderSignature(engine, data);
    const strings: string[] = [];
    collectStrings(out, strings);
    expect(strings.join(' ')).toContain('Customer Signature');
  });
});

describe('invoice adapter: generic QR payload + signatures', () => {
  it('emits a scannable qrPayload when no ZATCA payload is built', () => {
    const data = invoiceToEngine(sampleInvoiceData(), BUILT_IN_TEMPLATE_CONFIGS.invoice);
    expect(data.zatcaPayload).toBeFalsy();
    expect(data.qrPayload).toBeTruthy();
    expect(data.qrPayload).toContain('INV-0042');
  });

  it('renders a native QR in the footer from qrPayload when no image/ZATCA is supplied', () => {
    const config = BUILT_IN_TEMPLATE_CONFIGS.invoice;
    const data = invoiceToEngine(sampleInvoiceData(), config);
    const def = renderTemplate(config, data, ctx, 'LOGO', null);
    const out = typeof def.footer === 'function' ? def.footer(1, 1, { width: 595, height: 842 } as never) : def.footer;
    const strings: string[] = [];
    collectStrings(out, strings);
    expect(strings.some((s) => s.includes('INV-0042'))).toBe(true);
  });
});

describe('adapters: missing detail rows are omitted (not printed as "-")', () => {
  it('omits the Company row when no company is present', () => {
    const data = invoiceToEngine(sampleInvoiceData(), BUILT_IN_TEMPLATE_CONFIGS.invoice);
    const rows = data.parties.to?.rows ?? [];
    expect(rows.map((r) => r.label.en)).not.toContain('Company:');
    // a present detail still renders
    expect(rows.map((r) => r.label.en)).toContain('Phone:');
    // no row carries a "-" placeholder value
    expect(rows.map((r) => r.value)).not.toContain('-');
  });

  it('omits the Reference row when client_reference is absent', () => {
    const sample = sampleInvoiceData();
    delete (sample.invoiceData as { client_reference?: string }).client_reference;
    const data = invoiceToEngine(sample, BUILT_IN_TEMPLATE_CONFIGS.invoice);
    expect((data.parties.to?.rows ?? []).map((r) => r.label.en)).not.toContain('Reference:');
  });
});

describe('renderTemplate: parties + meta side by side', () => {
  it('combines the customer block and document-details block into one equal-height panel (default on for invoices)', () => {
    const config = BUILT_IN_TEMPLATE_CONFIGS.invoice;
    expect(config.layout?.partiesMetaSideBySide).toBe(true);
    const data = invoiceToEngine(sampleInvoiceData(), config);
    const def = renderTemplate(config, data, ctx, null, null);
    expect(findGroupWithBoth(def.content, 'Jane Client', 'INV-0042')).toBe(true);
  });

  it('stacks them when the layout flag is off', () => {
    const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, {
      layout: { partiesMetaSideBySide: false },
    });
    const data = invoiceToEngine(sampleInvoiceData(), config);
    const def = renderTemplate(config, data, ctx, null, null);
    expect(findGroupWithBoth(def.content, 'Jane Client', 'INV-0042')).toBe(false);
    const strings: string[] = [];
    collectStrings(def.content, strings);
    const joined = strings.join(' ');
    expect(joined).toContain('Jane Client');
    expect(joined).toContain('INV-0042');
  });

  it('pairs the customer block with the CASE-INFO block on intake/checkout docs (default on)', () => {
    for (const docType of ['office_receipt', 'customer_copy', 'checkout_form'] as const) {
      const config = BUILT_IN_TEMPLATE_CONFIGS[docType];
      expect(config.layout?.partiesMetaSideBySide).toBe(true);
      const data = buildPreviewEngineData(docType, config);
      const def = renderTemplate(config, data, ctx, null, null);
      // Customer name + Case ID end up in the same equal-height panel.
      expect(findGroupWithBoth(def.content, 'Jane Client', 'CASE-0007')).toBe(true);
    }
  });
});

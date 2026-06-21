// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderTerms, renderRecordTerms } from './terms';
import type { EngineContext, EngineDocData } from '../types';
import type {
  DocumentTemplateConfig,
  LabelText,
  SectionConfig,
  TermsContentConfig,
} from '../../templateConfig';

function collectText(node: unknown, out: string[]): void {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((c) => collectText(c, out));
  const o = node as Record<string, unknown>;
  if (typeof o.text === 'string') out.push(o.text);
  Object.values(o).forEach((v) => collectText(v, out));
}

/** Document data carrying a bank block (no longer rendered by the terms sections). */
const BANK = {
  bank: {
    title: { en: 'Bank Account', ar: 'تفاصيل البنك' },
    rows: [{ label: { en: 'Account Name:', ar: 'اسم الحساب:' }, value: 'Future Space LLC' }],
  },
} as unknown as EngineDocData;

const NO_DATA = {} as EngineDocData;

const EN = { mode: 'en', primary: 'en' };
const BILINGUAL = { mode: 'bilingual_sidebyside', primary: 'en' };

function engine(opts: {
  termsContent?: TermsContentConfig;
  sections?: Pick<SectionConfig, 'key' | 'visible' | 'order'>[];
  language?: { mode: string; primary: string };
  labels?: Record<string, LabelText>;
}): EngineContext {
  return {
    config: {
      language: opts.language ?? EN,
      sections: opts.sections ?? [{ key: 'terms', visible: true, order: 7 }],
      labels: opts.labels ?? {},
      termsContent: opts.termsContent,
    } as unknown as DocumentTemplateConfig,
  } as EngineContext;
}

function withRecordTerms(
  blocks: Array<{ title: LabelText; body: string; format?: 'html' | 'text' }>,
): EngineDocData {
  return { terms: { title: { en: 'Quote Terms', ar: 'شروط العرض' }, blocks } } as unknown as EngineDocData;
}

const TERMS_EN = 'Valid 30 days. 50% advance to begin.';
const TERMS_AR = 'صالح لمدة ٣٠ يومًا. دفعة مقدمة ٥٠٪ للبدء.';

describe('renderTerms — standard Terms & Conditions (Studio only)', () => {
  it('renders the Studio Terms (English) from the config', () => {
    const out = renderTerms(engine({ termsContent: { terms: { en: TERMS_EN } } }), NO_DATA);
    const texts: string[] = [];
    collectText(out, texts);
    expect(texts.some((t) => t.includes(TERMS_EN))).toBe(true);
  });

  it('shows both English and Arabic terms on a bilingual document', () => {
    const out = renderTerms(
      engine({ termsContent: { terms: { en: TERMS_EN, ar: TERMS_AR } }, language: BILINGUAL }),
      NO_DATA,
    );
    const texts: string[] = [];
    collectText(out, texts);
    expect(texts.some((t) => t.includes(TERMS_EN))).toBe(true);
    expect(texts.some((t) => t.includes(TERMS_AR))).toBe(true);
  });

  it('omits the Arabic terms on an English-only document', () => {
    const out = renderTerms(
      engine({ termsContent: { terms: { en: TERMS_EN, ar: TERMS_AR } }, language: EN }),
      NO_DATA,
    );
    const texts: string[] = [];
    collectText(out, texts);
    expect(texts.some((t) => t.includes(TERMS_EN))).toBe(true);
    expect(texts.some((t) => t.includes(TERMS_AR))).toBe(false);
  });

  it('renders the Studio Notes block when set', () => {
    const out = renderTerms(
      engine({ termsContent: { notes: { en: 'Diagnostics are non-destructive.' } } }),
      NO_DATA,
    );
    const texts: string[] = [];
    collectText(out, texts);
    expect(texts.some((t) => t.includes('Diagnostics are non-destructive.'))).toBe(true);
  });

  it('returns null when the Studio terms and notes are both empty', () => {
    expect(renderTerms(engine({}), NO_DATA)).toBeNull();
  });

  it('NEVER falls back to per-record terms — returns null when the Studio content is blank', () => {
    const out = renderTerms(
      engine({}),
      withRecordTerms([{ title: { en: 'Quote Terms' }, body: 'PER-RECORD CONTENT' }]),
    );
    expect(out).toBeNull();
  });

  it('renders only the Studio terms, never the per-record terms (independent)', () => {
    const out = renderTerms(
      engine({ termsContent: { terms: { en: 'STUDIO STANDARD' } } }),
      withRecordTerms([{ title: { en: 'Quote Terms' }, body: 'PER-RECORD CONTENT' }]),
    );
    const texts: string[] = [];
    collectText(out, texts);
    expect(texts.some((t) => t.includes('STUDIO STANDARD'))).toBe(true);
    expect(texts.some((t) => t.includes('PER-RECORD CONTENT'))).toBe(false);
  });

  it('does not render the bank box (bank is its own section now)', () => {
    const out = renderTerms(engine({ termsContent: { terms: { en: TERMS_EN } } }), BANK);
    const texts: string[] = [];
    collectText(out, texts);
    expect(texts.some((t) => t.includes('Future Space LLC'))).toBe(false);
  });
});

describe('renderTerms — centre-split box layout', () => {
  type Box = { table?: { widths?: unknown[]; body?: unknown[][] } };
  const firstBox = (out: unknown): Box => (out as { stack: Box[] }).stack[0];

  it('renders a single centre-split box on a bilingual document (English | Arabic)', () => {
    const out = renderTerms(
      engine({ termsContent: { terms: { en: TERMS_EN, ar: TERMS_AR } }, language: BILINGUAL }),
      NO_DATA,
    );
    const box = firstBox(out);
    expect(box.table?.widths).toHaveLength(2);
    const row = box.table?.body?.[0] ?? [];
    const enText: string[] = [];
    const arText: string[] = [];
    collectText(row[0], enText);
    collectText(row[1], arText);
    expect(enText.some((t) => t.includes(TERMS_EN))).toBe(true);
    expect(arText.some((t) => t.includes(TERMS_AR))).toBe(true);
    expect(arText.some((t) => t.includes(TERMS_EN))).toBe(false);
  });

  it('renders a single full-width box on an English-only document', () => {
    const out = renderTerms(
      engine({ termsContent: { terms: { en: TERMS_EN } }, language: EN }),
      NO_DATA,
    );
    expect(firstBox(out).table?.widths).toHaveLength(1);
  });
});

describe('renderRecordTerms — per-record Quote/Invoice Terms', () => {
  const RECORD_TERMS = 'No data, no fee. Quote valid 30 days. 50% deposit to begin.';

  it('renders the per-record plain-text terms', () => {
    const out = renderRecordTerms(
      engine({}),
      withRecordTerms([{ title: { en: 'Quote Terms' }, body: RECORD_TERMS }]),
    );
    const texts: string[] = [];
    collectText(out, texts);
    expect(texts.some((t) => t.includes(RECORD_TERMS))).toBe(true);
  });

  it('returns null when the record carries no terms', () => {
    expect(renderRecordTerms(engine({}), withRecordTerms([]))).toBeNull();
  });

  it('returns null when data.terms is absent', () => {
    expect(renderRecordTerms(engine({}), NO_DATA)).toBeNull();
  });

  it('renders the per-record terms heading ("Quote Terms")', () => {
    const out = renderRecordTerms(
      engine({}),
      withRecordTerms([{ title: { en: 'Quote Terms' }, body: RECORD_TERMS }]),
    );
    const texts: string[] = [];
    collectText(out, texts);
    expect(texts.some((t) => t === 'Quote Terms')).toBe(true);
  });

  it('uses the configured section label as the heading when renamed in the Studio', () => {
    const out = renderRecordTerms(
      engine({ labels: { recordTerms: { en: 'Special Terms' } } }),
      withRecordTerms([{ title: { en: 'Quote Terms' }, body: RECORD_TERMS }]),
    );
    const texts: string[] = [];
    collectText(out, texts);
    expect(texts.some((t) => t === 'Special Terms')).toBe(true);
    expect(texts.some((t) => t === 'Quote Terms')).toBe(false);
  });

  it('renders both the per-record terms and notes blocks', () => {
    const out = renderRecordTerms(
      engine({}),
      withRecordTerms([
        { title: { en: 'Quote Terms' }, body: 'Net 30 from invoice date.' },
        { title: { en: 'Notes' }, body: 'Handle the donor drive with care.' },
      ]),
    );
    const texts: string[] = [];
    collectText(out, texts);
    expect(texts.some((t) => t.includes('Net 30 from invoice date.'))).toBe(true);
    expect(texts.some((t) => t === 'Notes')).toBe(true);
    expect(texts.some((t) => t.includes('Handle the donor drive with care.'))).toBe(true);
  });

  it('renders a per-record HTML body as structured content (rich invoice editor)', () => {
    const out = renderRecordTerms(
      engine({}),
      withRecordTerms([
        { title: { en: 'Invoice Terms' }, body: '<div><p>Pay <strong>50%</strong> upfront</p></div>', format: 'html' },
      ]),
    );
    const texts: string[] = [];
    collectText(out, texts);
    expect(texts.some((t) => t.includes('Pay '))).toBe(true);
    expect(texts.some((t) => t.includes('50%'))).toBe(true);
    expect(texts.some((t) => t.includes('upfront'))).toBe(true);
  });

  it('decodes HTML entities in plain-text per-record terms (&amp; → &)', () => {
    const out = renderRecordTerms(
      engine({}),
      withRecordTerms([
        { title: { en: 'Quote Terms' }, body: 'Accepted Payments: Cash, Card, Cheque &amp; Bank Transfer.' },
      ]),
    );
    const texts: string[] = [];
    collectText(out, texts);
    const joined = texts.join('\n');
    expect(joined).toContain('Cheque & Bank Transfer');
    expect(joined).not.toContain('&amp;');
  });

  it('drops a leading heading line that duplicates the section heading', () => {
    const out = renderRecordTerms(
      engine({}),
      withRecordTerms([{ title: { en: 'Quote Terms' }, body: 'Quote Terms\nNo data, no fee.' }]),
    );
    const texts: string[] = [];
    collectText(out, texts);
    expect(texts.filter((t) => t.includes('Quote Terms')).length).toBe(1);
    expect(texts.join('\n')).toContain('No data, no fee.');
  });

  it('drops a leading STANDARD heading even when the section heading differs (snippet "Terms & Conditions" under a Quote Terms section)', () => {
    const out = renderRecordTerms(
      engine({}),
      withRecordTerms([{ title: { en: 'Quote Terms' }, body: 'Terms & Conditions\nNo data, no fee.' }]),
    );
    const texts: string[] = [];
    collectText(out, texts);
    const joined = texts.join('\n');
    expect(joined).not.toContain('Terms & Conditions');
    expect(joined).toContain('No data, no fee.');
    expect(texts.some((t) => t === 'Quote Terms')).toBe(true);
  });

  it('drops a leading standard heading ELEMENT in rich HTML (e.g. <h3>Payment Terms</h3>)', () => {
    const out = renderRecordTerms(
      engine({}),
      withRecordTerms([
        {
          title: { en: 'Invoice Terms' },
          body: '<div class="payment-terms"><h3>Payment Terms</h3><p>Net 30 from invoice date.</p></div>',
          format: 'html',
        },
      ]),
    );
    const texts: string[] = [];
    collectText(out, texts);
    expect(texts.some((t) => t.includes('Payment Terms'))).toBe(false);
    expect(texts.join('\n')).toContain('Net 30 from invoice date.');
    expect(texts.some((t) => t === 'Invoice Terms')).toBe(true);
  });

  it('keeps a leading line that is NOT a terms heading (real content)', () => {
    const out = renderRecordTerms(
      engine({}),
      withRecordTerms([
        { title: { en: 'Quote Terms' }, body: 'No Data – No Fee: You only pay if recovery is successful.\nPayment: 50% advance.' },
      ]),
    );
    const texts: string[] = [];
    collectText(out, texts);
    expect(texts.join('\n')).toContain('No Data – No Fee: You only pay if recovery is successful.');
  });

  it('does not render the bank box', () => {
    const out = renderRecordTerms(
      engine({}),
      { ...withRecordTerms([{ title: { en: 'Quote Terms' }, body: RECORD_TERMS }]), bank: BANK.bank } as unknown as EngineDocData,
    );
    const texts: string[] = [];
    collectText(out, texts);
    expect(texts.some((t) => t.includes('Future Space LLC'))).toBe(false);
  });
});

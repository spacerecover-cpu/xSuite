import { describe, it, expect } from 'vitest';
import { renderTerms } from './terms';
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

/** Document data carrying a bank block (terms content now comes from the config). */
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

const TERMS_EN = 'Valid 30 days. 50% advance to begin.';
const TERMS_AR = 'صالح لمدة ٣٠ يومًا. دفعة مقدمة ٥٠٪ للبدء.';

describe('renderTerms — per-document-type Terms & Conditions', () => {
  it('renders the template Terms (English) from the config', () => {
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

  it('renders the Notes block when set', () => {
    const out = renderTerms(
      engine({ termsContent: { notes: { en: 'Diagnostics are non-destructive.' } } }),
      NO_DATA,
    );
    const texts: string[] = [];
    collectText(out, texts);
    expect(texts.some((t) => t.includes('Diagnostics are non-destructive.'))).toBe(true);
  });

  it('returns null when there is no terms content and no inline bank', () => {
    expect(renderTerms(engine({}), NO_DATA)).toBeNull();
  });
});

describe('renderTerms — movable bank section coordination', () => {
  it('renders the bank box inline when the standalone bank section is hidden (default layout)', () => {
    const out = renderTerms(
      engine({
        termsContent: { terms: { en: TERMS_EN } },
        sections: [
          { key: 'terms', visible: true, order: 7 },
          { key: 'bank', visible: false, order: 8 },
        ],
      }),
      BANK,
    );
    const texts: string[] = [];
    collectText(out, texts);
    expect(texts.some((t) => t.includes('Future Space LLC'))).toBe(true);
  });

  it('omits the inline bank box when the standalone bank section is visible (no double-render)', () => {
    const out = renderTerms(
      engine({
        termsContent: { terms: { en: TERMS_EN } },
        sections: [
          { key: 'terms', visible: true, order: 7 },
          { key: 'bank', visible: true, order: 8 },
        ],
      }),
      BANK,
    );
    const texts: string[] = [];
    collectText(out, texts);
    expect(texts.some((t) => t.includes('Future Space LLC'))).toBe(false);
    // Terms still render — only the bank moved out.
    expect(texts.some((t) => t.includes(TERMS_EN))).toBe(true);
  });
});

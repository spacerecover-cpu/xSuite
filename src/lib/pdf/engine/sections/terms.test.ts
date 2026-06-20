import { describe, it, expect } from 'vitest';
import { renderTerms } from './terms';
import type { EngineContext, EngineDocData } from '../types';
import type { DocumentTemplateConfig, SectionConfig } from '../../templateConfig';

function collectText(node: unknown, out: string[]): void {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((c) => collectText(c, out));
  const o = node as Record<string, unknown>;
  if (typeof o.text === 'string') out.push(o.text);
  Object.values(o).forEach((v) => collectText(v, out));
}

const DATA = {
  terms: {
    title: { en: 'Terms & Conditions', ar: 'الشروط والأحكام' },
    blocks: [{ title: { en: 'Terms & Conditions', ar: 'الشروط والأحكام' }, body: '50% advance to start.' }],
  },
  bank: {
    title: { en: 'Bank Account', ar: 'تفاصيل البنك' },
    rows: [{ label: { en: 'Account Name:', ar: 'اسم الحساب:' }, value: 'Future Space LLC' }],
  },
} as unknown as EngineDocData;

function engineWithSections(
  sections: Pick<SectionConfig, 'key' | 'visible' | 'order'>[],
  language: { mode: string; primary: string } = { mode: 'en', primary: 'en' },
): EngineContext {
  return {
    config: { language, sections } as unknown as DocumentTemplateConfig,
  } as EngineContext;
}

const withStandardTerms = (standard: {
  standard_terms_en?: string;
  standard_terms_ar?: string;
}): EngineDocData => ({ ...DATA, identity: { legal_compliance: standard } } as unknown as EngineDocData);

const TERMS_ONLY = [{ key: 'terms', visible: true, order: 7 }];
const BILINGUAL = { mode: 'bilingual_sidebyside', primary: 'en' };

describe('renderTerms — movable bank section coordination', () => {
  it('renders the bank box inline when the standalone bank section is hidden (default layout)', () => {
    const out = renderTerms(
      engineWithSections([
        { key: 'terms', visible: true, order: 7 },
        { key: 'bank', visible: false, order: 8 },
      ]),
      DATA,
    );
    const texts: string[] = [];
    collectText(out, texts);
    expect(texts.some((t) => t.includes('Future Space LLC'))).toBe(true);
  });

  it('omits the inline bank box when the standalone bank section is visible (no double-render)', () => {
    const out = renderTerms(
      engineWithSections([
        { key: 'terms', visible: true, order: 7 },
        { key: 'bank', visible: true, order: 8 },
      ]),
      DATA,
    );
    const texts: string[] = [];
    collectText(out, texts);
    expect(texts.some((t) => t.includes('Future Space LLC'))).toBe(false);
    // Terms still render — only the bank moved out.
    expect(texts.some((t) => t.includes('50% advance to start.'))).toBe(true);
  });
});

describe('renderTerms — tenant standard Terms & Conditions', () => {
  const STANDARD_EN = 'All recovery work is best-effort; no data is guaranteed.';
  const STANDARD_AR = 'جميع أعمال الاسترداد تتم ببذل أقصى جهد؛ دون أي ضمان للبيانات.';

  it('renders the tenant standard English T&C, taking precedence over per-document terms', () => {
    const out = renderTerms(
      engineWithSections(TERMS_ONLY),
      withStandardTerms({ standard_terms_en: STANDARD_EN, standard_terms_ar: STANDARD_AR }),
    );
    const texts: string[] = [];
    collectText(out, texts);
    expect(texts.some((t) => t.includes(STANDARD_EN))).toBe(true);
    // The standard replaces the per-document block body entirely.
    expect(texts.some((t) => t.includes('50% advance to start.'))).toBe(false);
  });

  it('shows both the English and Arabic standard on a bilingual document', () => {
    const out = renderTerms(
      engineWithSections(TERMS_ONLY, BILINGUAL),
      withStandardTerms({ standard_terms_en: STANDARD_EN, standard_terms_ar: STANDARD_AR }),
    );
    const texts: string[] = [];
    collectText(out, texts);
    expect(texts.some((t) => t.includes(STANDARD_EN))).toBe(true);
    expect(texts.some((t) => t.includes(STANDARD_AR))).toBe(true);
  });

  it('omits the Arabic standard on an English-only document', () => {
    const out = renderTerms(
      engineWithSections(TERMS_ONLY),
      withStandardTerms({ standard_terms_en: STANDARD_EN, standard_terms_ar: STANDARD_AR }),
    );
    const texts: string[] = [];
    collectText(out, texts);
    expect(texts.some((t) => t.includes(STANDARD_EN))).toBe(true);
    expect(texts.some((t) => t.includes(STANDARD_AR))).toBe(false);
  });

  it('falls back to per-document terms when no tenant standard is configured', () => {
    const out = renderTerms(engineWithSections(TERMS_ONLY), withStandardTerms({}));
    const texts: string[] = [];
    collectText(out, texts);
    expect(texts.some((t) => t.includes('50% advance to start.'))).toBe(true);
  });
});

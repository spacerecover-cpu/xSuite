import { describe, it, expect } from 'vitest';
import {
  BUILT_IN_TEMPLATE_CONFIGS,
  resolveTemplateConfig,
  resolveSecondary,
  secondaryText,
  type DocumentTemplateConfig,
  type LabelText,
  type LanguageConfig,
} from '../templateConfig';
import { ctxFromLanguageConfig } from '../translationContext';
import { renderTemplate } from './renderTemplate';
import { renderTerms } from './sections/terms';
import type { EngineContext, EngineDocData } from './types';

// ---------------------------------------------------------------------------
// 13-language generalization (additive). These tests assert the new resolvers
// generalize EN+Arabic to any of the 13 secondary languages while keeping the
// legacy `{en, ar}` / `mode:'ar'` shapes byte-identical. All inputs synthetic.
// ---------------------------------------------------------------------------

describe('secondaryText', () => {
  it('returns the legacy `.ar` string for Arabic (back-compat)', () => {
    const label: LabelText = { en: 'Total', ar: 'الإجمالي' };
    expect(secondaryText(label, 'ar')).toBe('الإجمالي');
  });

  it('returns the new i18n entry for a non-Arabic secondary', () => {
    const label: LabelText = { en: 'Total', i18n: { fr: 'Totale' } };
    expect(secondaryText(label, 'fr')).toBe('Totale');
  });

  it('prefers i18n.ar over legacy .ar when both present', () => {
    const label: LabelText = { en: 'Total', ar: 'قديم', i18n: { ar: 'جديد' } };
    expect(secondaryText(label, 'ar')).toBe('جديد');
  });

  it('returns undefined when the secondary is null or the Arabic is unknown', () => {
    expect(secondaryText({ en: 'Total', ar: 'الإجمالي' }, null)).toBeUndefined();
    // An Arabic string absent from the central table cannot be joined → undefined.
    expect(secondaryText({ en: 'Zilch', ar: 'سلسلةغيرموجودةنهائيا' }, 'fr')).toBeUndefined();
    expect(secondaryText(undefined, 'ar')).toBeUndefined();
  });

  it('joins a legacy {en,ar} label to the central table for a non-Arabic secondary', () => {
    // Financial-adapter labels carry only Arabic; the reverse Arabic→key join lets
    // them translate into any of the 13 (here 'الإجمالي' → key `total` → French),
    // which is what makes invoice/quote/receipt render bilingually, not just Arabic.
    expect(secondaryText({ en: 'Total:', ar: 'الإجمالي' }, 'fr')).toBeTruthy();
    expect(secondaryText({ en: 'Total:', ar: 'الإجمالي' }, 'ar')).toBe('الإجمالي');
  });
});

describe('resolveSecondary', () => {
  it('legacy mode:"ar" → "ar"', () => {
    expect(resolveSecondary({ mode: 'ar', primary: 'ar' })).toBe('ar');
  });

  it('legacy bilingual mode with no secondary → "ar"', () => {
    expect(resolveSecondary({ mode: 'bilingual_stacked', primary: 'en' })).toBe('ar');
    expect(resolveSecondary({ mode: 'bilingual_sidebyside', primary: 'ar' })).toBe('ar');
  });

  it('legacy primary:"ar" → "ar"', () => {
    // A defensive legacy shape: bilingual primary ar implies Arabic secondary.
    expect(resolveSecondary({ mode: 'bilingual_stacked', primary: 'ar' })).toBe('ar');
  });

  it('explicit secondary wins (fr)', () => {
    expect(resolveSecondary({ mode: 'bilingual_stacked', primary: 'en', secondary: 'fr' })).toBe('fr');
  });

  it('english-only → null', () => {
    expect(resolveSecondary({ mode: 'en', primary: 'en' })).toBeNull();
  });
});

describe('ctxFromLanguageConfig', () => {
  it('english-only → not bilingual, ltr, t() returns English unchanged', () => {
    const ctx = ctxFromLanguageConfig({ mode: 'en', primary: 'en' });
    expect(ctx.isBilingual).toBe(false);
    expect(ctx.isRTL).toBe(false);
    expect(ctx.languageCode).toBeNull();
    expect(ctx.t('total', 'Total')).toBe('Total');
  });

  it('secondary fr → bilingual, ltr, t() combines EN | French', () => {
    const ctx = ctxFromLanguageConfig({ mode: 'bilingual_stacked', primary: 'en', secondary: 'fr' });
    expect(ctx.isBilingual).toBe(true);
    expect(ctx.isRTL).toBe(false);
    expect(ctx.languageCode).toBe('fr');
    // `total` → 'Total' (fr) in DOCUMENT_TRANSLATIONS.
    expect(ctx.t('total', 'Total')).toBe('Total | Total');
    expect(ctx.t('subtotal', 'Subtotal')).toBe('Subtotal | Sous-total');
  });

  it('secondary ar → bilingual, rtl', () => {
    const ctx = ctxFromLanguageConfig({ mode: 'bilingual_stacked', primary: 'ar', secondary: 'ar' });
    expect(ctx.isBilingual).toBe(true);
    expect(ctx.isRTL).toBe(true);
    expect(ctx.languageCode).toBe('ar');
  });

  it('legacy bilingual config (no secondary) behaves as Arabic', () => {
    const ctx = ctxFromLanguageConfig({ mode: 'bilingual_stacked', primary: 'ar' });
    expect(ctx.isBilingual).toBe(true);
    expect(ctx.isRTL).toBe(true);
    expect(ctx.languageCode).toBe('ar');
  });
});

// ---------------------------------------------------------------------------
// Render path: a non-Arabic bilingual config surfaces EN + the French label.
// ---------------------------------------------------------------------------

function frData(): EngineDocData {
  return {
    documentTitle: { en: 'TAX INVOICE', i18n: { fr: 'Facture Fiscale' } },
    identity: { basic_info: { company_name: 'Acme Data Recovery' } },
    parties: {
      to: {
        title: { en: 'Customer Information', i18n: { fr: 'Informations Client' } },
        name: 'Jane Client',
        rows: [{ label: { en: 'Phone:', i18n: { fr: 'Téléphone :' } }, value: '+33 1 23 45' }],
      },
    },
    meta: [{ label: { en: 'Invoice No:', i18n: { fr: 'N° Facture :' } }, value: 'INVO-0042' }],
    totals: [
      { label: { en: 'Total:', i18n: { fr: 'Totale :' } }, value: '1050.000 OMR', emphasis: true },
    ],
  } as EngineDocData;
}

function collectText(node: unknown, out: string[]): void {
  if (node == null) return;
  if (typeof node === 'string') { out.push(node); return; }
  if (Array.isArray(node)) { node.forEach((c) => collectText(c, out)); return; }
  if (typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if ('text' in o) collectText(o.text, out);
    for (const k of Object.keys(o)) { if (k !== 'text') collectText(o[k], out); }
  }
}

describe('renderTemplate — non-Arabic (French) bilingual secondary', () => {
  it('renders the French label alongside English for a {bilingual_stacked, secondary:fr} config', () => {
    const config: DocumentTemplateConfig = resolveTemplateConfig(
      BUILT_IN_TEMPLATE_CONFIGS.invoice,
      undefined,
      { language: { mode: 'bilingual_stacked', primary: 'en', secondary: 'fr' } as LanguageConfig },
    );
    const ctx = ctxFromLanguageConfig(config.language);
    const def = renderTemplate(config, frData(), ctx, null, null);
    const texts: string[] = [];
    collectText(def.content, texts);
    // The customer-box title carries the French translation alongside English.
    expect(texts.some((t) => t.includes('Informations Client'))).toBe(true);
    expect(texts.some((t) => t.includes('Customer Information'))).toBe(true);
    // No Arabic glyphs leak into a French document.
    expect(texts.some((t) => /[؀-ۿ]/.test(t))).toBe(false);
  });

  it('selects an LTR (non-Tajawal) default font for a French secondary', () => {
    const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, {
      language: { mode: 'bilingual_stacked', primary: 'en', secondary: 'fr' } as LanguageConfig,
    });
    const ctx = ctxFromLanguageConfig(config.language);
    const def = renderTemplate(config, frData(), ctx, null, null);
    const defaultStyle = def.defaultStyle as { font?: string; alignment?: string };
    expect(defaultStyle.font).not.toBe('Tajawal');
    expect(defaultStyle.alignment).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Terms & Conditions (TermsBodyText) — generalized body i18n + legacy compat.
// ---------------------------------------------------------------------------

function termsEngine(language: LanguageConfig, termsContent: DocumentTemplateConfig['termsContent']): EngineContext {
  const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, {
    language,
    termsContent,
  });
  return { config, ctx: ctxFromLanguageConfig(config.language) } as EngineContext;
}

describe('renderTerms — generalized TermsContentConfig body', () => {
  it('renders the French secondary body from i18n alongside the English body', () => {
    const engine = termsEngine(
      { mode: 'bilingual_stacked', primary: 'en', secondary: 'fr' },
      { terms: { en: 'Valid for 30 days.', i18n: { fr: 'Valable 30 jours.' } } },
    );
    const node = renderTerms(engine, {} as EngineDocData);
    const texts: string[] = [];
    collectText(node, texts);
    expect(texts.some((t) => t.includes('Valid for 30 days.'))).toBe(true);
    expect(texts.some((t) => t.includes('Valable 30 jours.'))).toBe(true);
  });

  it('still renders a legacy {en, ar} body for an Arabic secondary (back-compat)', () => {
    const engine = termsEngine(
      { mode: 'bilingual_stacked', primary: 'ar', secondary: 'ar' },
      { terms: { en: 'Valid for 30 days.', ar: 'صالح لمدة 30 يومًا.' } },
    );
    const node = renderTerms(engine, {} as EngineDocData);
    const texts: string[] = [];
    collectText(node, texts);
    expect(texts.some((t) => t.includes('Valid for 30 days.'))).toBe(true);
    expect(texts.some((t) => t.includes('صالح لمدة 30 يومًا.'))).toBe(true);
  });

  it('omits the secondary column for an English-only document', () => {
    const engine = termsEngine(
      { mode: 'en', primary: 'en' },
      { terms: { en: 'Valid for 30 days.', i18n: { fr: 'Valable 30 jours.' } } },
    );
    const node = renderTerms(engine, {} as EngineDocData);
    const texts: string[] = [];
    collectText(node, texts);
    expect(texts.some((t) => t.includes('Valid for 30 days.'))).toBe(true);
    expect(texts.some((t) => t.includes('Valable 30 jours.'))).toBe(false);
  });
});

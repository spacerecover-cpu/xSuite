import { describe, it, expect } from 'vitest';
import { applyTenantLanguage } from './applyTenantLanguage';
import { renderTemplate } from './renderTemplate';
import type { EngineDocData } from './types';
import type { CompanySettingsData, TranslationContext } from '../types';
import {
  BUILT_IN_TEMPLATE_CONFIGS,
  resolveTemplateConfig,
  type DocumentTemplateConfig,
} from '../templateConfig';
import { engineLayoutDirection } from './rtl';

/** Walk a pdfmake doc-definition collecting every `text` string run. */
function collectText(node: unknown, out: string[]): void {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((c) => collectText(c, out));
  const o = node as Record<string, unknown>;
  if (typeof o.text === 'string') out.push(o.text);
  Object.values(o).forEach((v) => collectText(v, out));
}

// ---------------------------------------------------------------------------
// applyTenantLanguage bridges the tenant's `document_language_settings`
// (english_only | bilingual + secondary_language) into the engine's
// `config.language`, which is the ONE field the engine reads to decide
// EN vs AR and LTR vs RTL. These tests assert the mapping is non-mutating and
// mirrors the legacy `createTranslationContext` semantics: bilingual + an RTL
// secondary (Arabic) ⇒ Arabic leads (RTL); bilingual + a non-RTL secondary ⇒
// English leads with the secondary alongside (still LTR); english_only ⇒ 'en'.
// All inputs are synthetic.
// ---------------------------------------------------------------------------

function settings(
  ls: CompanySettingsData['localization'] extends infer L
    ? L extends { document_language_settings?: infer D }
      ? D | undefined
      : never
    : never,
): CompanySettingsData {
  return {
    basic_info: { company_name: 'Acme Data Recovery' },
    ...(ls ? { localization: { document_language_settings: ls } } : {}),
  } as CompanySettingsData;
}

const baseConfig = (): DocumentTemplateConfig =>
  resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice);

describe('applyTenantLanguage', () => {
  it('maps english_only → single English language (en / primary en)', () => {
    const cfg = baseConfig();
    const out = applyTenantLanguage(cfg, settings({
      mode: 'english_only',
      secondary_language: null,
      language_name: null,
    }));
    expect(out.language.mode).toBe('en');
    expect(out.language.primary).toBe('en');
    expect(engineLayoutDirection(out.language)).toBe('ltr');
  });

  it('treats missing localization as english_only', () => {
    const cfg = baseConfig();
    const out = applyTenantLanguage(cfg, settings(undefined));
    expect(out.language.mode).toBe('en');
    expect(out.language.primary).toBe('en');
  });

  it('treats bilingual with no secondary_language as english_only (mirrors legacy isBilingual gate)', () => {
    const cfg = baseConfig();
    const out = applyTenantLanguage(cfg, settings({
      mode: 'bilingual',
      secondary_language: null,
      language_name: null,
    }));
    expect(out.language.mode).toBe('en');
    expect(out.language.primary).toBe('en');
  });

  it('maps bilingual + Arabic secondary → bilingual_stacked, English primary (LTR; English leads, Arabic alongside)', () => {
    const cfg = baseConfig();
    const out = applyTenantLanguage(cfg, settings({
      mode: 'bilingual',
      secondary_language: 'ar',
      language_name: 'Arabic',
    }));
    expect(out.language.mode).toBe('bilingual_stacked');
    expect(out.language.primary).toBe('en');
    expect(out.language.secondary).toBe('ar');
    // Bilingual is English-led, so the document stays LTR (the renderer still
    // shapes the Arabic within its own runs).
    expect(engineLayoutDirection(out.language)).toBe('ltr');
  });

  it('normalizes a stale saved bilingual config with primary=ar back to English-lead', () => {
    const cfg: DocumentTemplateConfig = {
      ...baseConfig(),
      language: { mode: 'bilingual_sidebyside', primary: 'ar', secondary: 'ar' },
    };
    const out = applyTenantLanguage(cfg, settings(undefined));
    expect(out.language.mode).toBe('bilingual_sidebyside');
    expect(out.language.primary).toBe('en'); // coerced — picker only exposes "English | Arabic"
    expect(out.language.secondary).toBe('ar');
    expect(engineLayoutDirection(out.language)).toBe('ltr');
  });

  it('maps bilingual + non-RTL secondary (e.g. French) → bilingual_stacked, English primary (LTR)', () => {
    const cfg = baseConfig();
    const out = applyTenantLanguage(cfg, settings({
      mode: 'bilingual',
      secondary_language: 'fr',
      language_name: 'French',
    }));
    expect(out.language.mode).toBe('bilingual_stacked');
    expect(out.language.primary).toBe('en');
    expect(engineLayoutDirection(out.language)).toBe('ltr');
  });

  it('is non-mutating — returns a fresh config and leaves the input language untouched', () => {
    const cfg = baseConfig();
    const before = { ...cfg.language };
    const out = applyTenantLanguage(cfg, settings({
      mode: 'bilingual',
      secondary_language: 'ar',
      language_name: 'Arabic',
    }));
    expect(out).not.toBe(cfg);
    expect(cfg.language).toEqual(before); // input language object unchanged
    // Other config slices are carried through (same section/label content).
    expect(out.sections).toEqual(cfg.sections);
    expect(out.labels).toEqual(cfg.labels);
  });

  it('keeps an explicit Studio language (bilingual side-by-side) even when the tenant Localization is english_only', () => {
    const cfg: DocumentTemplateConfig = {
      ...baseConfig(),
      language: { mode: 'bilingual_sidebyside', primary: 'en' },
    };
    const out = applyTenantLanguage(cfg, settings({
      mode: 'english_only',
      secondary_language: null,
      language_name: null,
    }));
    expect(out.language.mode).toBe('bilingual_sidebyside');
    expect(out.language.primary).toBe('en');
  });

  it('keeps an explicit Arabic-only Studio language regardless of tenant settings', () => {
    const cfg: DocumentTemplateConfig = {
      ...baseConfig(),
      language: { mode: 'ar', primary: 'ar' },
    };
    const out = applyTenantLanguage(cfg, settings(undefined));
    expect(out.language.mode).toBe('ar');
    expect(out.language.primary).toBe('ar');
  });

  it('falls back to the tenant Localization when the template is at the English default', () => {
    // baseConfig()'s language is the built-in { mode: 'en' } default, so the
    // tenant-wide setting still governs — preserving back-compat for tenants who
    // configure language in Settings, not the Studio picker. Bilingual leads with
    // English regardless of the secondary's script.
    const out = applyTenantLanguage(baseConfig(), settings({
      mode: 'bilingual',
      secondary_language: 'ar',
      language_name: 'Arabic',
    }));
    expect(out.language.mode).toBe('bilingual_stacked');
    expect(out.language.primary).toBe('en');
  });

  it('an EXPLICIT "English Only" template overrides a bilingual tenant default', () => {
    // The template's English-only is indistinguishable from the built-in default
    // by value, so `languageExplicit` carries the user's intent: it must win over
    // the tenant's bilingual setting (the per-template picker overrides the workspace).
    const englishCfg = baseConfig(); // { mode: 'en', primary: 'en' }
    const tenant = settings({ mode: 'bilingual', secondary_language: 'it', language_name: 'Italian' });
    expect(applyTenantLanguage(englishCfg, tenant, /* explicit */ true).language.mode).toBe('en');
    // …but without the explicit flag (unconfigured template) it still falls back.
    expect(applyTenantLanguage(englishCfg, tenant, /* explicit */ false).language.mode).toBe('bilingual_stacked');
  });
});

// ---------------------------------------------------------------------------
// End-to-end: the resolved config produced by applyTenantLanguage drives
// renderTemplate's document direction. This is the "build path" proof — without
// applyTenantLanguage the engine would stay English-only/LTR for a bilingual
// Arabic tenant; with it, the document flips to RTL.
// ---------------------------------------------------------------------------

const ctx: TranslationContext = {
  t: (_key: string, englishText: string) => englishText,
  isRTL: true,
  isBilingual: true,
  languageCode: 'ar',
  fontFamily: 'Roboto',
};

function minimalData(): EngineDocData {
  return {
    documentTitle: { en: 'TAX INVOICE', ar: 'فاتورة ضريبية' },
    identity: {
      basic_info: { company_name: 'Acme Data Recovery' },
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
    totals: [
      { label: { en: 'Total:', ar: 'الإجمالي:' }, value: '1050.000 OMR', emphasis: true },
    ],
  } as EngineDocData;
}

describe('applyTenantLanguage → renderTemplate (build path)', () => {
  it('a bilingual-Arabic tenant produces an English-led LTR document with the Arabic-capable font', () => {
    const cfg = applyTenantLanguage(baseConfig(), settings({
      mode: 'bilingual',
      secondary_language: 'ar',
      language_name: 'Arabic',
    }));
    const doc = renderTemplate(cfg, minimalData(), ctx);
    const defaultStyle = doc.defaultStyle as { font?: string; alignment?: string };
    // English leads → LTR (no right-alignment override), but the Arabic-capable
    // font is still selected so the Arabic secondary shapes.
    expect(defaultStyle.alignment).toBeUndefined();
    expect(defaultStyle.font).toBe('Tajawal');
  });

  it('an english_only tenant produces an LTR document (no right alignment override)', () => {
    const cfg = applyTenantLanguage(baseConfig(), settings({
      mode: 'english_only',
      secondary_language: null,
      language_name: null,
    }));
    const doc = renderTemplate(cfg, minimalData(), ctx);
    const defaultStyle = doc.defaultStyle as { font?: string; alignment?: string };
    expect(defaultStyle.alignment).toBeUndefined();
  });

  it('regression: an explicit bilingual_sidebyside picker survives an english_only tenant and renders Arabic (was clobbered to English)', () => {
    const cfg: DocumentTemplateConfig = {
      ...baseConfig(),
      language: { mode: 'bilingual_sidebyside', primary: 'en' },
    };
    const applied = applyTenantLanguage(cfg, settings({
      mode: 'english_only',
      secondary_language: null,
      language_name: null,
    }));
    expect(applied.language.mode).toBe('bilingual_sidebyside');

    const doc = renderTemplate(applied, minimalData(), ctx);
    // The Arabic-capable font is selected for any non-'en' mode (rtl.ts), and
    // Arabic system-label text is present — neither happens if the tenant
    // override collapses the document back to English.
    expect((doc.defaultStyle as { font?: string }).font).toBe('Tajawal');
    const texts: string[] = [];
    collectText(doc, texts);
    expect(texts.some((t) => /[؀-ۿ]/.test(t))).toBe(true);
  });
});

/**
 * applyTenantLanguage — the bridge that makes the engine bilingual/RTL actually
 * activate for a tenant.
 *
 * The template engine derives EVERYTHING about language and reading direction
 * from a single field: `DocumentTemplateConfig.language` (see `engine/rtl.ts`).
 * The built-in defaults ship that field as English-only (`{ mode: 'en',
 * primary: 'en' }`), so a freshly-resolved config is always English/LTR — even
 * for a tenant whose Settings → Localization is configured for bilingual Arabic
 * output. The legacy (hand-written) builders never had this problem because
 * they read `companySettings.localization.document_language_settings` directly
 * and built a {@link TranslationContext} from it (`createTranslationContext`).
 *
 * This helper closes that gap WITHOUT changing the engine: given a resolved
 * config and the tenant's `companySettings`, it returns a NEW config whose
 * `language` mirrors the tenant's document-language setting, mirroring the
 * legacy `createTranslationContext` semantics:
 *
 *   - `mode: 'english_only'` (or missing settings)        → `{ mode: 'en',  primary: 'en' }`
 *   - `mode: 'bilingual'` with no `secondary_language`     → `{ mode: 'en',  primary: 'en' }`
 *       (legacy gates bilingual on `languageCode !== null`; an empty secondary
 *        language is English-only, so we keep the document English-only too)
 *   - `mode: 'bilingual'` + RTL secondary (Arabic 'ar')    → `{ mode: 'bilingual_stacked', primary: 'ar' }`
 *       (Arabic leads ⇒ the document flows right-to-left, exactly as the legacy
 *        path's `isRTL` drove `formatBilingualText`/font selection)
 *   - `mode: 'bilingual'` + non-RTL secondary (fr/de/…)    → `{ mode: 'bilingual_stacked', primary: 'en' }`
 *       (English keeps the lead; the secondary language renders alongside, LTR)
 *
 * Called inside EVERY `build*ViaEngine` helper AFTER `resolveTemplateConfig` and
 * BEFORE `renderTemplate`, so the engine sees the tenant's language. Pure and
 * non-mutating: the input config and its `language` object are left untouched;
 * a fresh config (with a fresh `language`) is returned.
 */

import { isRTLLanguage } from '../../locale';
import type { LanguageCode } from '../../documentTranslations';
import type { CompanySettingsData } from '../types';
import type { DocumentTemplateConfig, LanguageConfig } from '../templateConfig';

/** The default bilingual layout mode when a tenant opts into bilingual output. */
const DEFAULT_BILINGUAL_MODE = 'bilingual_stacked' as const;

const ENGLISH_ONLY_LANGUAGE: LanguageConfig = { mode: 'en', primary: 'en' };

/**
 * Derive the engine {@link LanguageConfig} from a tenant's
 * `document_language_settings`. Exported for direct unit testing; most callers
 * use {@link applyTenantLanguage}.
 */
export function resolveTenantLanguageConfig(
  companySettings: CompanySettingsData,
): LanguageConfig {
  const settings = companySettings.localization?.document_language_settings;
  const secondary = settings?.secondary_language ?? null;

  // Bilingual only when the tenant chose bilingual AND a secondary language is
  // set — this mirrors the legacy `isBilingual = mode === 'bilingual' &&
  // languageCode !== null` gate so the engine matches the old behavior exactly.
  if (settings?.mode !== 'bilingual' || !secondary) {
    return { ...ENGLISH_ONLY_LANGUAGE };
  }

  // Arabic (or any future RTL secondary) leads → RTL document. A non-RTL
  // secondary (French, German, …) keeps English in the lead, secondary alongside.
  // Carry the chosen secondary (any of the 13) on the config so the render path
  // resolves the correct language; `primary: 'ar'` (legacy "secondary leads")
  // only when that secondary is actually RTL.
  const rtl = isRTLLanguage(secondary);
  const primary: LanguageConfig['primary'] = rtl ? 'ar' : 'en';
  return { mode: DEFAULT_BILINGUAL_MODE, primary, secondary: secondary as LanguageCode };
}

/**
 * Resolve the document's `language`, giving the per-template language (the
 * Settings → Documents Studio "Document language" picker) precedence over the
 * tenant-wide Settings → Localization default.
 *
 * PRECEDENCE: the Studio picker is authoritative once it selects a non-default —
 * i.e. non-English-only — document language. The picker can express
 * `bilingual_sidebyside` and Arabic-lead, neither of which the tenant setting can
 * represent, so it must NOT be clobbered. Only when the template is still at the
 * built-in English default (`mode: 'en'`) do we fall back to the tenant-wide
 * setting — preserving the legacy behavior for tenants who configure language in
 * Settings → Localization rather than the Studio.
 *
 * Non-mutating: when the template wins we return it unchanged; otherwise a fresh
 * config with a fresh `language`. This is the ONE call every render path
 * (preview + every `build*ViaEngine`) funnels through, so the precedence holds
 * uniformly across the live preview and the generated PDF.
 */
export function applyTenantLanguage(
  config: DocumentTemplateConfig,
  companySettings: CompanySettingsData,
): DocumentTemplateConfig {
  if (config.language && config.language.mode !== 'en') {
    return config;
  }
  return {
    ...config,
    language: resolveTenantLanguageConfig(companySettings),
  };
}

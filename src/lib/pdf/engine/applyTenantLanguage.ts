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

  // Bilingual ALWAYS leads with English — the document shows "English | secondary"
  // regardless of the secondary's script. An RTL secondary (Arabic) renders
  // alongside English in the SAME English-led, left-to-right layout (the renderer
  // still shapes/bidi-orders the Arabic within its own run); the document never
  // flips to RTL just because the secondary is Arabic. (Genuinely Arabic-primary
  // documents use the single-secondary 'ar' mode, not bilingual.)
  return { mode: DEFAULT_BILINGUAL_MODE, primary: 'en', secondary: secondary as LanguageCode };
}

/**
 * Coerce a bilingual config to English-lead. The Studio picker exposes only
 * "English | <secondary>" bilingual layouts (never a secondary-lead bilingual),
 * so a `primary: 'ar'` on a bilingual mode can only come from a stale saved config
 * or the legacy tenant mapping. Left uncorrected it makes the title, column
 * headers, totals, and "System labels only" field labels render secondary-FIRST —
 * diverging from every other language combination. The single-secondary `'ar'`
 * (secondary-only) mode is intentionally left untouched.
 */
function normalizeBilingualLead(language: LanguageConfig): LanguageConfig {
  if (
    (language.mode === 'bilingual_sidebyside' || language.mode === 'bilingual_stacked') &&
    language.primary === 'ar'
  ) {
    return { ...language, primary: 'en' };
  }
  return language;
}

/**
 * Resolve the document's `language`, giving the per-template language (the
 * Settings → Documents Studio "Document language" picker) precedence over the
 * tenant-wide Settings → Localization default.
 *
 * PRECEDENCE: the Studio picker is authoritative once it selects a non-default —
 * i.e. non-English-only — document language. The picker can express
 * `bilingual_sidebyside` / `bilingual_stacked`, which the tenant setting cannot,
 * so it must NOT be clobbered. Only when the template is still at the built-in
 * English default (`mode: 'en'`) do we fall back to the tenant-wide setting —
 * preserving the legacy behavior for tenants who configure language in
 * Settings → Localization rather than the Studio.
 *
 * In BOTH cases the final language is run through {@link normalizeBilingualLead}
 * so a bilingual layout always leads with English — correcting stale saved configs
 * (or the legacy tenant mapping) that carry `primary: 'ar'`, which otherwise make
 * the title/headers/totals/field labels render secondary-first.
 *
 * Non-mutating: when the template wins AND is already normalized we return it
 * unchanged; otherwise a fresh config with a fresh `language`. This is the ONE
 * call every render path (preview + every `build*ViaEngine`) funnels through, so
 * the precedence + normalization hold uniformly across preview and generated PDF.
 */
export function applyTenantLanguage(
  config: DocumentTemplateConfig,
  companySettings: CompanySettingsData,
  languageExplicit = false,
): DocumentTemplateConfig {
  // The template language wins when it is a non-English layout OR was explicitly
  // configured (`languageExplicit`) — the latter lets a per-template "English Only"
  // choice override a bilingual tenant default, which a bare `mode: 'en'` cannot
  // express (it is indistinguishable from an unconfigured template). Only an
  // unconfigured template (`mode: 'en'` AND not explicit) falls back to the tenant.
  const templateWins = languageExplicit || (config.language && config.language.mode !== 'en');
  const resolved = templateWins ? config.language : resolveTenantLanguageConfig(companySettings);
  const language = normalizeBilingualLead(resolved);
  if (language === config.language) return config;
  return { ...config, language };
}

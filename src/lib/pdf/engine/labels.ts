/**
 * Language-mode label resolution for the engine.
 *
 * Centralizes the "EN vs AR vs EN | AR" decision so every section renderer
 * spells it the same way. This is the fix for the known null-Arabic-title bug:
 * the engine always reads the ACTUAL Arabic string from `config.labels` /
 * `LabelText.ar` instead of passing `null` into the bilingual style helpers.
 */

import { resolveSecondary, secondaryText, type LanguageConfig, type TranslationPolicyConfig } from '../templateConfig';
import { reverseArabicText } from '../fonts';
import { isRTLLanguage } from '../../documentTranslations';
import type { LabelText } from './types';

/** True when the document shows both languages (stacked or side-by-side). */
export function isBilingualMode(language: LanguageConfig): boolean {
  return language.mode === 'bilingual_stacked' || language.mode === 'bilingual_sidebyside';
}

/**
 * True when the secondary language LEADS (drives RTL alignment when that
 * secondary is RTL). The legacy name reflects that the secondary was always
 * Arabic; the predicate is now general (it tests the leading SLOT, not Arabic).
 */
export function isArabicLead(language: LanguageConfig): boolean {
  return language.mode === 'ar' || (isBilingualMode(language) && language.primary === 'ar');
}

/**
 * The English text for a label, with a non-empty fallback so a renderer never
 * emits an empty cell.
 */
export function en(label: LabelText, fallback = ''): string {
  return label.en || fallback;
}

/**
 * The SECONDARY-language text for a label, or `null` when absent. Renderers pass
 * this straight into `createBilingual*` helpers — the whole point of the engine
 * is that this is the *real* secondary string from config, never a hardcoded
 * null.
 *
 * Generalized from Arabic-only: pass the document `language` so the correct
 * secondary (any of the 13) is resolved via {@link secondaryText}. The
 * `language`-less overload is kept for back-compat — it returns the legacy
 * `label.ar`, byte-identical to before — so any caller not yet threading
 * `language` still works for Arabic.
 */
export function ar(label: LabelText, language?: LanguageConfig): string | null {
  if (language) {
    const code = resolveSecondary(language);
    const s = secondaryText(label, code) ?? null;
    // pdfmake has no bidi pass, so a multi-word RTL secondary (Arabic) in a header
    // band renders with reversed words / collapsed spaces ('معلومات العميل' →
    // 'العميلمعلومات'). Reverse the word order for RTL so pdfmake's LTR layout
    // reads correctly; reverseArabicText no-ops on non-Arabic (Korean/Thai/Latin).
    return s && code && isRTLLanguage(code) ? reverseArabicText(s) : s;
  }
  return label.ar ?? null;
}

/**
 * Resolve a label to the single display string for the given language mode:
 * - `ar`                    → Arabic (falls back to English when no Arabic supplied)
 * - `en`                    → English
 * - `bilingual_sidebyside`  → "EN | AR" on one line, primary leading
 * - `bilingual_stacked`     → "EN" then "AR" on a second line (newline-separated),
 *                             primary leading
 * English only when no Arabic string exists.
 *
 * The two bilingual modes deliberately render DIFFERENTLY (inline vs stacked) so
 * the document-language picker is meaningful. Use this for inline strings (titles,
 * totals labels). For section/info-box headers that have dedicated bilingual
 * helpers, prefer passing `en()`/`ar()` separately so the helper can right-align
 * the Arabic column.
 */
export type TranslationGroup =
  | 'parties' | 'meta' | 'caseInfo' | 'collector' | 'payslip' | 'diagnostics' | 'paymentHistory';

/** Whether a data block's FIELD-ROW labels render bilingually under the policy. */
export function fieldLabelsBilingual(
  policy: TranslationPolicyConfig | undefined,
  group: TranslationGroup,
): boolean {
  if (!policy || !policy.mode || policy.mode === 'all') return true;
  if (policy.mode === 'system_only') return false;
  return policy.groups?.[group] ?? true; // custom
}

/**
 * The LanguageConfig a data block should use for its FIELD-ROW labels: the full
 * (bilingual) config when the group is translated, else a primary-only config so
 * the field labels render in a single language. Box TITLES keep the full config.
 */
export function fieldLabelLanguage(
  language: LanguageConfig,
  policy: TranslationPolicyConfig | undefined,
  group: TranslationGroup,
): LanguageConfig {
  if (!isBilingualMode(language) || fieldLabelsBilingual(policy, group)) return language;
  // Collapse to a single-language config for the field rows. Carry an EXPLICIT
  // non-default `secondary` so a secondary-leading ('ar' mode) collapse still
  // renders the correct secondary (any of the 13); a legacy config with no
  // explicit secondary collapses to the byte-identical `{ mode, primary }`.
  if (language.primary === 'ar') {
    return language.secondary
      ? { mode: 'ar', primary: 'ar', secondary: language.secondary }
      : { mode: 'ar', primary: 'ar' };
  }
  return { mode: 'en', primary: 'en' };
}

export function resolveLabel(label: LabelText, language: LanguageConfig): string {
  const english = label.en ?? '';
  const secondary = secondaryText(label, resolveSecondary(language)) ?? null;

  if (language.mode === 'ar') return secondary ?? english;
  if (language.mode === 'en') return english;

  // Bilingual: join both, primary first. Degrade gracefully if one side is
  // missing. Stacked uses a newline; side-by-side uses an inline separator.
  if (!secondary) return english;
  if (!english) return secondary;
  const separator = language.mode === 'bilingual_stacked' ? '\n' : ' | ';
  return language.primary === 'ar'
    ? `${secondary}${separator}${english}`
    : `${english}${separator}${secondary}`;
}

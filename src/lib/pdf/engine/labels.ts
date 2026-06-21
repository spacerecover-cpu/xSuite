/**
 * Language-mode label resolution for the engine.
 *
 * Centralizes the "EN vs AR vs EN | AR" decision so every section renderer
 * spells it the same way. This is the fix for the known null-Arabic-title bug:
 * the engine always reads the ACTUAL Arabic string from `config.labels` /
 * `LabelText.ar` instead of passing `null` into the bilingual style helpers.
 */

import type { LanguageConfig, TranslationPolicyConfig } from '../templateConfig';
import type { LabelText } from './types';

/** True when the document shows both languages (stacked or side-by-side). */
export function isBilingualMode(language: LanguageConfig): boolean {
  return language.mode === 'bilingual_stacked' || language.mode === 'bilingual_sidebyside';
}

/** True when the leading/only language is Arabic (drives RTL alignment). */
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
 * The Arabic text for a label, or `null` when absent. Renderers pass this
 * straight into `createBilingual*` helpers — the whole point of the engine is
 * that this is the *real* Arabic string from config, never a hardcoded null.
 */
export function ar(label: LabelText): string | null {
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
  return { mode: language.primary === 'ar' ? 'ar' : 'en', primary: language.primary };
}

export function resolveLabel(label: LabelText, language: LanguageConfig): string {
  const english = label.en ?? '';
  const arabic = label.ar ?? null;

  if (language.mode === 'ar') return arabic ?? english;
  if (language.mode === 'en') return english;

  // Bilingual: join both, primary first. Degrade gracefully if one side is
  // missing. Stacked uses a newline; side-by-side uses an inline separator.
  if (!arabic) return english;
  if (!english) return arabic;
  const separator = language.mode === 'bilingual_stacked' ? '\n' : ' | ';
  return language.primary === 'ar'
    ? `${arabic}${separator}${english}`
    : `${english}${separator}${arabic}`;
}

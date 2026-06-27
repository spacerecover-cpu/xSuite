/**
 * Studio language-picker helpers — the small amount of logic that maps the
 * generalized {@link LanguageConfig} (mode + secondary + primary) onto the two
 * Studio controls (secondary-language dropdown + layout select), and back.
 *
 * The legacy single-secondary mode value `'ar'` is KEPT (it literally means
 * "secondary only", whatever the chosen secondary is — see `templateConfig.ts`).
 * RTL is auto-derived from the chosen secondary (`isRTLLanguage`), so the picker
 * is fully general across all 13 languages with no Arabic hardcoding.
 */
import {
  SUPPORTED_LANGUAGES,
  isRTLLanguage,
  type LanguageCode,
} from '../../../lib/documentTranslations';
import type { LanguageConfig, LanguageMode } from '../../../lib/pdf/templateConfig';

/** The display name for a secondary language code (e.g. 'fr' → 'French'). */
export function languageName(code: LanguageCode | null): string {
  if (!code) return 'English Only';
  return SUPPORTED_LANGUAGES.find((l) => l.code === code)?.name ?? code;
}

/** The secondary-language dropdown options (English Only + the 13). The value is
 *  the language code, or `''` for English Only (a `<select>` value is a string). */
export const SECONDARY_LANGUAGE_OPTIONS: { value: string; label: string }[] =
  SUPPORTED_LANGUAGES.map((l) => ({
    value: l.code ?? '',
    label: l.code ? l.name : 'English Only',
  }));

/** The layout-mode values shown when a secondary is chosen. `'ar'` = secondary
 *  only (legacy literal kept), then the two bilingual layouts. */
export type StudioLayoutMode = Extract<
  LanguageMode,
  'ar' | 'bilingual_stacked' | 'bilingual_sidebyside'
>;

/** Neutral, language-aware labels for the layout select (no hardcoded "Arabic"). */
export function layoutOptions(secondary: LanguageCode | null): { value: StudioLayoutMode; label: string }[] {
  const name = languageName(secondary);
  return [
    { value: 'ar', label: `${name} only` },
    { value: 'bilingual_stacked', label: `Bilingual — stacked (English over ${name})` },
    { value: 'bilingual_sidebyside', label: `Bilingual — side by side (English | ${name})` },
  ];
}

/**
 * The `primary` slot for a (mode, secondary) pair: the secondary LEADS — legacy
 * `primary: 'ar'` — only when it is RTL (so the document flips to RTL); otherwise
 * English leads. This generalizes the legacy Arabic-lead rule to any RTL
 * secondary while keeping LTR languages English-led.
 */
export function primaryFor(secondary: LanguageCode | null): LanguageConfig['primary'] {
  return secondary && isRTLLanguage(secondary) ? 'ar' : 'en';
}

/** Build the LanguageConfig patch for selecting a secondary language. Selecting
 *  "English Only" (`code === null`) resets to single English; selecting a code
 *  keeps the current layout (defaulting to stacked) and recomputes `primary`. */
export function patchForSecondary(
  code: LanguageCode | null,
  currentMode: LanguageMode,
): Partial<LanguageConfig> {
  if (!code) return { mode: 'en', primary: 'en', secondary: undefined };
  const mode: LanguageMode = currentMode === 'en' ? 'bilingual_stacked' : currentMode;
  return { mode, secondary: code, primary: primaryFor(code) };
}

/** Build the LanguageConfig patch for selecting a layout mode (secondary fixed). */
export function patchForLayout(
  mode: StudioLayoutMode,
  secondary: LanguageCode | null,
): Partial<LanguageConfig> {
  return { mode, primary: primaryFor(secondary) };
}

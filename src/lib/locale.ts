// Single source of truth for UI/PDF locale direction + supported-language guarding.
//
// The supported-language and RTL sets are MUTABLE and hydrated from geo_languages
// at runtime (hydrateLanguages). {'en','ar'} is the in-bundle bootstrap (anti-flash
// + offline fallback). Do NOT re-pin Locale to an 'en'|'ar' union — that compile-
// pins the product to two languages, which the country engine removes.

export const RTL_LANGS = new Set<string>(['ar']);
export const SUPPORTED_LANGS = new Set<string>(['en', 'ar']);
const FALLBACK_LANG = 'en';

export interface LanguageRow {
  code: string;
  is_rtl: boolean;
}

/** Widen the supported-language + RTL sets from geo_languages (no redeploy).
 *  A no-op on an empty list, so a failed/empty DB read keeps the bootstrap set. */
export function hydrateLanguages(rows: LanguageRow[]): void {
  if (!rows.length) return; // keep bootstrap if DB unreachable / empty
  SUPPORTED_LANGS.clear();
  RTL_LANGS.clear();
  for (const r of rows) {
    SUPPORTED_LANGS.add(r.code);
    if (r.is_rtl) RTL_LANGS.add(r.code);
  }
  if (!SUPPORTED_LANGS.has(FALLBACK_LANG)) SUPPORTED_LANGS.add(FALLBACK_LANG);
}

export function isRTLLanguage(lang: string): boolean {
  return RTL_LANGS.has(lang);
}

/** Normalize an arbitrary locale code to a supported language, else the fallback.
 *  Tries the exact code, then the base subtag (ar-OM -> ar). */
export function normalizeLang(code?: string): string {
  if (!code) return FALLBACK_LANG;
  if (SUPPORTED_LANGS.has(code)) return code;
  const base = code.split('-')[0];
  return SUPPORTED_LANGS.has(base) ? base : FALLBACK_LANG;
}

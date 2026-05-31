// Single source of truth for UI/PDF locale direction + supported-language guarding.
// RTL set is {'ar'} (v1). Supported UI languages are 'en' + 'ar' only; everything
// else (de/fr/undefined/unknown) normalizes to 'en' / LTR.

const RTL_LANGUAGES = new Set<string>(['ar']);

export function isRTLLanguage(lang: string): boolean {
  return RTL_LANGUAGES.has(lang);
}

export function normalizeLang(code?: string): 'en' | 'ar' {
  if (code === 'ar' || code?.startsWith('ar-')) return 'ar';
  return 'en';
}

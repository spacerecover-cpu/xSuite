import { normalizeLang } from './locale';

// Per-recipient UI locale resolution (Q3). Distinct from
// notificationLanguage.resolveCustomerLanguage: this one NORMALIZES the result to
// a supported UI language (the UI can only render shipped langs), whereas the
// notification path returns the raw recipient preference for template lookup.

export interface CustomerLanguageInput {
  preferred?: string | null;
  sessionLang?: string | null;
  tenantDefault?: string | null;
  countryLanguage?: string | null;
}

/** First non-blank candidate walking customer pref -> session -> tenant default
 *  -> country language, normalized to a supported UI language (else 'en'). */
export function resolveCustomerLanguage(input: CustomerLanguageInput): string {
  for (const v of [input.preferred, input.sessionLang, input.tenantDefault, input.countryLanguage]) {
    const t = (v ?? '').trim();
    if (t) return normalizeLang(t);
  }
  return 'en';
}

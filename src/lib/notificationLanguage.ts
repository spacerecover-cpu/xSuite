// Per-recipient comms language resolution (Q3) for the notification path.
// NOTE (dedup follow-up): Track A's src/lib/customerLanguageService.ts ships an
// equivalent chain keyed { preferred, sessionLang, tenantDefault, countryLanguage }.
// When both have landed, consolidate onto one implementation and re-export here.

export interface LanguageCandidates {
  customerPref?: string | null;
  sessionPref?: string | null;
  tenantDefault?: string | null;
  countryLang?: string | null;
}

/** Resolve the per-recipient comms language (Q3). First non-blank candidate
 *  walking customer -> session -> tenant -> country -> 'en'. */
export function resolveCustomerLanguage(c: LanguageCandidates): string {
  for (const v of [c.customerPref, c.sessionPref, c.tenantDefault, c.countryLang]) {
    const t = (v ?? '').trim();
    if (t) return t;
  }
  return 'en';
}

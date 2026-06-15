// Pure provisioning guards for the provision-tenant edge function.
//
// Kept dependency-free (no Deno globals, no Supabase client) so it is directly
// unit-testable under vitest. The edge function imports this and translates a
// thrown ProvisionGuardError into an HTTP response.
//
// FAIL-LOUD, NO US FABRICATION (Country Engine D2/D3, §9.4): a country that is
// not formatting-ready (stub config_status, or missing currency/locale/date/tz)
// is rejected with 422 — the function NEVER backfills '$'/'USD'/'en-US'/
// 'MM/DD/YYYY' to let a half-configured country through. Statutory readiness
// (statutory_ready) is owned by the DB enforce_onboardable_country backstop +
// the Phase-3 statutory CI gate; this guard asserts only the FORMATTING
// prerequisites Phase 1 ships.

export interface CountryFormattingFields {
  name?: string | null;
  currency_code?: string | null;
  locale_code?: string | null;
  date_format?: string | null;
  timezone?: string | null;
  config_status?: string | null;
}

export class ProvisionGuardError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ProvisionGuardError';
    this.status = status;
  }
}

const NOT_AVAILABLE =
  'This country is not yet available for onboarding. Please choose another country or contact support.';

/**
 * Throw a 422 ProvisionGuardError unless the country row is formatting-ready:
 * a real 3-letter currency + locale + date format + timezone, and a
 * config_status that is not 'stub'. No US fallback is ever substituted.
 */
export function assertOnboardableCountry(country: CountryFormattingFields | null | undefined): void {
  if (!country) {
    throw new ProvisionGuardError(422, NOT_AVAILABLE);
  }

  const currency = country.currency_code;
  const currencyOk = typeof currency === 'string' && currency.length === 3;

  const formattingOk =
    currencyOk &&
    !!country.locale_code &&
    !!country.date_format &&
    !!country.timezone;

  const statusOk = country.config_status !== 'stub';

  if (!formattingOk || !statusOk) {
    throw new ProvisionGuardError(422, NOT_AVAILABLE);
  }
}

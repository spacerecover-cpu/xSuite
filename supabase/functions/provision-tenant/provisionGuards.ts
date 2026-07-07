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

/** Owner E6: a residency-mandated country without a matching deployed region must
 *  fail with an HONEST 422 — never silently place regulated data in global-1. */
export class ResidencyNotAvailableError extends Error {
  readonly status = 422;
  constructor(countryName: string) {
    super(
      `${countryName} requires in-country data residency and no matching residency region is deployed yet. ` +
      'Onboarding is blocked rather than silently storing regulated data in the global region.',
    );
    this.name = 'ResidencyNotAvailableError';
  }
}

export function assertResidencySupported(
  country: { name?: string | null; requires_local_residency?: boolean | null },
  availableRegions: string[] = ['global-1'],
): void {
  if (!country?.requires_local_residency) return;
  if (availableRegions.some((r) => r !== 'global-1')) return;
  throw new ResidencyNotAvailableError(country.name ?? 'This country');
}

// ── GSTIN validation (ported from src/lib/regimes/in_gst/gstin.ts) ────────────
// Edge functions cannot import from src/, so the pure mod-36 check character +
// the 36 GSTIN-issuing state codes (the S1b set MINUS the place-of-supply-only
// codes 96/97) are re-implemented self-contained here. Keep in sync with the
// canonical module. This is the UNAUTHENTICATED self-service write path
// (service-role, RLS bypassed), so it validates the statutory identifier itself.
const GSTIN_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const GSTIN_STATE_CODES: ReadonlySet<string> = new Set([
  '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12',
  '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24',
  '26', '27', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38',
]);

export function gstinCheckDigit(base14: string): string {
  let factor = 2;
  let sum = 0;
  for (let i = base14.length - 1; i >= 0; i--) {
    const cp = GSTIN_CHARSET.indexOf(base14[i]);
    if (cp < 0) throw new Error(`gstinCheckDigit: invalid character '${base14[i]}'`);
    const product = factor * cp;
    factor = factor === 2 ? 1 : 2;
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARSET[(36 - (sum % 36)) % 36];
}

export interface GstinCheck {
  ok: boolean;
  error: string | null;
  stateCode: string | null;
}

export function validateGstin(gstin: string): GstinCheck {
  const value = (gstin ?? '').trim().toUpperCase();
  const stateCode = /^[0-9]{2}/.test(value) ? value.slice(0, 2) : null;
  if (!GSTIN_PATTERN.test(value)) {
    return {
      ok: false, stateCode,
      error: 'GSTIN must be 15 characters: 2-digit state code, 10-character PAN, entity code, "Z", check character.',
    };
  }
  if (!stateCode || !GSTIN_STATE_CODES.has(stateCode)) {
    return { ok: false, stateCode, error: `GSTIN state code ${stateCode} is not a GSTIN-issuing state code.` };
  }
  if (gstinCheckDigit(value.slice(0, 14)) !== value[14]) {
    return { ok: false, stateCode, error: 'GSTIN check character is invalid — please re-check the number.' };
  }
  return { ok: true, error: null, stateCode };
}

export interface PrimaryRegistrationInput {
  tenantId: string;
  legalEntityId: string;
  countryId: string;
  taxNumber: string | null | undefined;
  subdivisionId: string | null | undefined;
  today: string; // 'YYYY-MM-DD' (UTC)
  /** GST regime for this country (country.tax_system === 'GST' — a DATA key
   *  resolved by the handler, never a country-code literal). Off ⇒ no GSTIN check. */
  isGstRegime?: boolean;
  /** The selected subdivision's GST code, resolved from geo_subdivisions by the
   *  handler; used for the GSTIN state-prefix cross-check. */
  subdivisionTaxAuthorityCode?: string | null;
  /** Whether subdivisionId was found under countryId (handler DB check). Defaults
   *  to true so callers that pass no subdivision are unaffected. */
  subdivisionBelongsToCountry?: boolean;
}

/** Seller registration row from the jurisdiction payload. null = nothing captured
 *  (the tenant declares registered/unregistered post-onboarding in Settings —
 *  D6 explicit-status discipline; nothing is fabricated here). Throws
 *  ProvisionGuardError(422) rather than persist an invalid/garbage row. */
export function buildPrimaryRegistrationRow(input: PrimaryRegistrationInput) {
  const taxNumber = (input.taxNumber ?? '').trim().toUpperCase();

  // Regime-AGNOSTIC integrity: a provided subdivision must belong to the country.
  if (input.subdivisionId && input.subdivisionBelongsToCountry === false) {
    throw new ProvisionGuardError(422, 'The selected state/subdivision does not belong to the chosen country.');
  }

  if (!taxNumber) return null;

  // GST regime: fail loud on a malformed / checksum-invalid GSTIN, a missing
  // state, or a GSTIN state-prefix that does not match the selected state.
  if (input.isGstRegime) {
    const check = validateGstin(taxNumber);
    if (!check.ok) {
      throw new ProvisionGuardError(422, check.error ?? 'Invalid GSTIN.');
    }
    if (!input.subdivisionId) {
      throw new ProvisionGuardError(422, 'A state/UT selection is required to register a GSTIN.');
    }
    if (input.subdivisionTaxAuthorityCode && taxNumber.slice(0, 2) !== input.subdivisionTaxAuthorityCode) {
      throw new ProvisionGuardError(
        422,
        `GSTIN state code ${taxNumber.slice(0, 2)} does not match the selected state (${input.subdivisionTaxAuthorityCode}).`,
      );
    }
  }

  return {
    tenant_id: input.tenantId,
    legal_entity_id: input.legalEntityId,
    country_id: input.countryId,
    subdivision_id: input.subdivisionId ?? null,
    tax_number: taxNumber,
    scheme: 'standard' as const,
    registered_from: input.today,
    is_primary: true,
  };
}

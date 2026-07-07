// Pure, dependency-free onboarding helpers (TDD seam). No React, no Supabase —
// these are the unit-testable predicates the wizard hook + steps consume.
//
// Fail-loud, no US fabrication (Country Engine D2/D3): a country with no real
// 3-letter currency is NOT onboardable (it would otherwise force a '$'/'USD'
// fallback downstream). Language defaults resolve to the app's supported union
// (en | ar) — never a US locale literal.
import { validateGSTIN } from '../../../lib/regimes/in_gst/gstin';
import { gstinMatchesSubdivision } from '../../../lib/regimes/in_gst/registrationStatus';

/** The shape these helpers actually read off a geo_countries row (loose on purpose). */
export interface OnboardableCountryLike {
  code: string;
  currency_code: string | null;
  is_active: boolean | null;
}

/**
 * Keep only active countries that carry a real ISO-4217-shaped (3-letter)
 * currency code. Anything else is a stub and must not appear in the dropdown.
 */
export function filterOnboardableCountries<T extends OnboardableCountryLike>(
  countries: T[],
): T[] {
  return countries.filter(
    (c) =>
      c.is_active === true &&
      typeof c.currency_code === 'string' &&
      c.currency_code.length === 3,
  );
}

export interface TaxNumberResult {
  ok: boolean;
  message?: string;
}

/**
 * Validate a tax/VAT registration number against the country's reference
 * format. When the country has no machine-readable format (our reference-data
 * gap, not the operator's), we accept any non-empty value rather than block
 * onboarding — but an empty value is always rejected when this runs.
 */
export function validateTaxNumber(
  format: string | null | undefined,
  value: string,
): TaxNumberResult {
  const trimmed = (value ?? '').trim();
  if (trimmed.length === 0) {
    return { ok: false, message: 'Tax registration number is required' };
  }
  if (!format) {
    return { ok: true };
  }
  let re: RegExp;
  try {
    re = new RegExp(format);
  } catch {
    // A malformed reference regex is our data problem, not the user's — fall
    // back to the "non-empty is acceptable" behaviour rather than hard-failing.
    return { ok: true };
  }
  return re.test(trimmed)
    ? { ok: true }
    : { ok: false, message: 'Does not match the expected format for this country' };
}

/**
 * Map a country language code to the app's supported UI language union (en|ar).
 * Conservative: any unsupported language resolves to 'en' (a supported value),
 * never a throw and never a US-specific locale.
 */
export function resolveUiLanguageDefault(
  countryLanguageCode: string | null | undefined,
): 'en' | 'ar' {
  return (countryLanguageCode ?? '').toLowerCase() === 'ar' ? 'ar' : 'en';
}

/**
 * The conditional jurisdiction step only renders when the country actually has
 * a tax system to capture a registration for. NONE / null / '' → no step.
 */
export function shouldShowJurisdictionStep(
  taxSystem: string | null | undefined,
): boolean {
  if (!taxSystem) return false;
  return taxSystem.toUpperCase() !== 'NONE';
}

/**
 * The account step cannot advance until the admin email is OTP-verified
 * (Country Engine §9.5). Pure predicate over the only field that gates it.
 */
export function canAdvanceFromAccount(formData: { emailVerified: boolean }): boolean {
  return formData.emailVerified === true;
}

/** A well-formed OTP is exactly six ASCII digits, no surrounding whitespace. */
export function otpCodeIsValidShape(code: string): boolean {
  return /^[0-9]{6}$/.test(code);
}

/**
 * Decide what ui_language to send to provisioning. Send the chosen value ONLY
 * when the user deviated from the country default — otherwise return undefined
 * so the DB country-sync trigger owns the default (§9.2). Never sends a value
 * the user did not actively pick.
 */
export function resolveUiLanguagePayload(
  countryLanguageCode: string | null | undefined,
  chosen: string | null | undefined,
): string | undefined {
  if (!chosen) return undefined;
  const countryDefault = resolveUiLanguageDefault(countryLanguageCode);
  return chosen === countryDefault ? undefined : chosen;
}

/** The jurisdiction fields the Continue gate reads (structural, so both the
 *  wizard step and LocationStep pass their real objects without coupling). */
export interface JurisdictionFormLike {
  legalEntityType: string;
  taxNumber: string;
  subdivisionId: string;
}
export interface JurisdictionCountryLike {
  tax_number_format: string | null | undefined;
}
export interface JurisdictionSubdivisionLike {
  id: string;
  tax_authority_code: string | null;
}
export interface JurisdictionEvaluation {
  complete: boolean;
  taxError: string | null;
}

/**
 * The SINGLE source of truth for whether the onboarding jurisdiction block is
 * satisfied — consumed both by JurisdictionStep (inline error) and by
 * LocationStep's Continue-button gate, so the strong GSTIN validation is no
 * longer decorative.
 *
 * GST-coded countries (a subdivision carrying a `tax_authority_code` — a DATA
 * key, never a country literal) get the S3 checksum validator + the L2 state
 * cross-check; every other regime keeps the soft country-format regex.
 * `complete` additionally requires a selected State whenever subdivisions exist.
 */
export function evaluateJurisdiction(
  formData: JurisdictionFormLike,
  country: JurisdictionCountryLike | null | undefined,
  subdivisions: JurisdictionSubdivisionLike[],
): JurisdictionEvaluation {
  const trimmedTax = (formData.taxNumber ?? '').trim();
  const hasGstSubdivisions = subdivisions.some((s) => s.tax_authority_code);
  const selectedSubdivision = subdivisions.find((s) => s.id === formData.subdivisionId) ?? null;

  let taxError: string | null = null;
  if (trimmedTax.length > 0) {
    if (hasGstSubdivisions) {
      const gstin = validateGSTIN(trimmedTax);
      if (!gstin.ok) {
        taxError = gstin.error ?? 'Invalid GSTIN';
      } else if (
        selectedSubdivision &&
        !gstinMatchesSubdivision(trimmedTax, selectedSubdivision.tax_authority_code)
      ) {
        taxError = `This GSTIN does not match the selected state (expected state code ${selectedSubdivision.tax_authority_code}).`;
      }
    } else {
      const soft = validateTaxNumber(country?.tax_number_format ?? null, formData.taxNumber);
      if (!soft.ok) {
        taxError = soft.message ?? 'Does not match the expected format for this country';
      }
    }
  }

  const complete =
    formData.legalEntityType.trim() !== '' &&
    trimmedTax !== '' &&
    taxError === null &&
    (subdivisions.length === 0 || formData.subdivisionId.trim() !== '');

  return { complete, taxError };
}

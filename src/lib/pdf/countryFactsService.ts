import { supabase } from '../supabaseClient';
import type { ResolvedCountryFacts } from './engine/countryConfig';

/** The single country-facts read backing the PDF country layer (§8b). Resolves
 *  off a country_id (the tenant's, or in R7 the document's legal entity's).
 *
 *  Fail-soft: returns null when no country_id is given or no row is found, so the
 *  caller simply skips the country override -- it NEVER fabricates a US/any default.
 *
 *  §3c note: the effective-dated tax_label resolver (geo_country_tax_rates) is a
 *  follow-up gated on that table landing; today only the geo_countries.tax_label
 *  scalar exists, so this reads the scalar (the binding fallback per §3c). */
export async function getResolvedCountryFacts(
  countryId: string | null | undefined,
): Promise<ResolvedCountryFacts | null> {
  if (!countryId) return null;

  const { data } = await supabase
    .from('geo_countries')
    .select('code, tax_system, tax_label, tax_invoice_required, language_code, decimal_places, date_format')
    .eq('id', countryId)
    .maybeSingle();

  if (!data) return null;

  return {
    code: data.code,
    taxSystem: data.tax_system ?? null,
    taxLabel: data.tax_label ?? null,
    taxInvoiceRequired: !!data.tax_invoice_required,
    languageCode: data.language_code ?? null,
    decimalPlaces: data.decimal_places ?? null,
    dateFormat: data.date_format ?? null,
  };
}

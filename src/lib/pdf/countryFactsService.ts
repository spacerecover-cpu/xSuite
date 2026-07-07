import { supabase } from '../supabaseClient';
import type { ResolvedCountryFacts } from './engine/countryConfig';
import { registerAllRegimePlugins } from '../regimes/register';
import { listRegisteredCapabilities } from '../regimes/registry';

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
    .select('code, tax_system, tax_label, tax_number_label, tax_invoice_required, language_code, decimal_places, date_format, decimal_separator, thousands_separator, digit_grouping, address_format, country_config')
    .eq('id', countryId)
    .maybeSingle();

  if (!data) return null;

  // D11 → data: resolve the ACTIVE e-invoice regime for this country from
  // master_einvoice_regimes (mandatory_from on/before today, most recent first),
  // so statutory artifacts (e.g. the ZATCA Phase-1 QR) route by REGIME, never by
  // country-string matching. No row / not-yet-mandatory → 'no_einvoice' (no QR).
  const today = new Date().toISOString().slice(0, 10);
  const { data: regimes } = await supabase
    .from('master_einvoice_regimes')
    .select('adapter_key, mandatory_from')
    .eq('country_id', countryId)
    .is('deleted_at', null)
    .lte('mandatory_from', today)
    .order('mandatory_from', { ascending: false });

  // Route to the latest-mandated regime whose adapter is actually IMPLEMENTED in the code
  // registry. A declared-but-unimplemented future phase (e.g. SA's zatca_ph2 clearance)
  // must NOT shadow the implemented one (zatca_ph1) and suppress the statutory artifact —
  // an unrecognised latest regime would else resolve to a key no transport handles → no QR.
  registerAllRegimePlugins();
  const registeredEinvoice = new Set(
    listRegisteredCapabilities().filter((c) => c.kind === 'einvoice').map((c) => c.capability_key),
  );
  const einvoiceRegimeKey =
    (regimes ?? []).find((r) => r.adapter_key && registeredEinvoice.has(r.adapter_key))?.adapter_key
    ?? 'no_einvoice';

  // address_format is jsonb shaped `{"lines": ["%N","%O","%A","%C %Z"]}` (a
  // postal-address template, not a postal_first string). Join the lines into
  // one token string so the country layer can locate %Z vs %C by index.
  const af = data.address_format as { lines?: unknown } | null;
  const addressFormat = af && Array.isArray(af.lines)
    ? (af.lines as unknown[]).filter((l): l is string => typeof l === 'string').join(' ')
    : null;

  return {
    code: data.code,
    taxSystem: data.tax_system ?? null,
    taxLabel: data.tax_label ?? null,
    taxNumberLabel: data.tax_number_label ?? null,
    taxInvoiceRequired: !!data.tax_invoice_required,
    languageCode: data.language_code ?? null,
    decimalPlaces: data.decimal_places ?? null,
    dateFormat: data.date_format ?? null,
    decimalSeparator: data.decimal_separator ?? null,
    thousandsSeparator: data.thousands_separator ?? null,
    digitGrouping: data.digit_grouping ?? null,
    amountWordsScale:
      ((data.country_config ?? {}) as Record<string, unknown>)['format.amount_words_scale'] === 'indian'
        ? 'indian'
        : 'western',
    einvoiceRegimeKey,
    addressFormat,
  };
}

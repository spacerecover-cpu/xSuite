import { isRTLLanguage } from '../../locale';
import type { TemplateConfigOverride } from '../templateConfig';

/** Resolved statutory/format facts the country layer needs. Read by the caller
 *  from geo_countries (+ the §3c geo_country_tax_rates resolver for the
 *  effective-dated tax_label) -- this mapper never touches the DB. */
export interface ResolvedCountryFacts {
  code: string; // ISO alpha-2
  taxSystem: string | null; // 'VAT' | 'GST' | 'SALES_TAX' | 'NONE'
  taxLabel: string | null; // resolved label (rate-row first, scalar fallback)
  taxInvoiceRequired: boolean;
  languageCode: string | null; // drives RTL via isRTLLanguage
  decimalPlaces: number | null; // minor-unit (3 OMR/KWD/BHD, 0 JPY)
  dateFormat: string | null; // stored 'DD/MM/YYYY' etc.
}

/** Map resolved country facts -> a derived (NOT authored) template override that
 *  slots into the cascade between built-in and theme. One override, not 195
 *  templates (locked blind-spot decision). ZATCA TLV stays in the adapter via
 *  shouldEmitZatcaQr({taxSystem, countryCode}); this only flips taxBar.enabled. */
export function countryTemplateOverride(facts: ResolvedCountryFacts): TemplateConfigOverride {
  const override: TemplateConfigOverride = {};

  // D9 -- resolved tax label drives the VAT line + the tax-identification bar.
  if (facts.taxLabel) {
    override.labels = { taxLabel: { en: facts.taxLabel } };
  }

  // D11 -- VAT identification bar on only when a tax invoice is required AND VAT.
  // Always set `enabled` (true|false) so the cascade reads a definite value
  // (otherwise a non-VAT country leaves taxBar.enabled undefined, not false).
  override.taxBar = { enabled: facts.taxInvoiceRequired && facts.taxSystem === 'VAT' };
  if (facts.taxLabel) override.taxBar.label = { en: facts.taxLabel };

  // RTL country -> bilingual-stacked, Arabic-lead.
  if (facts.languageCode && isRTLLanguage(facts.languageCode)) {
    override.language = { mode: 'bilingual_stacked', primary: 'ar' };
  }

  // §8d/§8g -- thread date format + minor-units onto the locale slice.
  const locale: NonNullable<TemplateConfigOverride['locale']> = {};
  if (facts.dateFormat) locale.dateFormat = facts.dateFormat;
  if (facts.decimalPlaces != null) locale.decimalPlaces = facts.decimalPlaces;
  if (Object.keys(locale).length > 0) override.locale = locale;

  return override;
}

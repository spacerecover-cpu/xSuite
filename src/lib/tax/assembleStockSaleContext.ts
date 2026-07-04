import { supabase } from '../supabaseClient';
import { registerAllRegimePlugins } from '../regimes/register';
import { resolveTaxStrategy } from '../regimes/registry';
import type { TaxableLine, TaxComputation, TaxContext, RoundingPolicy, ScaleSystem } from '../regimes/types';
import { resolveRateContext } from '../currencyService';
import { tenantToday } from '../tenantToday';

export interface StockSaleTaxInput {
  lines: TaxableLine[];
  documentDiscount: number;
  taxInclusive: boolean;
}

/** POS sales have no draft stage: assemble the TaxContext here and run the same
 *  kernel invoices use. Invoked through the registered TaxStrategy (`strategy.compute`),
 *  matching taxDocumentService.computeDocumentTotals — the canonical caller — rather
 *  than calling the kernel's computeDocumentTax directly, so POS and invoices share the
 *  exact same regime-resolution path. Base-currency only (POS is tenant-base by definition). */
export async function computeStockSaleTax(input: StockSaleTaxInput): Promise<TaxComputation> {
  registerAllRegimePlugins();

  const { data: entities } = await supabase
    .from('legal_entities')
    .select('id, tenant_id, country_id, subdivision_id, tax_identifier, is_primary')
    .is('deleted_at', null);
  const seller = (entities ?? []).find((e) => e.is_primary) ?? (entities ?? [])[0];
  if (!seller) throw new Error('computeStockSaleTax: no legal entity configured for this tenant');

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, timezone, base_currency_code, resolved_country_config')
    .eq('id', seller.tenant_id)
    .maybeSingle();
  if (!tenant) throw new Error('computeStockSaleTax: tenant not resolvable');

  const resolved = (tenant.resolved_country_config ?? {}) as Record<string, unknown>;
  const regimeKey = (resolved['regime.tax'] as string) || 'simple_vat';
  const strategy = resolveTaxStrategy(regimeKey);
  const taxPointDate = tenantToday(tenant.timezone ?? 'UTC');

  const { data: regs } = await supabase
    .from('legal_entity_tax_registrations')
    .select('*')
    .eq('legal_entity_id', seller.id)
    .is('deleted_at', null)
    .lte('registered_from', taxPointDate)
    .or(`registered_to.is.null,registered_to.gte.${taxPointDate}`);

  const { data: rates } = await supabase
    .from('geo_country_tax_rates')
    .select('*')
    .eq('country_id', seller.country_id)
    .is('deleted_at', null)
    .lte('valid_from', taxPointDate)
    .or(`valid_to.is.null,valid_to.gte.${taxPointDate}`)
    .order('sort_order');

  const rateContext = await resolveRateContext(undefined, taxPointDate, null); // tenant base

  const roundingPolicy =
    (resolved['tax.rounding_policy'] as RoundingPolicy | undefined) ?? strategy.defaults.roundingPolicy;
  const scaleSystem =
    (resolved['format.amount_words_scale'] as ScaleSystem | undefined) ?? strategy.defaults.scaleSystem;

  const ctx: TaxContext = {
    documentType: 'stock_sale',
    seller: {
      legalEntityId: seller.id,
      countryId: seller.country_id,
      subdivisionId: seller.subdivision_id ?? null,
      taxIdentifier: seller.tax_identifier ?? null,
      registrations: regs ?? [],
    },
    buyer: { taxNumber: null, countryId: null, subdivisionId: null, isBusiness: false, addressSnapshot: null },
    taxPointDate,
    placeOfSupplySubdivisionId: null,
    lines: input.lines,
    documentDiscount: input.documentDiscount,
    taxInclusive: input.taxInclusive,
    rateContext,
    rates: rates ?? [],
    roundingPolicy,
    scaleSystem,
  };
  return await strategy.compute(ctx);
}

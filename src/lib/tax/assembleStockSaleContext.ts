import { supabase } from '../supabaseClient';
import { registerAllRegimePlugins } from '../regimes/register';
import { resolveTaxStrategy } from '../regimes/registry';
import { matchFormRate, scopeRatesToPlaceOfSupply } from '../taxDocumentService';
import type { TaxableLine, TaxComputation, TaxContext, RoundingPolicy, ScaleSystem, GeoCountryTaxRateRow, LegalEntityTaxRegistrationRow } from '../regimes/types';
import { resolveRateContext } from '../currencyService';
import { tenantToday } from '../tenantToday';

export interface StockSaleTaxInput {
  lines: TaxableLine[];
  documentDiscount: number;
  taxInclusive: boolean;
  /** The applicable standard slab rate (e.g. India GST 18). A split-levy pack
   *  (in_gst) seeds several slabs, so the caller must say which one the item
   *  falls under; a single-levy / single-slab pack derives it unambiguously. */
  taxRate?: number;
}

/** A POS counter sale carries no per-document form rate. In a single-levy /
 *  single-slab config the applicable standard rate is unambiguous, so derive it
 *  exactly the way matchFormRate matches it (the flat standards' sum, or a slab
 *  bucket's headline). A multi-slab pack (India GST 5/12/18/28) is ambiguous —
 *  the caller MUST pass taxRate (the item's slab); fail loud rather than guess
 *  and stack every slab into the tax (the corruption this narrowing prevents). */
function deriveCounterSaleFormRate(effective: GeoCountryTaxRateRow[]): number {
  const standards = effective.filter((r) => r.tax_category === 'standard');
  const buckets = new Map<string, GeoCountryTaxRateRow[]>();
  for (const r of standards) {
    if (r.applies_to === null) continue;
    const rows = buckets.get(r.applies_to) ?? [];
    rows.push(r);
    buckets.set(r.applies_to, rows);
  }
  const candidates = new Set<number>();
  for (const rows of buckets.values()) candidates.add(Math.max(...rows.map((r) => r.rate)));
  const flat = standards.filter((r) => r.subdivision_id === null && r.applies_to === null);
  if (flat.length > 0) candidates.add(flat.reduce((s, r) => s + r.rate, 0));
  if (candidates.size === 0) return 0;
  if (candidates.size === 1) return [...candidates][0];
  throw new Error(
    'computeStockSaleTax: multiple standard tax slabs are configured '
    + `(${[...candidates].sort((a, b) => a - b).join('%, ')}%); a POS sale must specify which slab applies (pass taxRate).`,
  );
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

  // Mirror computeDocumentTotals (taxDocumentService): a walk-in counter sale is
  // intra-state — its place of supply is the seller's own subdivision (no ship-to
  // buyer here) — so narrow the seeded rates to ONE slab bucket (matchFormRate)
  // and collapse each component to the place-of-supply-scoped head
  // (scopeRatesToPlaceOfSupply) BEFORE the split kernel selects heads. Without
  // this, in_gst's split selects every standard row and stacks all slabs' rates.
  const effective = (rates ?? []) as GeoCountryTaxRateRow[];
  const placeOfSupplySubdivisionId = seller.subdivision_id ?? null;
  const formRate = input.taxRate ?? deriveCounterSaleFormRate(effective);
  const scopedRates = scopeRatesToPlaceOfSupply(matchFormRate(effective, formRate), placeOfSupplySubdivisionId);
  // rate 0 → untaxed sale: mark lines out_of_scope so the kernel emits zero-amount
  // evidence rows instead of dropping them, matching computeDocumentTotals.
  const effectiveLines = scopedRates.length === 0
    ? input.lines.map((l) => ({ ...l, treatment: 'out_of_scope' as const }))
    : input.lines;

  const ctx: TaxContext = {
    documentType: 'stock_sale',
    seller: {
      legalEntityId: seller.id,
      countryId: seller.country_id,
      subdivisionId: seller.subdivision_id ?? null,
      taxIdentifier: seller.tax_identifier ?? null,
      registrations: (regs ?? []) as LegalEntityTaxRegistrationRow[],
    },
    buyer: { taxNumber: null, countryId: null, subdivisionId: null, isBusiness: false, addressSnapshot: null },
    taxPointDate,
    placeOfSupplySubdivisionId,
    lines: effectiveLines,
    documentDiscount: input.documentDiscount,
    taxInclusive: input.taxInclusive,
    rateContext,
    rates: scopedRates,
    roundingPolicy,
    scaleSystem,
  };
  return await strategy.compute(ctx);
}

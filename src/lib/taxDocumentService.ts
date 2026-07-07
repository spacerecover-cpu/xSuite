// src/lib/taxDocumentService.ts
//
// The client seam between document services and the fiscal kernel + issue RPC.
// Services never touch the kernel or document_tax_lines directly — they call
// computeDocumentTotals → persistDocumentTaxLines → issueTaxDocument.

import { supabase } from './supabaseClient';
import { convertToBase, roundMoney } from './financialMath';
import type { RateContext } from './currencyService';
import type { Json } from '../types/database.types';
import { registerAllRegimePlugins } from './regimes/register';
import { resolveTaxStrategy } from './regimes/registry';
import { derivePlaceOfSupply } from './regimes/in_gst/placeOfSupply';
import { assertGstRegistrationExplicit } from './taxRegistrationService';
import type {
  ComputedTaxLine, GeoCountryTaxRateRow, LegalEntityTaxRegistrationRow, RoundingPolicy, RuleTrace,
  ScaleSystem, TaxComputation, TaxContext, TaxDocumentType, TaxableLine,
} from './regimes/types';

export interface DocumentTotalsInput {
  items: Array<{ description: string; quantity: number; unit_price: number; discount_percent?: number }>;
  discountType?: string | null;
  discountAmount: number;
  taxRate: number;
  documentType: TaxDocumentType;
  documentDate: string;
  taxInclusive?: boolean;
  /** Buyer identity for TaxContext threading (company overrides customer,
   *  mirroring issue_tax_document's buyer-identity block). Optional: legacy
   *  callers without a buyer keep the pre-S2 null-buyer context. */
  customerId?: string | null;
  companyId?: string | null;
}

export interface RequirementFailure {
  field_key: string;
  level: 'block' | 'warn';
  message: string;
}

export interface IssueTaxDocumentResult {
  ok: boolean;
  document_number: string | null;
  issued_at: string | null;
  vat_record_ids: string[];
  einvoice_submission_id: string | null;
  requirement_failures: RequirementFailure[];
  trace: RuleTrace | null;
}

/** The dry-run choke-point shape (Phase 2, Task 18): computed lines/totals/
 *  trace and requirement failures WITHOUT the issuance side effects
 *  (`document_number`/`issued_at`/`vat_record_ids`/`einvoice_submission_id`
 *  stay unset because nothing is minted or written on a dry run). */
export interface DryRunResult {
  ok: boolean;
  tax_lines: unknown[];
  totals: Record<string, unknown>;
  requirement_failures: RequirementFailure[];
  trace: unknown;
}

/** Item rows → kernel TaxableLines. lineItemId carries an 'idx:<n>' sentinel
 *  that persistDocumentTaxLines re-labels with real row ids after item insert. */
export function buildTaxableLines(
  items: DocumentTotalsInput['items'], documentDecimals: number,
): TaxableLine[] {
  return items.map((item, index) => {
    const sub = roundMoney(item.quantity * item.unit_price, documentDecimals);
    const discount = roundMoney(sub * ((item.discount_percent || 0) / 100), documentDecimals);
    return {
      lineItemId: `idx:${index}`, description: item.description,
      quantity: item.quantity, unitPrice: item.unit_price, lineDiscount: discount,
      unitCode: null, itemCode: null, treatment: 'standard', treatmentReasonCode: null,
    };
  });
}

/** The form's header rate resolves against effective-dated standard rows.
 *  (1) Slab-bucketed multi-head packs (India GST: CGST+SGST+IGST share an
 *      `applies_to` bucket) — the bucket whose HEADLINE (max) component rate
 *      equals the form rate carries the full head-set; return every row so the
 *      kernel's split_by_place_of_supply mode picks CGST/SGST vs IGST itself.
 *  (2) Legacy single-levy packs (Oman/AE/SA) — subdivision-null, bucket-less
 *      standards summing to the form rate (byte-parity path, unchanged).
 *  (3) Unmatched → one synthetic 'form:<rate>' row so provenance shows the
 *      override. rate 0 → no components (untaxed doc, matches legacy 0%). */
export function matchFormRate(
  effective: GeoCountryTaxRateRow[], formRate: number,
): GeoCountryTaxRateRow[] {
  if (formRate === 0) return [];
  const standards = effective.filter((r) => r.tax_category === 'standard');
  const buckets = new Map<string, GeoCountryTaxRateRow[]>();
  for (const r of standards) {
    if (r.applies_to === null) continue;
    const rows = buckets.get(r.applies_to) ?? [];
    rows.push(r);
    buckets.set(r.applies_to, rows);
  }
  for (const rows of buckets.values()) {
    const headline = Math.max(...rows.map((r) => r.rate));
    if (Math.abs(headline - formRate) < 1e-9) return rows;
  }
  const flat = standards.filter((r) => r.subdivision_id === null && r.applies_to === null);
  const sum = flat.reduce((s, r) => s + r.rate, 0);
  if (flat.length > 0 && Math.abs(sum - formRate) < 1e-9) return flat;
  // A slab-bucketed pack (India GST) has NO bucket-less flat standards, so the
  // single-row synthetic fallback below would emit a mis-coded head (component
  // of standards[0]) that the split kernel silently zero-rates inter-state
  // (IGST filter finds nothing) or mis-splits intra-state (one CGST head, no
  // SGST). A form rate matching no configured slab is out-of-spec — fail loud
  // rather than under-tax a statutory document.
  if (buckets.size > 0 && flat.length === 0) {
    throw new Error(
      `Tax rate ${formRate}% matches no configured tax slab (available: ${[...buckets.keys()].join(', ')}). `
      + 'Only a seeded slab rate is valid for a split-levy pack.',
    );
  }
  return [{
    id: `form:${formRate}`, country_id: flat[0]?.country_id ?? standards[0]?.country_id ?? 'form',
    subdivision_id: null,
    component_code: flat[0]?.component_code ?? standards[0]?.component_code ?? 'VAT',
    component_label: flat[0]?.component_label ?? standards[0]?.component_label ?? 'VAT',
    tax_category: 'standard', rate: formRate, applies_to: null,
    valid_from: '1970-01-01', valid_to: null, sort_order: 0,
  }];
}

/** The tax strategy key for the current tenant, resolved from the pack's
 *  `regime.tax` binding (Country Engine), defaulting to `simple_vat` when unbound
 *  — mirrors assembleStockSaleContext.ts:37-38. Threaded into computeDocumentTotals
 *  so a live India invoice resolves `in_gst` (kernel split) instead of `simple_vat`. */
export function resolveStrategyKey(resolved: Record<string, unknown>): string {
  return (resolved['regime.tax'] as string) || 'simple_vat';
}

/** India's `gst_slab_18` bucket carries the country CGST/SGST/IGST plus one
 *  UT-scoped SGST (labelled UTGST) row per Union Territory. The kernel's intra
 *  split (`split_by_place_of_supply`) selects EVERY 'SGST'-coded row, so the
 *  bucket must first collapse to one row per component — preferring the row
 *  scoped to the place of supply (a UT's UTGST) over the country default — else
 *  an intra-state invoice stacks all six SGST heads. A no-op for single-levy
 *  packs (already one row per component). NOTE: correct for single/split modes
 *  (every live country); a future jurisdiction_stack country needs its own path. */
export function scopeRatesToPlaceOfSupply(
  rows: GeoCountryTaxRateRow[], placeOfSupplySubdivisionId: string | null,
): GeoCountryTaxRateRow[] {
  const score = (r: GeoCountryTaxRateRow): number =>
    r.subdivision_id !== null && r.subdivision_id === placeOfSupplySubdivisionId ? 2
      : r.subdivision_id === null ? 1 : 0;
  const best = new Map<string, GeoCountryTaxRateRow>();
  for (const r of rows) {
    const cur = best.get(r.component_code);
    if (!cur || score(r) > score(cur)) best.set(r.component_code, r);
  }
  return [...best.values()];
}

/** Section 170 (CGST Act): whole-rupee cash rounding leaves a ± paise residual.
 *  Persist it as an explicit document-level "Round off" line (out_of_scope) so
 *  invoice grand total, the vat ledger and the GST return all reconcile — the
 *  residual is never smeared into a tax head. Null/0 adjustment → no line. */
export function roundOffAdjustmentLine(computation: TaxComputation): ComputedTaxLine | null {
  const adj = computation.totals.roundingAdjustment;
  if (adj === null || adj === 0) return null;
  return {
    lineItemId: null, componentCode: 'ROUND_OFF', componentLabel: 'Round off',
    jurisdictionRef: null, rate: 0, taxableBase: 0, taxAmount: adj,
    taxTreatment: 'out_of_scope', treatmentReasonCode: 'SEC_170_ROUNDING', sequence: 999,
  };
}

/** Kernel totals → the legacy header shape (subtotal is PRE-document-discount). */
export function totalsFromComputation(
  computation: TaxComputation, documentDiscount: number, documentDecimals: number,
): { subtotal: number; taxAmount: number; totalAmount: number } {
  return {
    subtotal: roundMoney(computation.totals.taxableBase + documentDiscount, documentDecimals),
    taxAmount: computation.totals.taxTotal,
    totalAmount: computation.totals.grandTotal,
  };
}

async function fetchSellerContext(): Promise<{
  legalEntityId: string; tenantId: string; countryId: string; subdivisionId: string | null;
  taxIdentifier: string | null; registrations: LegalEntityTaxRegistrationRow[];
}> {
  const { data: le, error } = await supabase
    .from('legal_entities')
    .select('id, tenant_id, country_id, subdivision_id, tax_identifier')
    .eq('is_primary', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!le) throw new Error('Tenant has no primary legal entity — cannot resolve the tax jurisdiction.');
  const { data: regs, error: regErr } = await supabase
    .from('legal_entity_tax_registrations')
    .select('id, legal_entity_id, country_id, subdivision_id, tax_number, scheme, registered_from, registered_to, is_primary')
    .eq('legal_entity_id', le.id)
    .is('deleted_at', null);
  if (regErr) throw regErr;
  return {
    legalEntityId: le.id, tenantId: le.tenant_id, countryId: le.country_id,
    subdivisionId: le.subdivision_id ?? null, taxIdentifier: le.tax_identifier,
    registrations: (regs ?? []) as LegalEntityTaxRegistrationRow[],
  };
}

async function fetchEffectiveRates(countryId: string, onDate: string): Promise<GeoCountryTaxRateRow[]> {
  const { data, error } = await supabase
    .from('geo_country_tax_rates')
    .select('id, country_id, subdivision_id, component_code, component_label, tax_category, rate, applies_to, valid_from, valid_to, sort_order')
    .eq('country_id', countryId)
    .lte('valid_from', onDate)
    .or(`valid_to.is.null,valid_to.gte.${onDate}`)
    .is('deleted_at', null)
    .order('sort_order');
  if (error) throw error;
  return (data ?? []) as GeoCountryTaxRateRow[];
}

/** Pack-resolved strategy key + rounding + scale (pattern: assembleStockSaleContext.ts:36-63).
 *  WP-S3 now threads the strategy key: `regime.tax` selects the TaxStrategy
 *  (`in_gst` for a published India pack, `simple_vat` otherwise). */
async function fetchPackContext(tenantId: string): Promise<{
  strategyKey: string; roundingPolicy: RoundingPolicy; scaleSystem: ScaleSystem;
}> {
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('resolved_country_config')
    .eq('id', tenantId)
    .maybeSingle();
  if (error) throw error;
  const resolved = (tenant?.resolved_country_config ?? {}) as Record<string, unknown>;
  return {
    strategyKey: resolveStrategyKey(resolved),
    roundingPolicy: (resolved['tax.rounding_policy'] as RoundingPolicy | undefined)
      ?? { mode: 'half_up', level: 'document' },
    scaleSystem: (resolved['format.amount_words_scale'] as ScaleSystem | undefined) ?? 'western',
  };
}

/** Buyer identity for the context: company overrides customer per-field,
 *  structurally mirroring issue_tax_document's «buyer-identity» block. */
async function fetchBuyerContext(customerId: string | null, companyId: string | null): Promise<{
  taxNumber: string | null; countryId: string | null; subdivisionId: string | null; isBusiness: boolean;
}> {
  let taxNumber: string | null = null;
  let countryId: string | null = null;
  let subdivisionId: string | null = null;
  if (customerId) {
    const { data, error } = await supabase
      .from('customers_enhanced')
      .select('tax_number, country_id, subdivision_id')
      .eq('id', customerId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    taxNumber = data?.tax_number ?? null;
    countryId = data?.country_id ?? null;
    subdivisionId = data?.subdivision_id ?? null;
  }
  if (companyId) {
    const { data, error } = await supabase
      .from('companies')
      .select('tax_number, country_id, subdivision_id')
      .eq('id', companyId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    taxNumber = data?.tax_number ?? taxNumber;
    countryId = data?.country_id ?? countryId;
    subdivisionId = data?.subdivision_id ?? subdivisionId;
  }
  return { taxNumber, countryId, subdivisionId, isBusiness: companyId !== null };
}

/** tax_authority_code → subdivision id for the seller country (empty for
 *  countries without GST-style authority codes, e.g. OM governorates). */
async function fetchSubdivisionAuthorityMap(countryId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('geo_subdivisions')
    .select('id, tax_authority_code')
    .eq('country_id', countryId)
    .eq('is_active', true)
    .is('deleted_at', null);
  if (error) throw error;
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.tax_authority_code) map.set(row.tax_authority_code, row.id);
  }
  return map;
}

export async function computeDocumentTotals(
  input: DocumentTotalsInput, rc: RateContext,
): Promise<{ computation: TaxComputation; placeOfSupplySubdivisionId: string | null; subtotal: number; taxAmount: number; totalAmount: number }> {
  registerAllRegimePlugins();
  const seller = await fetchSellerContext();
  const pack = await fetchPackContext(seller.tenantId);
  const hasBuyer = Boolean(input.customerId || input.companyId);
  const buyer = hasBuyer
    ? await fetchBuyerContext(input.customerId ?? null, input.companyId ?? null)
    : { taxNumber: null, countryId: null, subdivisionId: null, isBusiness: false };
  const authorityMap = hasBuyer
    ? await fetchSubdivisionAuthorityMap(seller.countryId)
    : new Map<string, string>();
  const pos = derivePlaceOfSupply({
    buyerTaxNumber: buyer.taxNumber,
    buyerSubdivisionId: buyer.subdivisionId,
    subdivisionIdByAuthorityCode: authorityMap,
  });
  const effective = await fetchEffectiveRates(seller.countryId, input.documentDate);
  // Collapse the slab bucket's per-UT SGST fan-out to one head per component
  // (scoped to the place of supply) BEFORE the kernel's split selects heads.
  const rates = scopeRatesToPlaceOfSupply(matchFormRate(effective, input.taxRate || 0), pos.subdivisionId);
  const lines = buildTaxableLines(input.items, rc.documentDecimals);
  const preDiscountSubtotal = lines.reduce(
    (s, l) => roundMoney(s + roundMoney(roundMoney(l.quantity * l.unitPrice, rc.documentDecimals) - l.lineDiscount, rc.documentDecimals), rc.documentDecimals), 0);
  const documentDiscount = input.discountType === 'percentage'
    ? roundMoney((preDiscountSubtotal * input.discountAmount) / 100, rc.documentDecimals)
    : input.discountAmount || 0;
  // rate 0 → untaxed document: mark lines out_of_scope so the kernel emits
  // zero-amount evidence rows, matching legacy "0% tax" exactly.
  const effectiveLines = rates.length === 0
    ? lines.map((l) => ({ ...l, treatment: 'out_of_scope' as const }))
    : lines;
  const ctx: TaxContext = {
    documentType: input.documentType,
    seller: {
      legalEntityId: seller.legalEntityId, countryId: seller.countryId, subdivisionId: seller.subdivisionId,
      taxIdentifier: seller.taxIdentifier, registrations: seller.registrations,
    },
    buyer: { ...buyer, addressSnapshot: null },
    taxPointDate: input.documentDate, placeOfSupplySubdivisionId: pos.subdivisionId,
    lines: effectiveLines, documentDiscount, taxInclusive: input.taxInclusive ?? false,
    rateContext: rc, rates,
    roundingPolicy: pack.roundingPolicy,
    scaleSystem: pack.scaleSystem,
  };
  const strategy = resolveTaxStrategy(pack.strategyKey); // pack.regime.tax → in_gst (kernel split) or simple_vat
  await assertGstRegistrationExplicit(pack.strategyKey, seller.registrations, input.documentDate);
  const computation = await strategy.compute(ctx);
  return { computation, placeOfSupplySubdivisionId: pos.subdivisionId, ...totalsFromComputation(computation, documentDiscount, rc.documentDecimals) };
}

export async function persistDocumentTaxLines(args: {
  tenantId: string; documentType: TaxDocumentType; documentId: string;
  computation: TaxComputation; rc: RateContext; lineItemIds?: Array<string | null>;
}): Promise<void> {
  const { tenantId, documentType, documentId, computation, rc, lineItemIds = [] } = args;
  const relabel = (sentinel: string | null): string | null => {
    if (sentinel === null) return null;
    const m = /^idx:(\d+)$/.exec(sentinel);
    if (!m) return sentinel;
    return lineItemIds[Number(m[1])] ?? null;
  };
  // Drafts recompute on every save: soft-delete previous snapshot, insert fresh.
  const { error: clearErr } = await supabase
    .from('document_tax_lines')
    .update({ deleted_at: new Date().toISOString() })
    .eq('document_type', documentType)
    .eq('document_id', documentId)
    .is('deleted_at', null);
  if (clearErr) throw clearErr;

  const rows = [...computation.rollups, ...computation.lines].map((l) => ({
    tenant_id: tenantId,
    document_type: documentType,
    document_id: documentId,
    line_item_id: relabel(l.lineItemId),
    component_code: l.componentCode,
    component_label: l.componentLabel,
    jurisdiction_ref: l.jurisdictionRef,
    rate: l.rate,
    taxable_base: l.taxableBase,
    tax_amount: l.taxAmount,
    currency: rc.documentCurrency,
    exchange_rate: rc.rate,
    tax_amount_base: convertToBase(l.taxAmount, rc.rate, rc.baseDecimals),
    tax_treatment: l.taxTreatment,
    treatment_reason_code: l.treatmentReasonCode,
    regime_key: computation.trace.regimeKey,
    plugin_version: computation.trace.pluginVersion,
    pack_version_id: computation.trace.packVersionId,
    rule_trace: l.lineItemId === null ? (computation.trace as unknown as Json) : null,
    backfilled: false,
    sequence: l.sequence,
  }));
  const roundOff = roundOffAdjustmentLine(computation);
  if (roundOff) {
    rows.push({
      tenant_id: tenantId, document_type: documentType, document_id: documentId,
      line_item_id: null, component_code: roundOff.componentCode, component_label: roundOff.componentLabel,
      jurisdiction_ref: null, rate: roundOff.rate, taxable_base: roundOff.taxableBase, tax_amount: roundOff.taxAmount,
      currency: rc.documentCurrency, exchange_rate: rc.rate,
      tax_amount_base: convertToBase(roundOff.taxAmount, rc.rate, rc.baseDecimals),
      tax_treatment: roundOff.taxTreatment, treatment_reason_code: roundOff.treatmentReasonCode,
      regime_key: computation.trace.regimeKey, plugin_version: computation.trace.pluginVersion,
      pack_version_id: computation.trace.packVersionId, rule_trace: null, backfilled: false, sequence: roundOff.sequence,
    });
  }
  const { error } = await supabase.from('document_tax_lines').insert(rows);
  if (error) throw error;
}

export async function issueTaxDocument(
  docType: TaxDocumentType, docId: string, dryRun = false,
): Promise<IssueTaxDocumentResult> {
  const { data, error } = await supabase.rpc('issue_tax_document', {
    p_doc_type: docType, p_doc_id: docId, p_dry_run: dryRun,
  });
  if (error) throw error;
  return data as unknown as IssueTaxDocumentResult;
}

/** Dry-run the issuance choke point: returns the computed component lines,
 *  totals, explain trace and requirement failures WITHOUT minting a number or
 *  writing anything. Powers pre-issue validation UI and the explain drawer.
 *  `requirement_failures` defaults to `[]` because the live RPC predates
 *  Task 18 (WP-5) — it doesn't return that key yet. */
export async function dryRunIssueTaxDocument(
  docType: 'quote' | 'invoice' | 'credit_note', docId: string,
): Promise<DryRunResult> {
  const { data, error } = await supabase.rpc('issue_tax_document', {
    p_doc_type: docType, p_doc_id: docId, p_dry_run: true,
  });
  if (error) throw error;
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    ok: d.ok === true,
    tax_lines: (d.tax_lines as unknown[]) ?? [],
    totals: (d.totals as Record<string, unknown>) ?? {},
    requirement_failures: (d.requirement_failures as RequirementFailure[]) ?? [],
    trace: d.trace ?? null,
  };
}

/** Turn a dry-run's requirement failures into an issuance decision: any `block`
 *  stops issuance; otherwise `warn`s require an explicit confirmation; a clean
 *  set proceeds. Pure — the UI renders the panel and dialog off this. */
export function classifyRequirementFailures(
  failures: RequirementFailure[],
): { kind: 'block' | 'confirm' | 'proceed'; messages: string[] } {
  const blocks = failures.filter((f) => f.level === 'block');
  if (blocks.length > 0) return { kind: 'block', messages: blocks.map((f) => f.message) };
  const warns = failures.filter((f) => f.level === 'warn');
  if (warns.length > 0) return { kind: 'confirm', messages: warns.map((f) => f.message) };
  return { kind: 'proceed', messages: [] };
}

/** Recover the requirement-failure payload from a raised P0403 error so the UI
 *  can render the panel even when the gate fires inside the DB (no dry-run — e.g.
 *  credit notes, or a race where the draft changed between dry-run and issue). */
export function parseRequirementFailures(errorMessage: string): RequirementFailure[] {
  const marker = 'REQUIREMENTS_NOT_MET:';
  const idx = errorMessage.indexOf(marker);
  if (idx === -1) return [];
  const jsonStart = errorMessage.indexOf('[', idx);
  if (jsonStart === -1) return [];
  try {
    const parsed = JSON.parse(errorMessage.slice(jsonStart)) as unknown;
    return Array.isArray(parsed) ? (parsed as RequirementFailure[]) : [];
  } catch {
    return [];
  }
}

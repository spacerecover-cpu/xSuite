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
import type {
  GeoCountryTaxRateRow, LegalEntityTaxRegistrationRow, RuleTrace,
  TaxComputation, TaxContext, TaxDocumentType, TaxableLine,
} from './regimes/types';

export interface DocumentTotalsInput {
  items: Array<{ description: string; quantity: number; unit_price: number; discount_percent?: number }>;
  discountType?: string | null;
  discountAmount: number;
  taxRate: number;
  documentType: TaxDocumentType;
  documentDate: string;
  taxInclusive?: boolean;
}

export interface IssueTaxDocumentResult {
  ok: boolean;
  document_number: string | null;
  issued_at: string | null;
  vat_record_ids: string[];
  einvoice_submission_id: string | null;
  requirement_failures: Array<{ field_key: string; level: 'block' | 'warn'; message: string }>;
  trace: RuleTrace | null;
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
 *  Exact match → the real rate rows (single-mode: subdivision-null standards).
 *  rate 0 → no components (untaxed doc, matches legacy 0%). Any other rate →
 *  ONE synthetic row id 'form:<rate>' so provenance shows a form override
 *  (Phase 2 replaces free rates with treatment selectors). */
export function matchFormRate(
  effective: GeoCountryTaxRateRow[], formRate: number,
): GeoCountryTaxRateRow[] {
  if (formRate === 0) return [];
  const standards = effective.filter((r) => r.tax_category === 'standard' && r.subdivision_id === null);
  const sum = standards.reduce((s, r) => s + r.rate, 0);
  if (standards.length > 0 && Math.abs(sum - formRate) < 1e-9) return standards;
  return [{
    id: `form:${formRate}`, country_id: standards[0]?.country_id ?? 'form', subdivision_id: null,
    component_code: standards[0]?.component_code ?? 'VAT',
    component_label: standards[0]?.component_label ?? 'VAT',
    tax_category: 'standard', rate: formRate, applies_to: null,
    valid_from: '1970-01-01', valid_to: null, sort_order: 0,
  }];
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
  legalEntityId: string; countryId: string; taxIdentifier: string | null;
  registrations: LegalEntityTaxRegistrationRow[];
}> {
  const { data: le, error } = await supabase
    .from('legal_entities')
    .select('id, country_id, tax_identifier')
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
    legalEntityId: le.id, countryId: le.country_id, taxIdentifier: le.tax_identifier,
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

export async function computeDocumentTotals(
  input: DocumentTotalsInput, rc: RateContext,
): Promise<{ computation: TaxComputation; subtotal: number; taxAmount: number; totalAmount: number }> {
  registerAllRegimePlugins();
  const seller = await fetchSellerContext();
  const effective = await fetchEffectiveRates(seller.countryId, input.documentDate);
  const rates = matchFormRate(effective, input.taxRate || 0);
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
      legalEntityId: seller.legalEntityId, countryId: seller.countryId, subdivisionId: null,
      taxIdentifier: seller.taxIdentifier, registrations: seller.registrations,
    },
    buyer: { taxNumber: null, countryId: null, subdivisionId: null, isBusiness: false, addressSnapshot: null },
    taxPointDate: input.documentDate, placeOfSupplySubdivisionId: null,
    lines: effectiveLines, documentDiscount, taxInclusive: input.taxInclusive ?? false,
    rateContext: rc, rates,
    roundingPolicy: { mode: 'half_up', level: 'document' },  // Oman parity default; pack-data override wires in Phase 2
    scaleSystem: 'western',
  };
  const strategy = resolveTaxStrategy('simple_vat'); // Phase 2: thread useRegimeConfig().tax
  const computation = await strategy.compute(ctx);
  return { computation, ...totalsFromComputation(computation, documentDiscount, rc.documentDecimals) };
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

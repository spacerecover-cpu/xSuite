//
// CANONICAL regime-plugin interface vocabulary for the Global Tenant Localization
// program (spec 2026-07-02, Part 2). These names/signatures are contract-locked:
// Phases 2-6 consume them verbatim. Do not rename without a program-level decision.
//
// Structural row types (GeoCountryTaxRateRow etc.) deliberately do NOT import the
// generated Database type: the kernel must stay pure and fixture-testable without
// a database. WP-2 Task 14 pins assignability of the generated Row types to these.

import type { RateContext } from '../currencyService';

export type SchemeMode = 'single' | 'split_by_place_of_supply' | 'jurisdiction_stack';

export type TaxCategory = 'standard' | 'reduced' | 'zero' | 'exempt';
export type TaxTreatment =
  'standard' | 'reduced' | 'zero_rated' | 'exempt' | 'reverse_charge' | 'out_of_scope';

export type RegimeClass =
  'render_artifact' | 'clearance_api' | 'chained_document' | 'certified_software' | 'filing_api';

export type TaxDocumentType = 'quote' | 'invoice' | 'credit_note' | 'stock_sale';

export interface RoundingPolicy {
  mode: 'half_up' | 'half_even';
  level: 'line' | 'document';
  cash_increment?: number;
}

export type ScaleSystem = 'western' | 'indian';

// ── Structural row shapes (kernel-pure mirrors of L1 tables) ──────────────────

export interface GeoCountryTaxRateRow {
  id: string;
  country_id: string;
  subdivision_id: string | null;
  component_code: string;
  component_label: string;
  tax_category: TaxCategory;
  rate: number;
  applies_to: string | null;
  valid_from: string;
  valid_to: string | null;
  sort_order: number;
}

export interface LegalEntityTaxRegistrationRow {
  id: string;
  legal_entity_id: string;
  country_id: string;
  subdivision_id: string | null;
  tax_number: string;
  scheme: 'standard' | 'composition' | 'unregistered';
  registered_from: string;
  registered_to: string | null;
  is_primary: boolean;
}

export interface VatRecordRow {
  id: string;
  record_type: string;
  record_id: string;
  vat_amount: number;
  vat_rate: number;
  tax_period: string | null;
  vat_amount_base: number | null;
  component_code: string | null;
  regime_key: string | null;
}

// ── Fact assembly (algorithm step 1) ──────────────────────────────────────────

export interface TaxableLine {
  lineItemId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  lineDiscount: number;
  unitCode: string | null;
  itemCode: string | null;
  treatment: TaxTreatment;
  treatmentReasonCode: string | null;
}

export interface TaxContext {
  documentType: TaxDocumentType;
  seller: {
    legalEntityId: string;
    countryId: string;
    subdivisionId: string | null;
    taxIdentifier: string | null;
    registrations: LegalEntityTaxRegistrationRow[];
  };
  buyer: {
    taxNumber: string | null;
    countryId: string | null;
    subdivisionId: string | null;
    isBusiness: boolean;
    addressSnapshot: Record<string, unknown> | null;
  };
  taxPointDate: string;
  placeOfSupplySubdivisionId: string | null;
  lines: TaxableLine[];
  documentDiscount: number;
  taxInclusive: boolean;
  rateContext: RateContext;
  rates: GeoCountryTaxRateRow[];
  roundingPolicy: RoundingPolicy;
  scaleSystem: ScaleSystem;
}

// ── Computation output ────────────────────────────────────────────────────────

export interface ComputedTaxLine {
  lineItemId: string | null;
  componentCode: string;
  componentLabel: string;
  jurisdictionRef: string | null;
  rate: number;
  taxableBase: number;
  taxAmount: number;
  taxTreatment: TaxTreatment;
  treatmentReasonCode: string | null;
  sequence: number;
}

export interface DocumentNotation {
  code: string;
  text: string;
  textTranslated?: string;
}

export interface TaxComputation {
  lines: ComputedTaxLine[];
  rollups: ComputedTaxLine[];
  totals: {
    taxableBase: number;
    taxTotal: number;
    grandTotal: number;
    roundingAdjustment: number | null;
  };
  expectedWithholding: number | null;
  notations: DocumentNotation[];
  trace: RuleTrace;
}

// ── Deterministic trace (graft 5) ─────────────────────────────────────────────

export interface RuleTrace {
  regimeKey: string;
  pluginVersion: string;
  packVersionId: string | null;
  schemeMode: SchemeMode;
  steps: RuleTraceStep[];
}
export type RuleTraceStep =
  | { op: 'rate_match';           rateRowId: string; componentCode: string; rate: number; validFrom: string }
  | { op: 'scheme_decision';      mode: SchemeMode; detail: string }
  | { op: 'discount_allocation';  method: 'largest_remainder'; shares: number[]; remainders: number[] }
  | { op: 'inclusive_backout';    gross: number; sumRates: number; base: number }
  | { op: 'treatment';            lineItemId: string | null; treatment: TaxTreatment; reasonCode: string | null }
  | { op: 'rounding';             policy: RoundingPolicy; before: number; after: number }
  | { op: 'cash_rounding';        increment: number; adjustment: number };

// ── Plugin interfaces (L3) ────────────────────────────────────────────────────

export interface TaxStrategy {
  readonly key: string;
  readonly version: string;
  readonly schemeMode: SchemeMode;
  readonly defaults: { roundingPolicy: RoundingPolicy; scaleSystem: ScaleSystem };
  compute(ctx: TaxContext): TaxComputation | Promise<TaxComputation>;
}

export interface ComposedReturn {
  boxes: ReturnBoxLine[];
  meta: Record<string, unknown>;
}
export interface ReturnBoxLine {
  boxCode: string; boxLabel: string; amountBase: number;
  quantity?: number; unitCode?: string;
  meta?: Record<string, unknown>; sequence: number;
}
export interface ReturnComposer {
  readonly key: string;
  readonly version: string;
  periodBounds(
    filingFrequency: 'monthly' | 'quarterly' | 'annual',
    periodAnchor: string,
    forDate: string, timezone: string,
  ): { periodStart: string; periodEnd: string; taxPeriods: string[] };
  compose(input: {
    tenantId: string; legalEntityId: string;
    taxPeriods: string[];
    ledgerRows: VatRecordRow[];
    jurisdictionCurrency: string; baseCurrency: string;
  }): ComposedReturn;
}

export interface NumberSequenceSeed {
  scope: string;
  prefix: string | null;
  format_template: string | null;
  reset_basis: 'never' | 'calendar_year' | 'fiscal_year';
  fiscal_year_anchor: string | null;
  max_length: number | null;
  padding: number;
}
export interface NumberingPolicy {
  readonly key: string;
  readonly version: string;
  defaultSequences(country: { countryCode: string; fiscalYearStart: string }): NumberSequenceSeed[];
}

export interface DocumentComplianceProfile {
  readonly key: string;
  readonly version: string;
  documentTitle(ctx: {
    docType: TaxDocumentType; sellerRegistered: boolean; taxInvoiceRequired: boolean;
  }): { title: string; titleTranslated: string | null };
  requiresTaxInvoiceCeremony: boolean;
  showRegistrationBand: boolean;
  forcedColumns: Array<'item_code' | 'unit_code'>;
  bilingual: { enabled: boolean; secondaryLanguage: string | null; arabicLead: boolean };
  paperSize: 'A4' | 'Letter';
  notations(computation: TaxComputation): DocumentNotation[];
}

export interface IssuedDocumentSnapshot {
  documentType: TaxDocumentType;
  documentId: string;
  documentNumber: string;
  issuedAt: string;
  currency: string;
  totals: { taxableBase: number; taxTotal: number; grandTotal: number };
  taxLines: ComputedTaxLine[];
  sellerTaxIdentifier: string | null;
  buyerTaxNumber: string | null;
}

export interface EInvoicingTransport {
  readonly key: string;
  readonly version: string;
  readonly regimeClass: RegimeClass;
  buildArtifact(doc: IssuedDocumentSnapshot):
    { artifactType: string; payload: Uint8Array | string; payloadHash: string };
}

export interface PayrollPack {
  readonly key: string;
  readonly version: string;
  statutoryComponents(ctx: { countryId: string; asOf: string }): Array<{
    componentCode: string; kind: 'earning' | 'deduction' | 'employer_contribution';
    rate: number | null; base: 'gross' | 'basic'; mandatory: boolean;
  }>;
  bankFileOps: string[];
}

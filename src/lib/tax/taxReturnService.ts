// Orchestrates: resolved country config → ReturnComposer → vat_records subledger
// → file_vat_return RPC. The ONLY period dimension anywhere in this file is
// vat_records.tax_period — never created_at (the vatService.ts:279 drift class).
import { supabase } from '../supabaseClient';
import { resolveReturnComposer } from '../regimes/registry';
import { registerAllRegimePlugins } from '../regimes/register';
import { taxPeriodsBetween } from '../regimes/gcc_return';
import { composeGstrSupplementaryBoxes } from '../vatService';
import { roundMoney } from '../financialMath';
import { tenantToday } from '../tenantToday';
import type { ComposedReturn, ReturnBoxLine } from '../regimes/types';
import type { Database, Json } from '../../types/database.types';

export type VatReturnRow = Database['public']['Tables']['vat_returns']['Row'];
export type TaxReturnLineRow = Database['public']['Tables']['tax_return_lines']['Row'];
export type VatRecordRow = Database['public']['Tables']['vat_records']['Row'];

export { taxPeriodsBetween };

export interface FilingConfig {
  composerKey: string;
  filingFrequency: 'monthly' | 'quarterly' | 'annual';
  periodAnchor: string;
  timezone: string;
  baseCurrency: string;
  jurisdictionCurrency: string;
  legalEntityId: string;
}

export interface ComposedReturnPreview {
  periodStart: string;
  periodEnd: string;
  taxPeriods: string[];
  composed: ComposedReturn;
  outputVat: number;
  inputVat: number;
  netVat: number;
  regimeKey: string;
  filingFrequency: string;
  periodAnchor: string;
}

export function boxAmount(composed: ComposedReturn, boxCode: string): number {
  return composed.boxes.find((b) => b.boxCode === boxCode)?.amountBase ?? 0;
}

export async function getFilingConfig(tenantId: string): Promise<FilingConfig> {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, timezone, base_currency_code, resolved_country_config')
    .eq('id', tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`getFilingConfig: tenant ${tenantId} not found`);

  const { data: entity, error: entityError } = await supabase
    .from('legal_entities')
    .select('id, currency_code')
    .eq('tenant_id', tenantId)
    .eq('is_primary', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (entityError) throw entityError;
  if (!entity) throw new Error('getFilingConfig: no primary legal entity for tenant — cannot resolve the filing jurisdiction');
  if (!entity.currency_code) {
    throw new Error('getFilingConfig: primary legal entity has no currency_code — the jurisdiction filing currency is undetermined');
  }

  const cfg = (data.resolved_country_config ?? {}) as unknown as Record<string, unknown>;
  return {
    composerKey: (cfg['tax.return_composer'] as string) ?? 'gcc_return',
    filingFrequency: ((cfg['tax.filing_frequency'] as FilingConfig['filingFrequency']) ?? 'quarterly'),
    periodAnchor: (cfg['tax.period_anchor'] as string) ?? '01-01',
    timezone: data.timezone,
    baseCurrency: data.base_currency_code,
    jurisdictionCurrency: entity.currency_code,
    legalEntityId: entity.id,
  };
}

// Data-keyed supplementary sources (NOT country branching — the key comes from the
// tenant's resolved pack config). gstr appends GSTR-3B Table 3.2 + GSTR-1 Table 12,
// which need invoice-level dimensions the amount-only ledger cannot provide (AD-4).
const SUPPLEMENTARY_BOX_SOURCES: Record<
  string,
  (taxPeriods: string[], startSequence: number) => Promise<ReturnBoxLine[]>
> = {
  gstr: composeGstrSupplementaryBoxes,
};

export async function composeReturnForDate(tenantId: string, forDate?: string): Promise<ComposedReturnPreview> {
  registerAllRegimePlugins();
  const cfg = await getFilingConfig(tenantId);
  const composer = resolveReturnComposer(cfg.composerKey);
  const bounds = composer.periodBounds(
    cfg.filingFrequency,
    cfg.periodAnchor,
    forDate ?? tenantToday(cfg.timezone),
    cfg.timezone,
  );
  const { data: rows, error } = await supabase
    .from('vat_records')
    .select('*')
    .in('tax_period', bounds.taxPeriods)
    .is('deleted_at', null);
  if (error) throw error;
  const ledgerRows = rows ?? [];

  const composed = composer.compose({
    tenantId,
    legalEntityId: cfg.legalEntityId,
    taxPeriods: bounds.taxPeriods,
    ledgerRows: ledgerRows as unknown as import('../regimes/types').VatRecordRow[],
    jurisdictionCurrency: cfg.jurisdictionCurrency,
    baseCurrency: cfg.baseCurrency,
  });

  const supplementary = SUPPLEMENTARY_BOX_SOURCES[cfg.composerKey];
  if (supplementary) {
    const startSequence = composed.boxes.reduce((m, b) => Math.max(m, b.sequence), 0) + 1;
    composed.boxes.push(...(await supplementary(bounds.taxPeriods, startSequence)));
  }

  // Composer-agnostic header totals, mirroring file_vat_return's authoritative
  // re-derivation EXACTLY (SUM(vat_amount_base) by record_type over the same
  // tax_period rows) — the RPC RAISEs on >0.0001 divergence, and the previous
  // boxAmount('BOX_1_OUTPUT') lookup is a gcc-only vocabulary (0 for gstr).
  const outputVat = roundMoney(
    ledgerRows.filter((r) => r.record_type === 'sale').reduce((s, r) => s + Number(r.vat_amount_base ?? 0), 0), 4);
  const inputVat = roundMoney(
    ledgerRows.filter((r) => r.record_type === 'purchase').reduce((s, r) => s + Number(r.vat_amount_base ?? 0), 0), 4);

  return {
    ...bounds,
    composed,
    outputVat,
    inputVat,
    netVat: roundMoney(outputVat - inputVat, 4),
    regimeKey: cfg.composerKey,
    filingFrequency: cfg.filingFrequency,
    periodAnchor: cfg.periodAnchor,
  };
}

export async function fileReturn(preview: ComposedReturnPreview, status: 'draft' | 'review'): Promise<VatReturnRow> {
  const { data, error } = await supabase.rpc('file_vat_return', {
    p_return: {
      period_start: preview.periodStart,
      period_end: preview.periodEnd,
      output_vat: preview.outputVat,
      input_vat: preview.inputVat,
      net_vat: preview.netVat,
      status,
      regime_key: preview.regimeKey,
      filing_frequency: preview.filingFrequency,
      period_anchor: preview.periodAnchor,
    } as unknown as Json,
    p_lines: preview.composed.boxes as unknown as Json,
    p_tax_periods: preview.taxPeriods,
  });
  if (error) throw error;
  return data as VatReturnRow;
}

export async function getReturnLines(vatReturnId: string): Promise<TaxReturnLineRow[]> {
  const { data, error } = await supabase
    .from('tax_return_lines')
    .select('*')
    .eq('vat_return_id', vatReturnId)
    .is('deleted_at', null)
    .order('sequence', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Drill-down MUST query the same dimension the return was composed on:
 *  tax_period months derived from the persisted period bounds. */
export async function getReturnLedgerRows(
  vatReturn: Pick<VatReturnRow, 'period_start' | 'period_end'>,
): Promise<VatRecordRow[]> {
  const periods = taxPeriodsBetween(vatReturn.period_start.slice(0, 7), vatReturn.period_end.slice(0, 7));
  const { data, error } = await supabase
    .from('vat_records')
    .select('*')
    .in('tax_period', periods)
    .is('deleted_at', null)
    .order('tax_period', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

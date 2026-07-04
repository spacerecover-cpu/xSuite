// Orchestrates: resolved country config → ReturnComposer → vat_records subledger
// → file_vat_return RPC. The ONLY period dimension anywhere in this file is
// vat_records.tax_period — never created_at (the vatService.ts:279 drift class).
import { supabase } from '../supabaseClient';
import { resolveReturnComposer } from '../regimes/registry';
import { taxPeriodsBetween } from '../regimes/gcc_return';
import { tenantToday } from '../tenantToday';
import type { ComposedReturn } from '../regimes/types';
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

export async function composeReturnForDate(tenantId: string, forDate?: string): Promise<ComposedReturnPreview> {
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

  const composed = composer.compose({
    tenantId,
    legalEntityId: cfg.legalEntityId,
    taxPeriods: bounds.taxPeriods,
    ledgerRows: (rows ?? []) as unknown as import('../regimes/types').VatRecordRow[],
    jurisdictionCurrency: cfg.jurisdictionCurrency,
    baseCurrency: cfg.baseCurrency,
  });

  return {
    ...bounds,
    composed,
    outputVat: boxAmount(composed, 'BOX_1_OUTPUT'),
    inputVat: boxAmount(composed, 'BOX_2_INPUT'),
    netVat: boxAmount(composed, 'BOX_3_NET'),
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

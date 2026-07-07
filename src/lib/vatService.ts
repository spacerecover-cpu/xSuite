import { supabase } from './supabaseClient';
import { gccReturnComposer, taxPeriodsBetween } from './regimes/gcc_return';
import { roundMoney } from './financialMath';
import { composeGstr1HsnSummary, type HsnLineAggregate } from './regimes/gstr/hsnSummary';
import { composeGstr3bTable32, type InterStateB2CAggregate } from './regimes/gstr/table32';
import type { ReturnBoxLine } from './regimes/types';

export interface VATRecord {
  id?: string;
  record_type: string;
  record_id: string;
  vat_amount: number;
  vat_rate: number;
  tax_period?: string | null;
  created_at?: string;
  deleted_at?: string | null;
  vat_amount_base?: number | null;
  taxable_amount_base?: number | null;
  currency?: string | null;
  exchange_rate?: number | null;
}

export interface VATReturn {
  id?: string;
  period_start: string;
  period_end: string;
  output_vat: number;
  input_vat: number;
  net_vat: number;
  status: 'draft' | 'review' | 'submitted' | 'paid';
  submitted_at?: string | null;
  submitted_by?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface VATSummary {
  totalOutputVAT: number;
  totalInputVAT: number;
  netVAT: number;
  recordCount: number;
}

export const fetchVATRecords = async (filters?: {
  recordType?: string;
  dateFrom?: string;
  dateTo?: string;
}) => {
  let query = supabase
    .from('vat_records')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (filters?.recordType && filters.recordType !== 'all') {
    query = query.eq('record_type', filters.recordType);
  }

  if (filters?.dateFrom) {
    query = query.gte('created_at', filters.dateFrom);
  }

  if (filters?.dateTo) {
    query = query.lte('created_at', filters.dateTo);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

export const fetchVATReturns = async (filters?: {
  status?: string;
  year?: number;
}) => {
  let query = supabase
    .from('vat_returns')
    .select('*')
    .is('deleted_at', null)
    .order('period_end', { ascending: false });

  if (filters?.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  }

  if (filters?.year) {
    const startDate = `${filters.year}-01-01`;
    const endDate = `${filters.year}-12-31`;
    query = query.gte('period_start', startDate).lte('period_end', endDate);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

export const fetchVATReturnById = async (id: string) => {
  const { data, error } = await supabase
    .from('vat_returns')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const calculateVATForPeriod = async (
  periodStart: string,
  periodEnd: string
): Promise<VATSummary> => {
  // EXP-024-fx/EXP-032: bucket by the economic month (tax_period, YYYY-MM) not created_at,
  // so an expense approved in a later month still reports in its expense-date period. Rows
  // with a NULL tax_period fall back to created_at bucketing (no silent data loss). Verified
  // safe for sales: every live 'sale' row's tax_period month == created_at month.
  const startMonth = periodStart.slice(0, 7);
  const endMonth = periodEnd.slice(0, 7);
  const { data: records, error } = await supabase
    .from('vat_records')
    .select('record_type, vat_amount, vat_amount_base, tax_period, created_at')
    .is('deleted_at', null)
    .or(
      `and(tax_period.gte.${startMonth},tax_period.lte.${endMonth}),` +
      `and(tax_period.is.null,created_at.gte.${periodStart},created_at.lte.${periodEnd})`,
    );

  if (error) throw error;

  const sales = records?.filter(r => r.record_type === 'sale') || [];
  const purchases = records?.filter(r => r.record_type === 'purchase') || [];

  const totalOutputVAT = sales.reduce((sum, r) => sum + (r.vat_amount_base ?? r.vat_amount ?? 0), 0);
  const totalInputVAT = purchases.reduce((sum, r) => sum + (r.vat_amount_base ?? r.vat_amount ?? 0), 0);
  const netVAT = totalOutputVAT - totalInputVAT;

  return {
    totalOutputVAT,
    totalInputVAT,
    netVAT,
    recordCount: records?.length || 0,
  };
};

export const createVATReturn = async (
  vatReturn: Omit<VATReturn, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>
) => {
  const { data, error } = await supabase
    .from('vat_returns')
    .insert([vatReturn as never])
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const createVATReturnFromPeriod = async (
  periodStart: string,
  periodEnd: string
) => {
  const summary = await calculateVATForPeriod(periodStart, periodEnd);

  return createVATReturn({
    period_start: periodStart,
    period_end: periodEnd,
    output_vat: summary.totalOutputVAT,
    input_vat: summary.totalInputVAT,
    net_vat: summary.netVAT,
    status: 'draft',
  });
};

export const updateVATReturn = async (
  id: string,
  vatReturn: Partial<VATReturn>
) => {
  const { data, error } = await supabase
    .from('vat_returns')
    .update(vatReturn)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const updateVATReturnStatus = async (
  id: string,
  status: VATReturn['status'],
  submittedBy?: string
) => {
  const updateData: Partial<VATReturn> = { status };

  if (status === 'submitted' && submittedBy) {
    updateData.submitted_at = new Date().toISOString();
    updateData.submitted_by = submittedBy;
  }

  return updateVATReturn(id, updateData);
};

export const deleteVATReturn = async (id: string) => {
  const { error } = await supabase
    .from('vat_returns')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
};

export const createVATRecord = async (
  record: Omit<VATRecord, 'id' | 'created_at' | 'deleted_at'>
) => {
  const { data, error } = await supabase
    .from('vat_records')
    .insert([record as never])
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const createVATRecordFromInvoice = async (
  invoiceId: string,
  invoiceData: {
    tax_amount: number;
    tax_rate: number;
  }
) => {
  return createVATRecord({
    record_type: 'sale',
    record_id: invoiceId,
    vat_amount: invoiceData.tax_amount,
    vat_rate: invoiceData.tax_rate,
  });
};

/** D1 — record INPUT (purchase) VAT so vat_returns.input_vat is non-zero and the
 *  net VAT filed with the authority is correct. Source: expenses / purchase orders
 *  carrying a tax_amount. Mirrors createVATRecordFromInvoice but record_type='purchase'. */
export const createVATRecordFromPurchase = async (
  purchaseId: string,
  purchaseData: { tax_amount: number; tax_rate: number },
) => {
  return createVATRecord({
    record_type: 'purchase',
    record_id: purchaseId,
    vat_amount: purchaseData.tax_amount,
    vat_rate: purchaseData.tax_rate,
  });
};

export const getVATStats = async (filters?: {
  dateFrom?: string;
  dateTo?: string;
}) => {
  const dateFrom = filters?.dateFrom || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
  const dateTo = filters?.dateTo || new Date().toISOString().split('T')[0];

  const summary = await calculateVATForPeriod(dateFrom, dateTo);

  const { data: returns } = await supabase
    .from('vat_returns')
    .select('status')
    .is('deleted_at', null)
    .gte('period_start', dateFrom)
    .lte('period_end', dateTo);

  return {
    ...summary,
    draftReturns: returns?.filter(r => r.status === 'draft').length || 0,
    submittedReturns: returns?.filter(r => r.status === 'submitted').length || 0,
    paidReturns: returns?.filter(r => r.status === 'paid').length || 0,
  };
};

export const getVATRecordsByReturn = async (
  periodStart: string,
  periodEnd: string
) => {
  // Same period dimension the return totals were composed on (tax_period-first,
  // matching calculateVATForPeriod's bucketing) — never created_at, which
  // diverges for late-approved expenses (audit finding vatService.ts:279).
  const taxPeriods = taxPeriodsBetween(periodStart.slice(0, 7), periodEnd.slice(0, 7));
  const { data, error } = await supabase
    .from('vat_records')
    .select('*')
    .in('tax_period', taxPeriods)
    .is('deleted_at', null)
    .order('tax_period', { ascending: true });

  if (error) throw error;
  return data || [];
};

export const getQuarterlyVATSummary = async (year: number, periodAnchor: string = '01-01') => {
  // Quarter windows derived from the pack's period anchor via the composer —
  // no hardcoded Jan/Apr/Jul/Oct calendar quarters (audit finding vatService.ts:288).
  const anchorMonth = periodAnchor.slice(0, 2);
  const summaries = [] as Array<{ quarter: number } & VATSummary>;
  for (let q = 1; q <= 4; q++) {
    const probeMonthNum = ((Number(anchorMonth) - 1 + (q - 1) * 3) % 12) + 1;
    const probeYear = year + Math.floor((Number(anchorMonth) - 1 + (q - 1) * 3) / 12);
    const probe = `${probeYear}-${String(probeMonthNum).padStart(2, '0')}-15`;
    const bounds = gccReturnComposer.periodBounds('quarterly', periodAnchor, probe, 'UTC');
    const summary = await calculateVATForPeriod(bounds.periodStart, bounds.periodEnd);
    summaries.push({ quarter: q, ...summary });
  }
  return summaries;
};

/**
 * GSTR-1 Table 12 source (AD-4): line-level HSN/SAC aggregates for the invoices whose
 * ledger rows fall in the given tax periods. tax_period is THE period dimension —
 * never created_at.
 */
export const fetchHsnLineAggregates = async (taxPeriods: string[]): Promise<HsnLineAggregate[]> => {
  const { data: ledger, error: ledgerError } = await supabase
    .from('vat_records')
    .select('source_document_id')
    .eq('record_type', 'sale')
    .eq('source_document_type', 'invoice')
    .in('tax_period', taxPeriods)
    .is('deleted_at', null);
  if (ledgerError) throw ledgerError;
  const invoiceIds = [...new Set((ledger ?? []).map((r) => r.source_document_id).filter(Boolean))] as string[];
  if (invoiceIds.length === 0) return [];

  const { data: lines, error: linesError } = await supabase
    .from('invoice_line_items')
    .select('id, invoice_id, item_code, unit_code, quantity')
    .in('invoice_id', invoiceIds)
    .is('deleted_at', null);        // updateInvoice soft-deletes + re-inserts lines on every
                                    // edit — without this, stale rows double-count Table 12 qty
  if (linesError) throw linesError;

  const { data: taxLines, error: taxError } = await supabase
    .from('document_tax_lines')
    .select('line_item_id, component_code, taxable_base, tax_amount_base, exchange_rate')
    .eq('document_type', 'invoice')
    .in('document_id', invoiceIds)
    .not('line_item_id', 'is', null)
    .is('deleted_at', null);
  if (taxError) throw taxError;

  const byLine = new Map<string, { taxable: number; counted: boolean; components: Record<string, number> }>();
  for (const t of taxLines ?? []) {
    const key = t.line_item_id as string;
    const agg = byLine.get(key) ?? { taxable: 0, counted: false, components: {} };
    if (!agg.counted) {
      // taxable_base is document-currency; convert once at the row's frozen rate.
      // Counted ONCE per line — the CGST/SGST pair shares the line's base.
      agg.taxable = roundMoney(Number(t.taxable_base ?? 0) * Number(t.exchange_rate ?? 1), 2);
      agg.counted = true;
    }
    agg.components[t.component_code] = roundMoney(
      (agg.components[t.component_code] ?? 0) + Number(t.tax_amount_base ?? 0), 2,
    );
    byLine.set(key, agg);
  }

  return (lines ?? [])
    .filter((l) => l.item_code)
    .map((l) => {
      const tax = byLine.get(l.id) ?? { taxable: 0, counted: false, components: {} };
      return {
        itemCode: l.item_code as string,
        unitCode: (l.unit_code as string | null) ?? null,
        quantity: Number(l.quantity ?? 0),
        taxableBase: tax.taxable,
        componentTaxBase: tax.components,
      };
    });
};

/**
 * GSTR-3B Table 3.2 source: inter-state (IGST) supplies to unregistered buyers
 * (invoices.buyer_tax_number IS NULL), grouped by place-of-supply state.
 *
 * Filtered to component_code='IGST' + source_document_type='invoice', so this is GROSS
 * of credit notes — matching the gross 3.1(a) box (the live head-less CN contra carries
 * no component/source, so it is excluded here AND from 3.1(a); the two reconcile). Exact
 * credit-note / advance netting of both is WP-L4's domain — do NOT assume CN contras net
 * here (they don't).
 *
 * An inter-state B2C invoice with NO place-of-supply is bucketed under an explicit
 * 'unknown' state rather than silently dropped, so Table 3.2 still reconciles with the
 * IGST already counted in gross 3.1(a) and the missing PoS is visible (e.g. the
 * convert_proforma PoS-drop, or a walk-in buyer with no address).
 */
const UNKNOWN_POS = { stateCode: '00', stateName: 'Unknown / unspecified place of supply' } as const;

export const fetchInterStateB2CAggregates = async (taxPeriods: string[]): Promise<InterStateB2CAggregate[]> => {
  const { data: ledger, error: ledgerError } = await supabase
    .from('vat_records')
    .select('source_document_id, taxable_amount_base, vat_amount_base')
    .eq('record_type', 'sale')
    .eq('component_code', 'IGST')
    .eq('source_document_type', 'invoice')
    .in('tax_period', taxPeriods)
    .is('deleted_at', null);
  if (ledgerError) throw ledgerError;
  const perInvoice = new Map<string, { taxable: number; igst: number }>();
  for (const r of ledger ?? []) {
    if (!r.source_document_id) continue;
    const agg = perInvoice.get(r.source_document_id) ?? { taxable: 0, igst: 0 };
    agg.taxable += Number(r.taxable_amount_base ?? 0);
    agg.igst += Number(r.vat_amount_base ?? 0);
    perInvoice.set(r.source_document_id, agg);
  }
  if (perInvoice.size === 0) return [];

  const { data: invoices, error: invError } = await supabase
    .from('invoices')
    .select('id, buyer_tax_number, place_of_supply_subdivision_id')
    .in('id', [...perInvoice.keys()])
    .is('buyer_tax_number', null)                            // B2C = unregistered buyer
    .is('deleted_at', null);
  if (invError) throw invError;
  if ((invoices ?? []).length === 0) return [];

  const subIds = [...new Set((invoices ?? []).map((i) => i.place_of_supply_subdivision_id).filter(Boolean))] as string[];
  const subById = new Map<string, { id: string; name: string; code: string; tax_authority_code: string | null }>();
  if (subIds.length > 0) {
    const { data: subs, error: subError } = await supabase
      .from('geo_subdivisions')
      .select('id, name, code, tax_authority_code')
      .in('id', subIds);
    if (subError) throw subError;
    for (const s of subs ?? []) subById.set(s.id, s);
  }

  const byState = new Map<string, InterStateB2CAggregate>();
  for (const inv of invoices ?? []) {
    const amounts = perInvoice.get(inv.id);
    if (!amounts) continue;
    const sub = inv.place_of_supply_subdivision_id ? subById.get(inv.place_of_supply_subdivision_id) : undefined;
    const stateCode = sub ? (sub.tax_authority_code ?? sub.code) : UNKNOWN_POS.stateCode;
    const stateName = sub ? sub.name : UNKNOWN_POS.stateName;
    const agg = byState.get(stateCode) ?? { stateCode, stateName, taxableBase: 0, igstBase: 0 };
    agg.taxableBase = roundMoney(agg.taxableBase + amounts.taxable, 2);
    agg.igstBase = roundMoney(agg.igstBase + amounts.igst, 2);
    byState.set(stateCode, agg);
  }
  return [...byState.values()];
};

/**
 * Everything the GSTR return needs beyond the ledger-only composer: Table 3.2
 * (part of the 3B) first, then the GSTR-1 Table 12 HSN annexure. Sequences
 * continue from startSequence so persisted tax_return_lines never collide.
 *
 * Known scaling limit: the underlying fetches pass the period's invoice-id set into
 * PostgREST `.in()` filters unchunked. A period with many hundreds of invoices could
 * overrun the request URL length (→ 414, a LOUD hard-fail, never a wrong amount). Fine
 * for the target lab volumes; batch the `.in()` lists if a high-volume tenant appears.
 */
export const composeGstrSupplementaryBoxes = async (
  taxPeriods: string[],
  startSequence: number,
): Promise<ReturnBoxLine[]> => {
  const t32 = composeGstr3bTable32(await fetchInterStateB2CAggregates(taxPeriods), startSequence);
  const hsn = composeGstr1HsnSummary(await fetchHsnLineAggregates(taxPeriods), startSequence + t32.length);
  return [...t32, ...hsn];
};

export const vatService = {
  fetchVATRecords,
  fetchVATReturns,
  fetchVATReturnById,
  calculateVATForPeriod,
  createVATReturn,
  createVATReturnFromPeriod,
  updateVATReturn,
  updateVATReturnStatus,
  deleteVATReturn,
  createVATRecord,
  createVATRecordFromInvoice,
  createVATRecordFromPurchase,
  getVATStats,
  getVATRecordsByReturn,
  getQuarterlyVATSummary,
  fetchHsnLineAggregates,
  fetchInterStateB2CAggregates,
  composeGstrSupplementaryBoxes,
};

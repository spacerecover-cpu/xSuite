import { supabase } from './supabaseClient';
import { logAuditTrail } from './auditTrailService';
import { resolveRateContext } from './currencyService';
import { computeDocumentTotals, persistDocumentTaxLines, issueTaxDocument } from './taxDocumentService';
import { buildAdvanceVoucherTotalsInput } from './regimes/in_gst/advanceVoucher';
import { computeUnappliedBalance } from './advanceApply';

export interface HeldAdvance {
  id: string;
  payment_number: string | null;
  amount: number;
  currency: string | null;
  unappliedBalance: number;
}

/**
 * Case-scoped HELD advances: payment_kind='advance' payments on the case with a
 * remaining (unapplied) balance. The record-payment write path stamps case_id on
 * the payment, so we can read payments directly here (unlike getCasePayments,
 * which resolves settled payments through allocations→invoices). Unapplied
 * balance = amount − Σ(payment_allocations); only advances with balance > 0 are
 * returned so a fully-netted advance drops out of the picker.
 */
export async function getHeldAdvancesForCase(caseId: string): Promise<HeldAdvance[]> {
  const { data: advances, error } = await supabase
    .from('payments')
    .select('id, payment_number, amount, currency, payment_kind')
    .eq('case_id', caseId)
    .eq('payment_kind', 'advance')
    .is('deleted_at', null);
  if (error) throw error;
  const rows = advances ?? [];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const { data: allocs, error: aErr } = await supabase
    .from('payment_allocations')
    .select('payment_id, amount')
    .in('payment_id', ids)
    .is('deleted_at', null);
  if (aErr) throw aErr;

  const byPayment = new Map<string, { amount: number | string | null }[]>();
  for (const a of allocs ?? []) {
    const list = byPayment.get(a.payment_id) ?? [];
    list.push({ amount: a.amount });
    byPayment.set(a.payment_id, list);
  }

  // Re-review RC1: an issued Refund Voucher returns advance money WITHOUT an
  // allocation, so it must also reduce the held balance — else refunded money
  // still shows as applyable (double-use + double GST reversal). The DB
  // apply_advance_to_invoice guard is the authoritative backstop; this keeps the
  // picker honest so the Apply button never appears for refunded money.
  const { data: refunds, error: rvErr } = await supabase
    .from('advance_vouchers')
    .select('payment_id, total_amount')
    .in('payment_id', ids)
    .eq('voucher_type', 'refund')
    .eq('status', 'issued')
    .is('deleted_at', null);
  if (rvErr) throw rvErr;
  const refundedByPayment = new Map<string, number>();
  for (const rv of refunds ?? []) {
    refundedByPayment.set(rv.payment_id, (refundedByPayment.get(rv.payment_id) ?? 0) + Number(rv.total_amount ?? 0));
  }

  return rows
    .map((r) => {
      const amount = Number(r.amount) || 0;
      const unapplied = computeUnappliedBalance(amount, byPayment.get(r.id) ?? []);
      return {
        id: r.id,
        payment_number: r.payment_number ?? null,
        amount,
        currency: r.currency ?? null,
        unappliedBalance: unapplied - (refundedByPayment.get(r.id) ?? 0),
      };
    })
    .filter((r) => r.unappliedBalance > 0);
}

export interface AdvancePaymentInput {
  amount: number; payment_date: string; currency?: string | null; exchange_rate?: number;
  customer_id?: string | null; company_id?: string | null; case_id?: string | null;
  payment_method_id?: string | null; bank_account_id?: string | null;
  reference?: string | null; notes?: string | null;
}

export async function createAdvancePayment(input: AdvancePaymentInput) {
  const rc = await resolveRateContext(
    input.currency, input.payment_date, input.exchange_rate ? { rate: input.exchange_rate } : null);
  const { data, error } = await supabase.rpc('record_payment', {
    p_payment: {
      kind: 'advance',
      amount: input.amount, currency: rc.documentCurrency, exchange_rate: rc.rate, rate_source: rc.rateSource,
      payment_date: input.payment_date, customer_id: input.customer_id ?? null, case_id: input.case_id ?? null,
      payment_method_id: input.payment_method_id ?? null, bank_account_id: input.bank_account_id ?? null,
      reference: input.reference ?? null, status: 'completed', notes: input.notes ?? null,
    },
    p_allocations: [],
  });
  if (error) throw error;
  if (!data) throw new Error('Failed to record advance payment');
  await logAuditTrail('create', 'payments', data.id, {}, { payment_number: data.payment_number, kind: 'advance', amount: input.amount });
  return data;
}

export interface ReceiptVoucherDraft {
  payment_id: string; tenant_id: string; case_id?: string | null;
  customer_id?: string | null; company_id?: string | null;
  advance_amount: number; currency: string; payment_date: string;
  place_of_supply_subdivision_id?: string | null; sac_code?: string;
}

export async function issueReceiptVoucher(draft: ReceiptVoucherDraft) {
  const rc = await resolveRateContext(draft.currency, draft.payment_date, null);
  const { data: voucher, error: insErr } = await supabase.from('advance_vouchers').insert({
    tenant_id: draft.tenant_id, payment_id: draft.payment_id, case_id: draft.case_id ?? null,
    customer_id: draft.customer_id ?? null, company_id: draft.company_id ?? null,
    voucher_type: 'receipt', voucher_date: draft.payment_date, currency: draft.currency,
    exchange_rate: rc.rate, total_amount: draft.advance_amount,
    place_of_supply_subdivision_id: draft.place_of_supply_subdivision_id ?? null,
  }).select().single();
  if (insErr) throw insErr;

  // Rule 50: back out GST from the inclusive advance (18/118, equal heads + round-off).
  // Thread the buyer so the CGST/SGST-vs-IGST split follows the customer's state.
  const input = buildAdvanceVoucherTotalsInput(draft.advance_amount, draft.payment_date, draft.sac_code,
    { customerId: draft.customer_id ?? null, companyId: draft.company_id ?? null });
  const { computation } = await computeDocumentTotals(input, rc);
  await persistDocumentTaxLines({
    tenantId: draft.tenant_id, documentType: 'receipt_voucher', documentId: voucher.id, computation, rc,
  });
  const result = await issueTaxDocument('receipt_voucher', voucher.id, false);
  await logAuditTrail('create', 'advance_vouchers', voucher.id, {}, { voucher_number: result.document_number, type: 'receipt' });
  return { voucher_id: voucher.id, ...result };
}

export async function applyAdvanceToInvoice(paymentId: string, invoiceId: string, amount: number) {
  const { data, error } = await supabase.rpc('apply_advance_to_invoice', {
    p_payment_id: paymentId, p_invoice_id: invoiceId, p_amount: amount,
  });
  if (error) throw error;
  return data as { ok: boolean; allocated: number; advance_adjustment_tax: number; invoice_status: string };
}

export async function issueRefundVoucher(receiptVoucherId: string, reason: string) {
  const { data: orig, error: oErr } = await supabase.from('advance_vouchers')
    .select('*').eq('id', receiptVoucherId).is('deleted_at', null).maybeSingle();
  if (oErr) throw oErr;
  if (!orig) throw new Error('Original receipt voucher not found');

  // Review #2: reverse only the UNAPPLIED advance. Any portion already netted
  // into an invoice via apply_advance_to_invoice must NOT be reversed again
  // (that would under-collect output GST). The DB _issue_advance_voucher refund
  // cap is the authoritative backstop; this keeps the persisted lines in step.
  const { data: allocs, error: aErr } = await supabase.from('payment_allocations')
    .select('amount').eq('payment_id', orig.payment_id).is('deleted_at', null);
  if (aErr) throw aErr;
  const applied = (allocs ?? []).reduce((sum, a) => sum + Number(a.amount ?? 0), 0);
  const refundable = Number(orig.total_amount) - applied;
  if (refundable <= 0) {
    throw new Error('This advance has been fully applied to invoices — there is nothing to refund.');
  }

  const rc = await resolveRateContext(orig.currency, new Date().toISOString().slice(0, 10), null);
  const { data: refund, error: rErr } = await supabase.from('advance_vouchers').insert({
    tenant_id: orig.tenant_id, payment_id: orig.payment_id, case_id: orig.case_id,
    customer_id: orig.customer_id, company_id: orig.company_id, voucher_type: 'refund',
    original_voucher_id: orig.id, currency: orig.currency, exchange_rate: rc.rate,
    total_amount: refundable, place_of_supply_subdivision_id: orig.place_of_supply_subdivision_id,
    notations: [{ code: 'REFUND_REASON', text: reason }],
  }).select().single();
  if (rErr) throw rErr;

  const input = buildAdvanceVoucherTotalsInput(refundable, refund.voucher_date, undefined,
    { customerId: orig.customer_id ?? null, companyId: orig.company_id ?? null });
  const { computation } = await computeDocumentTotals(input, rc);
  await persistDocumentTaxLines({
    tenantId: orig.tenant_id, documentType: 'refund_voucher', documentId: refund.id, computation, rc,
  });
  const result = await issueTaxDocument('refund_voucher', refund.id, false);
  await logAuditTrail('create', 'advance_vouchers', refund.id, {}, { voucher_number: result.document_number, type: 'refund', reason });
  return { voucher_id: refund.id, ...result };
}

export const advanceVoucherService = { createAdvancePayment, issueReceiptVoucher, applyAdvanceToInvoice, issueRefundVoucher, getHeldAdvancesForCase };

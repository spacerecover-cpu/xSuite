import { supabase } from './supabaseClient';
import { logAuditTrail } from './auditTrailService';

export interface ReceiptAllocationInput {
  invoice_id: string;
  amount: number;
}

export interface ReceiptInput {
  amount: number;
  receipt_date?: string | null;
  customer_id?: string | null;
  /** Free-text payment-method label/id persisted on receipts.payment_method (text column). */
  payment_method?: string | null;
  reference?: string | null;
  notes?: string | null;
  status?: string;
  bank_account_id?: string | null;
}

/**
 * Atomic receipt recording via the `create_receipt_with_allocations` RPC.
 *
 * The RPC owns FOR UPDATE invoice locking, money conservation (Σ allocations = amount),
 * invoice balance recompute (amount_paid/balance_due/status), and the single append-only
 * income posting to financial_transactions. Mirrors paymentsService.createPayment.
 *
 * Phase-1 constraints (rejected with clear errors, by design — not bugs): unapplied/advance
 * cash, overpayment beyond an invoice's balance_due, and foreign-currency invoices (receipts
 * are base-currency only). Foreign-currency invoices use the payments path instead.
 */
export const createReceiptWithAllocations = async (
  receipt: ReceiptInput,
  allocations: ReceiptAllocationInput[],
) => {
  if (!allocations?.length) {
    throw new Error('A receipt must be allocated to at least one invoice.');
  }
  const { data, error } = await supabase.rpc('create_receipt_with_allocations', {
    p_receipt: {
      amount: receipt.amount,
      receipt_date: receipt.receipt_date ?? null,
      customer_id: receipt.customer_id ?? null,
      payment_method: receipt.payment_method ?? null,
      reference: receipt.reference ?? null,
      notes: receipt.notes ?? null,
      status: receipt.status ?? 'completed',
      bank_account_id: receipt.bank_account_id ?? null,
    },
    p_allocations: allocations.map((a) => ({ invoice_id: a.invoice_id, amount: a.amount })),
  });

  if (error) throw error;
  if (!data) throw new Error('Failed to record receipt');

  await logAuditTrail('create', 'receipts', (data as { id: string }).id, {}, { amount: receipt.amount });

  return data;
};

export const receiptsService = { createReceiptWithAllocations };

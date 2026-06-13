// Single source of truth for invoice editability, settlement, and payment
// summary — derived from authoritative amounts (and the DB-maintained
// `payment_status`), never from a drift-prone lifecycle string. See
// docs/superpowers/specs/2026-06-07-payment-workflow-financial-documents-design.md
//
// Two orthogonal axes:
//   - lifecycle  (`status`):        draft -> sent -> cancelled | void | converted
//   - settlement (`payment_status`): unpaid | partial | paid   (DB-derived)

export interface InvoiceFinancials {
  status?: string | null; // lifecycle
  payment_status?: string | null; // DB-derived settlement
  invoice_type?: string | null;
  total_amount?: number | null;
  amount_paid?: number | null;
  credited_amount?: number | null; // applied credit notes (non-cash)
  balance_due?: number | null;
  due_date?: string | null;
}

export type Settlement = 'unpaid' | 'partial' | 'paid';
export type EditMode = 'full' | 'restricted' | 'none';

export interface PaymentSummary {
  total: number;
  paid: number;
  balance: number;
  progress: number; // 0..1
  settlement: Settlement;
  isOverdue: boolean;
}

export interface InvoiceEditability {
  mode: EditMode;
  isLocked: boolean;
  editableFields: 'all' | readonly RestrictedEditableField[];
  reason: string;
}

// Fields that stay editable after an invoice is financially locked. Shared by
// the form (disables the rest) and the persistence whitelist (refuses the rest).
export const RESTRICTED_EDITABLE_FIELDS = [
  'notes',
  'client_reference',
  'due_date',
  'terms_and_conditions',
  'payment_terms',
  'bank_account_id',
] as const;
export type RestrictedEditableField = (typeof RESTRICTED_EDITABLE_FIELDS)[number];

const TERMINAL = ['cancelled', 'void', 'converted'] as const;

const num = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function deriveSettlement(inv: InvoiceFinancials): Settlement {
  const ps = inv.payment_status;
  if (ps === 'unpaid' || ps === 'partial' || ps === 'paid') return ps;
  const total = num(inv.total_amount);
  // Credit notes settle an invoice just like cash does.
  const settled = num(inv.amount_paid) + num(inv.credited_amount);
  if (settled >= total && total > 0) return 'paid';
  if (settled > 0) return 'partial';
  return 'unpaid';
}

const isIssued = (status: string) => status !== 'draft' && !TERMINAL.includes(status as (typeof TERMINAL)[number]);

export function getPaymentSummary(inv: InvoiceFinancials, now: Date = new Date()): PaymentSummary {
  const total = num(inv.total_amount);
  const paid = num(inv.amount_paid);
  // Settlement counts cash + applied credit notes; `paid` stays cash-only.
  const settled = paid + num(inv.credited_amount);
  const balance = inv.balance_due != null ? Math.max(0, num(inv.balance_due)) : Math.max(0, total - settled);
  const progress = total > 0 ? Math.min(1, Math.max(0, settled / total)) : settled > 0 ? 1 : 0;
  const settlement = deriveSettlement(inv);
  const status = inv.status ?? 'draft';

  const due = inv.due_date ? new Date(inv.due_date) : null;
  const isOverdue =
    settlement !== 'paid' &&
    isIssued(status) &&
    due != null &&
    !Number.isNaN(due.getTime()) &&
    due.getTime() < now.getTime();

  return { total, paid, balance, progress, settlement, isOverdue };
}

export function getInvoiceEditability(inv: InvoiceFinancials): InvoiceEditability {
  const status = inv.status ?? 'draft';

  if (TERMINAL.includes(status as (typeof TERMINAL)[number])) {
    const reason =
      status === 'converted'
        ? 'This proforma has been converted to a tax invoice and can no longer be edited.'
        : status === 'void'
          ? 'Voided invoices cannot be edited.'
          : 'Cancelled invoices cannot be edited.';
    return { mode: 'none', isLocked: true, editableFields: [], reason };
  }

  const settlement = deriveSettlement(inv);
  const hasMoney = settlement !== 'unpaid';
  const issued = isIssued(status);
  const isLocked = hasMoney || issued;

  if (!isLocked) {
    return { mode: 'full', isLocked: false, editableFields: 'all', reason: '' };
  }

  const reason = hasMoney
    ? 'This invoice has payments recorded — only non-financial details can be edited.'
    : 'This invoice has been issued — only non-financial details can be edited.';
  return { mode: 'restricted', isLocked: true, editableFields: RESTRICTED_EDITABLE_FIELDS, reason };
}

export function canRecordPayment(inv: InvoiceFinancials): boolean {
  const status = inv.status ?? 'draft';
  return (
    inv.invoice_type === 'tax_invoice' &&
    deriveSettlement(inv) !== 'paid' &&
    isIssued(status)
  );
}

/** A draft tax invoice must be issued (draft → sent) before payments can be
 *  recorded against it — money is only taken against an issued document. */
export function canIssueInvoice(inv: InvoiceFinancials): boolean {
  return inv.invoice_type === 'tax_invoice' && (inv.status ?? 'draft') === 'draft';
}

export function canDeleteInvoice(inv: InvoiceFinancials): boolean {
  const status = inv.status ?? 'draft';
  return status === 'draft' && deriveSettlement(inv) === 'unpaid';
}

/** A credit note can reduce an issued tax invoice that still has an outstanding
 *  balance (discount, partial recovery, negotiated settlement). Drafts,
 *  proformas, fully-settled, and terminal invoices cannot be credited here. */
export function canCreditInvoice(inv: InvoiceFinancials): boolean {
  const status = inv.status ?? 'draft';
  const total = num(inv.total_amount);
  const balance =
    inv.balance_due != null
      ? Math.max(0, num(inv.balance_due))
      : Math.max(0, total - num(inv.amount_paid) - num(inv.credited_amount));
  return inv.invoice_type === 'tax_invoice' && isIssued(status) && balance > 0;
}

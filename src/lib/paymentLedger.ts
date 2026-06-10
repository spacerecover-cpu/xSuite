import { supabase } from './supabaseClient';
import { isValidUuid } from './postgrestSanitizer';

// Unified payment ledger for ONE invoice. Money reaches an invoice through
// three paths that historically rendered in none-or-one surface each:
//   * receipt_allocations -> receipts   (the Record Payment modal's path)
//   * payment_allocations -> payments   (atomic record_payment RPC)
//   * payments.invoice_id direct        (legacy single-invoice payments)
// This module merges all three into one date-ordered statement with a running
// balance, deduping direct payment rows already represented by an allocation.
// Kept dependency-light (supabase client only) so both invoiceService and the
// pdf dataFetcher can import it without lazy-load cycles.

export interface InvoiceLedgerEntry {
  id: string;
  source: 'payment' | 'receipt';
  doc_number: string | null;
  payment_date: string | null;
  /** Amount allocated to THIS invoice (not the parent document's total). */
  amount: number;
  currency: string | null;
  method: string | null;
  reference: string | null;
  transaction_id: string | null;
  status: string | null;
  notes: string | null;
  recorded_by: string | null;
  /** Invoice balance after this entry, oldest-first. */
  running_balance: number;
}

type PaymentRow = {
  id: string;
  payment_number: string | null;
  payment_date: string | null;
  amount: number | string | null;
  currency: string | null;
  reference: string | null;
  transaction_id: string | null;
  status: string | null;
  notes: string | null;
  created_by: string | null;
  deleted_at: string | null;
  payment_method: { name: string | null } | null;
};

type ReceiptRow = {
  id: string;
  receipt_number: string | null;
  receipt_date: string | null;
  payment_method: string | null;
  reference: string | null;
  status: string | null;
  notes: string | null;
  created_by: string | null;
  deleted_at: string | null;
};

const num = (v: number | string | null | undefined) => (typeof v === 'number' ? v : Number(v ?? 0));

// Pure core: chronological order (ISO sortKey) + running balance, rounded to
// 3 decimals (OMR-safe). Exported for unit tests.
export function sortAndBalance<T extends { amount: number; sortKey: string }>(
  rows: T[],
  invoiceTotal: number,
): Array<T & { running_balance: number }> {
  const sorted = [...rows].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  let balance = invoiceTotal;
  return sorted.map((r) => {
    balance = Math.round((balance - r.amount) * 1000) / 1000;
    return { ...r, running_balance: balance };
  });
}

export async function fetchInvoicePaymentLedger(invoiceId: string): Promise<InvoiceLedgerEntry[]> {
  const [invoiceRes, paRes, raRes, directRes] = await Promise.all([
    supabase.from('invoices').select('total_amount, currency').eq('id', invoiceId).maybeSingle(),
    supabase
      .from('payment_allocations')
      .select(
        'id, amount, created_at, payment:payments(id, payment_number, payment_date, amount, currency, reference, transaction_id, status, notes, created_by, deleted_at, payment_method:master_payment_methods(name))',
      )
      .eq('invoice_id', invoiceId)
      .is('deleted_at', null),
    supabase
      .from('receipt_allocations')
      .select(
        'id, amount, created_at, receipt:receipts(id, receipt_number, receipt_date, payment_method, reference, status, notes, created_by, deleted_at)',
      )
      .eq('invoice_id', invoiceId)
      .is('deleted_at', null),
    supabase
      .from('payments')
      .select(
        'id, payment_number, payment_date, amount, currency, reference, transaction_id, status, notes, created_by, payment_method:master_payment_methods(name)',
      )
      .eq('invoice_id', invoiceId)
      .is('deleted_at', null),
  ]);

  for (const r of [invoiceRes, paRes, raRes, directRes]) {
    if (r.error) throw r.error;
  }

  const invoiceTotal = num((invoiceRes.data as { total_amount: number | null } | null)?.total_amount);
  const invoiceCurrency = (invoiceRes.data as { currency: string | null } | null)?.currency ?? null;

  type Pending = Omit<InvoiceLedgerEntry, 'running_balance' | 'recorded_by' | 'method'> & {
    created_by: string | null;
    method: string | null;
    methodRef: string | null; // receipts store the method as text that is usually a uuid
    sortKey: string;
  };
  const pending: Pending[] = [];
  const allocatedPaymentIds = new Set<string>();

  for (const row of (paRes.data ?? []) as unknown as Array<{ id: string; amount: number | string | null; created_at: string | null; payment: PaymentRow | null }>) {
    const p = row.payment;
    if (!p || p.deleted_at) continue;
    allocatedPaymentIds.add(p.id);
    pending.push({
      id: `pa-${row.id}`,
      source: 'payment',
      doc_number: p.payment_number ?? null,
      payment_date: p.payment_date ?? row.created_at ?? null,
      amount: num(row.amount),
      currency: p.currency ?? invoiceCurrency,
      method: p.payment_method?.name ?? null,
      methodRef: null,
      reference: p.reference ?? null,
      transaction_id: p.transaction_id ?? null,
      status: p.status ?? null,
      notes: p.notes ?? null,
      created_by: p.created_by ?? null,
      sortKey: p.payment_date ?? row.created_at ?? '',
    });
  }

  for (const row of (raRes.data ?? []) as unknown as Array<{ id: string; amount: number | string | null; created_at: string | null; receipt: ReceiptRow | null }>) {
    const r = row.receipt;
    if (!r || r.deleted_at) continue;
    pending.push({
      id: `ra-${row.id}`,
      source: 'receipt',
      doc_number: r.receipt_number ?? null,
      payment_date: r.receipt_date ?? row.created_at ?? null,
      amount: num(row.amount),
      currency: invoiceCurrency,
      method: null,
      methodRef: r.payment_method ?? null,
      reference: r.reference ?? null,
      transaction_id: null,
      status: r.status ?? null,
      notes: r.notes ?? null,
      created_by: r.created_by ?? null,
      sortKey: r.receipt_date ?? row.created_at ?? '',
    });
  }

  for (const p of (directRes.data ?? []) as unknown as PaymentRow[]) {
    if (allocatedPaymentIds.has(p.id)) continue; // already represented by its allocation
    pending.push({
      id: `p-${p.id}`,
      source: 'payment',
      doc_number: p.payment_number ?? null,
      payment_date: p.payment_date ?? null,
      amount: num(p.amount),
      currency: p.currency ?? invoiceCurrency,
      method: p.payment_method?.name ?? null,
      methodRef: null,
      reference: p.reference ?? null,
      transaction_id: p.transaction_id ?? null,
      status: p.status ?? null,
      notes: p.notes ?? null,
      created_by: p.created_by ?? null,
      sortKey: p.payment_date ?? '',
    });
  }

  // Resolve recorder names and receipt method uuids in two batched lookups.
  const userIds = Array.from(new Set(pending.map((e) => e.created_by).filter((v): v is string => !!v)));
  const methodIds = Array.from(
    new Set(pending.map((e) => e.methodRef).filter((v): v is string => !!v && isValidUuid(v))),
  );
  const [profilesRes, methodsRes] = await Promise.all([
    userIds.length
      ? supabase.from('profiles').select('id, full_name').in('id', userIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null }> }),
    methodIds.length
      ? supabase.from('master_payment_methods').select('id, name').in('id', methodIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string | null }> }),
  ]);
  const nameById = Object.fromEntries((profilesRes.data ?? []).map((p) => [p.id, p.full_name ?? '']));
  const methodById = Object.fromEntries((methodsRes.data ?? []).map((m) => [m.id, m.name ?? '']));

  return sortAndBalance(pending, invoiceTotal).map((e) => {
    const method =
      e.method ?? (e.methodRef ? (isValidUuid(e.methodRef) ? methodById[e.methodRef] ?? null : e.methodRef) : null);
    return {
      id: e.id,
      source: e.source,
      doc_number: e.doc_number,
      payment_date: e.payment_date,
      amount: e.amount,
      currency: e.currency,
      method,
      reference: e.reference,
      transaction_id: e.transaction_id,
      status: e.status,
      notes: e.notes,
      recorded_by: e.created_by ? nameById[e.created_by] ?? null : null,
      running_balance: e.running_balance,
    };
  });
}

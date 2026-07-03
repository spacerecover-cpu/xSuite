// VAT ledger contra-reversal regression gate (Phase 0, Task 13 follow-up). Task 10's
// post_invoice_vat_record trigger and Task 13's post_credit_note_vat_record trigger both
// post an append-only CONTRA pair into vat_records (issue row + offsetting void/reversal
// row sharing the same record_id) — the exact shape the live partial unique index
// uq_vat_records_record used to forbid (23505), silently breaking void_invoice and
// void_credit_note for any tax-bearing document. Fixed by narrowing the index to
// purchase-only (migration phase0_vat_records_idempotency_purchase_scope). This test
// closes Task 10's blind spot: no prior test exercised the invoice-void reversal path.
// Runs rolled-back transactions against the live DB; self-skips without SUPABASE_DB_URL
// (same policy as provisioning-ghost-scalars.test.ts / registry-trigger-parity.test.ts).
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

const dbUrl = process.env.SUPABASE_DB_URL;
const live = dbUrl ? describe : describe.skip;

function psqlRows(sql: string): string[] {
  return execFileSync('psql', [dbUrl as string, '-tA', '-F', '|', '-c', sql], { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean);
}

live('vat_records contra reversal (append-only sale-side ledger)', () => {
  // The issue row and its void-reversal row are inserted in the SAME transaction, so
  // they share an identical now()/created_at — any positional/ORDER BY assertion would
  // flake. Assert only the order-independent contra invariants: exactly 2 sale rows,
  // their vat_amounts (as a numerically-sorted multiset) equal the expected pair, and
  // they sum to exactly 0.
  function assertContraPair(amounts: number[], expected: [number, number]): void {
    expect(amounts).toHaveLength(2);
    expect([...amounts].sort((a, b) => a - b)).toEqual([...expected].sort((a, b) => a - b));
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(0);
  }

  it('voiding a tax invoice posts an offsetting -VAT sale row (2 rows net to 0)', () => {
    const rows = psqlRows(`
      BEGIN;
      SET LOCAL app.bypass_tenant_guard = 'true';
      INSERT INTO public.invoices (tenant_id, case_id, invoice_number, invoice_type, status,
                                   invoice_date, currency, exchange_rate, subtotal, tax_rate, tax_amount, total_amount)
      SELECT t.id, c.id, 'P0-REGR-VAT-INV', 'tax_invoice', 'sent', now(), t.base_currency_code, 1, 100.000, 5, 5.000, 105.000
      FROM public.tenants t, LATERAL (SELECT id FROM public.cases WHERE tenant_id = t.id LIMIT 1) c
      WHERE t.deleted_at IS NULL LIMIT 1;
      UPDATE public.invoices SET status='void' WHERE invoice_number='P0-REGR-VAT-INV';
      SELECT vr.vat_amount
      FROM public.vat_records vr JOIN public.invoices i ON i.id = vr.record_id
      WHERE i.invoice_number = 'P0-REGR-VAT-INV';
      ROLLBACK;
    `);
    assertContraPair(rows.map(Number), [5, -5]);
  });

  it('issuing then voiding a credit note posts a -VAT and a +VAT sale row (net to 0)', () => {
    const rows = psqlRows(`
      BEGIN;
      SET LOCAL app.bypass_tenant_guard = 'true';
      INSERT INTO public.invoices (tenant_id, case_id, invoice_number, invoice_type, status,
                                   invoice_date, currency, exchange_rate, subtotal, tax_rate, tax_amount, total_amount)
      SELECT t.id, c.id, 'P0-REGR-CN-INV', 'tax_invoice', 'sent', now(), t.base_currency_code, 1, 100.000, 5, 5.000, 105.000
      FROM public.tenants t, LATERAL (SELECT id FROM public.cases WHERE tenant_id = t.id LIMIT 1) c
      WHERE t.deleted_at IS NULL LIMIT 1;
      INSERT INTO public.credit_notes (tenant_id, credit_note_number, credit_note_date, status, credit_type,
                                       invoice_id, currency, exchange_rate, subtotal, tax_rate, tax_amount, total_amount,
                                       subtotal_base, tax_amount_base, total_amount_base)
      SELECT i.tenant_id, 'P0-REGR-CN-0001', now(), 'issued', 'adjustment',
             i.id, i.currency, 1, 40.000, 5, 2.000, 42.000, 40.000, 2.000, 42.000
      FROM public.invoices i WHERE i.invoice_number = 'P0-REGR-CN-INV';
      UPDATE public.credit_notes SET status='void' WHERE credit_note_number='P0-REGR-CN-0001';
      SELECT vr.vat_amount
      FROM public.vat_records vr JOIN public.credit_notes cn ON cn.id = vr.record_id
      WHERE cn.credit_note_number = 'P0-REGR-CN-0001';
      ROLLBACK;
    `);
    assertContraPair(rows.map(Number), [-2, 2]);
  });
});

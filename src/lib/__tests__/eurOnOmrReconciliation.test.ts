// C4 RELEASE GATE (Country Engine Phase 2): a EUR document on an OMR (3-decimal)
// tenant must reconcile to the baisa across the freeze -> payment -> reporting
// chain. This exercises the REAL base-money helpers the writers use
// (financialMath freeze, baseAmount/sumBase rollups, sumBankBalanceBase,
// amountInWords minor-units, computeRealizedFx) with hand-exact values, so a
// regression in any of them fails the gate.
//
// HARNESS NOTE: the repo has no live-DB integration harness (no RUN_DB_TESTS).
// The DB-resident assertions from the plan — (a) FX rate_date carry-forward off
// currencyService.usdRate for a weekend document date, and (b) rate_source =
// 'tenant_override' when a tenant_exchange_rate_overrides row matches — require a
// seeded branch DB and are tracked as follow-up (see the it.skip stubs below).
// The pure-math reconciliation below IS the binding release criterion today.

import { describe, it, expect, vi } from 'vitest';

// financialReportsService transitively imports ./supabaseClient (throws on missing
// env at load). Mock it so the pure sumBankBalanceBase import resolves.
vi.mock('../supabaseClient', () => ({ supabase: {}, resolveTenantId: async () => null }));

import {
  calculateInvoiceTotals,
  calculateInvoiceTotalsBase,
  convertToBase,
  baseAmount,
  computeRealizedFx,
} from '../financialMath';
import { sumBankBalanceBase } from '../financialReportsService';
import { sumBase } from '../../pages/financial/reportsDashboardRollup';
import { amountInWordsEn } from '../pdf/engine/amountInWords';

// OMR base: 3 minor-unit decimals (baisa). EUR document: 2 decimals. Exact rate
// so the expected base values are unambiguous by hand (no rounding edge).
const OMR_DP = 3;
const EUR_DP = 2;
const EUR_TO_OMR = 0.42;
const OMR_VAT = 5; // percent

describe('C4 — EUR document on an OMR tenant reconciles to the baisa', () => {
  // A EUR invoice: 2 x 500.00 = 1000.00 subtotal, 5% VAT = 50.00, total 1050.00.
  const totals = calculateInvoiceTotals(
    [{ quantity: 2, unit_price: 500 }], 0, OMR_VAT, 0, EUR_DP,
  );
  const baseTotals = calculateInvoiceTotalsBase(
    { subtotal: totals.subtotal, taxAmount: totals.taxAmount, totalAmount: totals.totalAmount, amountPaid: 0, amountDue: totals.amountDue },
    EUR_TO_OMR, OMR_DP,
  );

  it('freezes the document totals correctly in EUR', () => {
    expect(totals.subtotal).toBe(1000);
    expect(totals.taxAmount).toBe(50);
    expect(totals.totalAmount).toBe(1050);
  });

  it('freezes the base (OMR) shadow at the rate, rounded to 3 baisa decimals', () => {
    expect(baseTotals.subtotalBase).toBe(420); // 1000 * 0.42
    expect(baseTotals.taxAmountBase).toBe(21); //  50 * 0.42
    expect(baseTotals.totalAmountBase).toBe(441); // 1050 * 0.42
  });

  it('rounds the base shadow to the BASE currency decimals (3), not the document (2)', () => {
    expect(convertToBase(1, 0.1235, OMR_DP)).toBe(0.124); // 3dp half-up
    expect(convertToBase(1, 0.1235, EUR_DP)).toBe(0.12); //  2dp would lose the baisa
  });

  it('reconciles partial EUR payments to the invoice base to the baisa (D14)', () => {
    // 600 + 450 EUR fully settle the 1050 EUR invoice.
    const payments = [
      { amount: 600, amount_base: convertToBase(600, EUR_TO_OMR, OMR_DP) }, // 252
      { amount: 450, amount_base: convertToBase(450, EUR_TO_OMR, OMR_DP) }, // 189
    ];
    const paidBase = sumBase(payments, 'amount'); // sums the _base shadow
    expect(paidBase).toBe(441);
    expect(paidBase).toBe(baseTotals.totalAmountBase); // reconciles to the freeze
  });

  it('D7 guard: dashboard P&L sums base, never the raw EUR figure', () => {
    const invoices = [
      { amount_paid: 1050, amount_paid_base: 441 }, // EUR invoice
      { amount_paid: 100, amount_paid_base: 100 }, // OMR invoice (unity)
    ];
    expect(sumBase(invoices, 'amount_paid')).toBe(541); // NOT raw 1150
  });

  it('D8 guard: bank rollup sums base across currencies, never raw', () => {
    const banks = [
      { current_balance: 1000, current_balance_base: 420 }, // EUR account
      { current_balance: 500, current_balance_base: 500 }, // OMR account
    ];
    expect(sumBankBalanceBase(banks, 'current_balance')).toBe(920); // NOT raw 1500
  });

  it('baseAmount falls back to native for legacy unity rows (single-currency safe)', () => {
    expect(baseAmount({ amount_paid: 250 }, 'amount_paid')).toBe(250);
  });

  it('D13: amountInWords honors the base 3-decimal baisa (distinct from 2-decimal)', () => {
    // 2.5 OMR -> "...and 500 baisa" at 3dp vs "...and 50" at 2dp. The decimals
    // param must thread through so OMR is not rendered as a 2-decimal currency.
    expect(amountInWordsEn(2.5, 'OMR', 3)).not.toBe(amountInWordsEn(2.5, 'OMR', 2));
  });

  it('realized FX is booked when the settlement rate moves (and is 0 at unity)', () => {
    // 1050 base-units booked at 0.42, settled at 0.40 -> loss of 21 at 3dp.
    expect(computeRealizedFx(1050, 0.4, 0.42, OMR_DP)).toBe(-21);
    // Same-rate settlement (single-currency / same-day) -> exactly 0, no FX row.
    expect(computeRealizedFx(1050, 0.42, 0.42, OMR_DP)).toBe(0);
  });

  // DB-resident assertions — require a seeded branch DB (no RUN_DB_TESTS harness).
  it.skip('FX rate_date carries forward off the document date for a weekend (needs DB harness)', () => {});
  it.skip("rate_source = 'tenant_override' when a matching override row exists (needs DB harness)", () => {});
});

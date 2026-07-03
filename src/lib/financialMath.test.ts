import { describe, it, expect } from 'vitest';
import {
  roundMoney,
  allocateLargestRemainder,
  roundMoneyWith,
  convertToBase,
  calculateInvoiceTotals,
  calculateQuoteTotals,
  calculateInvoiceTotalsBase,
  calculateQuoteTotalsBase,
  computeRealizedFx,
  baseAmount,
  isReceivableInvoice,
  RECEIVABLE_INVOICE_EXCLUDED_STATUSES,
} from './financialMath';

// Characterization tests. These pin the EXISTING behavior of the canonical
// (fully-rounded) create-path money math so the extraction into financialMath.ts
// — and the parallel fix that makes updateInvoice round the same way — can be
// proven behavior-preserving. Expected values were hand-computed against the
// per-step `Math.round(x * 100) / 100` rule the create paths already use.

describe('roundMoney', () => {
  it('rounds to two decimal places (cents)', () => {
    expect(roundMoney(2)).toBe(2);
    expect(roundMoney(2.999)).toBe(3);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3); // collapses 0.30000000000000004
  });

  it('documents the IEEE-754 half-cent quirk (1.005 * 100 < 100.5)', () => {
    // This is the current behavior, not necessarily the desired one — pinned so a
    // future "rounding fix" is a conscious, reviewed change rather than a silent one.
    expect(roundMoney(1.005)).toBe(1);
  });
});

describe('calculateInvoiceTotals (canonical = createInvoice rounded path)', () => {
  it('computes a single untaxed-discount line with tax', () => {
    expect(
      calculateInvoiceTotals([{ quantity: 2, unit_price: 100 }], 0, 10, 0),
    ).toEqual({ subtotal: 200, taxRate: 10, taxAmount: 20, totalAmount: 220, amountDue: 220 });
  });

  it('rounds tax to cents on fractional inputs', () => {
    expect(
      calculateInvoiceTotals([{ quantity: 3, unit_price: 9.99 }], 0, 7.5, 0),
    ).toEqual({ subtotal: 29.97, taxRate: 7.5, taxAmount: 2.25, totalAmount: 32.22, amountDue: 32.22 });
  });

  it('applies per-line %, then invoice-level discount, then amount paid', () => {
    expect(
      calculateInvoiceTotals(
        [{ quantity: 1, unit_price: 100, discount_percent: 10 }],
        5, // invoice-level fixed discount
        0, // no tax
        50, // amount already paid
      ),
    ).toEqual({ subtotal: 90, taxRate: 0, taxAmount: 0, totalAmount: 85, amountDue: 35 });
  });

  it('accumulates multiple lines with mixed discounts', () => {
    expect(
      calculateInvoiceTotals(
        [
          { quantity: 2, unit_price: 50 },
          { quantity: 1, unit_price: 25.5, discount_percent: 20 },
        ],
        0,
        5,
        0,
      ),
    ).toEqual({ subtotal: 120.4, taxRate: 5, taxAmount: 6.02, totalAmount: 126.42, amountDue: 126.42 });
  });
});

describe('calculateQuoteTotals (already-rounded create/update path)', () => {
  it('applies a percentage discount then tax', () => {
    expect(
      calculateQuoteTotals(
        [
          { quantity: 2, unit_price: 50 },
          { quantity: 1, unit_price: 30 },
        ],
        'percentage',
        10,
        5,
      ),
    ).toEqual({ subtotal: 130, taxAmount: 5.85, totalAmount: 122.85 });
  });

  it('applies a fixed discount then tax', () => {
    expect(
      calculateQuoteTotals([{ quantity: 1, unit_price: 100 }], 'fixed', 15, 10),
    ).toEqual({ subtotal: 100, taxAmount: 8.5, totalAmount: 93.5 });
  });

  it('handles no discount and no tax', () => {
    expect(
      calculateQuoteTotals([{ quantity: 3, unit_price: 33.33 }], undefined, 0, 0),
    ).toEqual({ subtotal: 99.99, taxAmount: 0, totalAmount: 99.99 });
  });

  it('keeps 3 decimals for an OMR quote', () => {
    // qty 1 @ 33.333 OMR, 10% tax, 3-decimal currency.
    expect(
      calculateQuoteTotals([{ quantity: 1, unit_price: 33.333 }], undefined, 0, 10, 3),
    ).toEqual({ subtotal: 33.333, taxAmount: 3.333, totalAmount: 36.666 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CONFIRM (your accounting policy) — owner contribution
//
// This pins the canonical total for a representative data-recovery invoice under
// the CURRENT per-step rounding rule. Verify these expected values match how your
// business / jurisdiction expects VAT and discounts to round. If your standard
// rounds differently (e.g. round only the final total, or banker's rounding on
// tax), change the expected values here first — this test then becomes the
// specification that financialMath.ts must satisfy, and we adjust the helper to
// match. As written it documents today's behavior (so it currently passes).
// ─────────────────────────────────────────────────────────────────────────────
describe('canonical accounting policy', () => {
  it('representative data-recovery invoice: 5% VAT, one discounted donor line', () => {
    const totals = calculateInvoiceTotals(
      [
        { quantity: 1, unit_price: 450 }, // Logical recovery — 1TB HDD
        { quantity: 2, unit_price: 75, discount_percent: 10 }, // Donor parts, 10% off
      ],
      0, // no invoice-level discount
      5, // 5% VAT
      0, // nothing paid yet
    );

    expect(totals).toEqual({
      subtotal: 585,
      taxRate: 5,
      taxAmount: 29.25,
      totalAmount: 614.25,
      amountDue: 614.25,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Multi-currency: currency-aware rounding (per the currency's decimal places) and
// base-currency conversion. Default decimalPlaces = 2 keeps every existing caller
// (and the cases above) byte-identical.
// ─────────────────────────────────────────────────────────────────────────────
describe('roundMoney (currency-aware)', () => {
  it('defaults to 2 decimal places (backward compatible)', () => {
    expect(roundMoney(2.999)).toBe(3);
    expect(roundMoney(1.005)).toBe(1); // documented IEEE-754 quirk, unchanged
  });

  it('rounds to 0 decimals for zero-decimal currencies (JPY/KRW)', () => {
    expect(roundMoney(1234.5, 0)).toBe(1235);
    expect(roundMoney(99.4, 0)).toBe(99);
  });

  it('rounds to 3 decimals for three-decimal currencies (OMR/BHD/KWD)', () => {
    expect(roundMoney(1.2349, 3)).toBe(1.235);
    expect(roundMoney(0.385, 3)).toBe(0.385);
  });
});

describe('convertToBase', () => {
  it('multiplies by the rate and rounds to the base currency decimals', () => {
    expect(convertToBase(100, 1.08, 2)).toBe(108);      // USD base, 2dp
    expect(convertToBase(100, 0.385, 3)).toBe(38.5);    // OMR base, 3dp
    expect(convertToBase(1000, 0.0067, 0)).toBe(7);     // JPY base, 0dp (6.7 -> 7)
  });
  it('is identity at rate 1', () => {
    expect(convertToBase(614.25, 1, 2)).toBe(614.25);
  });
});

describe('calculateInvoiceTotals (currency-aware rounding)', () => {
  it('rounds totals to 0 decimals for a JPY invoice', () => {
    // qty 1 @ 1000, 10% tax, nothing paid, 0-decimal currency
    expect(calculateInvoiceTotals([{ quantity: 1, unit_price: 1000 }], 0, 10, 0, 0)).toEqual({
      subtotal: 1000,
      taxRate: 10,
      taxAmount: 100,
      totalAmount: 1100,
      amountDue: 1100,
    });
  });

  it('keeps 3 decimals for an OMR invoice (the real tenant currency)', () => {
    // qty 3 @ 9.999 OMR, 5% tax, nothing paid, 3-decimal currency.
    // At 2dp this would round the line to 30.00 and total to 31.50; at 3dp the
    // third decimal survives (29.997 -> 31.497) — that is the whole point of the fix.
    expect(calculateInvoiceTotals([{ quantity: 3, unit_price: 9.999 }], 0, 5, 0, 3)).toEqual({
      subtotal: 29.997,
      taxRate: 5,
      taxAmount: 1.5,
      totalAmount: 31.497,
      amountDue: 31.497,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Base-currency snapshotting (the "switch-on"). Each document money field is
// converted to base independently at the frozen rate and rounded to the BASE
// currency's minor units (the §3.3 invariant: *_base = round(* * rate, base.dp)).
// Base fields are never derived from one another, so cross-field rounding never
// accumulates. Hand-computed against doc * rate then round-to-base-dp.
// ─────────────────────────────────────────────────────────────────────────────
describe('calculateInvoiceTotalsBase', () => {
  it('converts each total to base at the frozen rate (EUR doc -> USD base, 2dp)', () => {
    expect(
      calculateInvoiceTotalsBase(
        { subtotal: 585, taxAmount: 29.25, totalAmount: 614.25, amountPaid: 0, amountDue: 614.25 },
        1.08,
        2,
      ),
    ).toEqual({
      subtotalBase: 631.8, // 585 * 1.08
      taxAmountBase: 31.59, // 29.25 * 1.08
      totalAmountBase: 663.39, // 614.25 * 1.08
      amountPaidBase: 0,
      balanceDueBase: 663.39,
    });
  });

  it('is identity at rate 1 (single-currency tenant — base == document)', () => {
    expect(
      calculateInvoiceTotalsBase(
        { subtotal: 585, taxAmount: 29.25, totalAmount: 614.25, amountPaid: 100, amountDue: 514.25 },
        1,
        2,
      ),
    ).toEqual({
      subtotalBase: 585,
      taxAmountBase: 29.25,
      totalAmountBase: 614.25,
      amountPaidBase: 100,
      balanceDueBase: 514.25,
    });
  });

  it('rounds base totals to 0 decimals when base is JPY', () => {
    expect(
      calculateInvoiceTotalsBase(
        { subtotal: 100, taxAmount: 10, totalAmount: 110, amountPaid: 0, amountDue: 110 },
        150,
        0,
      ),
    ).toEqual({
      subtotalBase: 15000,
      taxAmountBase: 1500,
      totalAmountBase: 16500,
      amountPaidBase: 0,
      balanceDueBase: 16500,
    });
  });
});

describe('calculateQuoteTotalsBase', () => {
  it('converts each total to base at the frozen rate', () => {
    expect(
      calculateQuoteTotalsBase({ subtotal: 130, taxAmount: 5.85, totalAmount: 122.85 }, 1.08, 2),
    ).toEqual({
      subtotalBase: 140.4, // 130 * 1.08
      taxAmountBase: 6.32, // 5.85 * 1.08 = 6.318 -> 6.32
      totalAmountBase: 132.68, // 122.85 * 1.08 = 132.678 -> 132.68
    });
  });

  it('is identity at rate 1', () => {
    expect(
      calculateQuoteTotalsBase({ subtotal: 100, taxAmount: 8.5, totalAmount: 93.5 }, 1, 2),
    ).toEqual({ subtotalBase: 100, taxAmountBase: 8.5, totalAmountBase: 93.5 });
  });
});

// Realized FX on settlement (SMB model: payment denominated in the invoice's
// currency). Mirrors the canonical SQL compute_realized_fx():
//   realized = round(docAmount * (paymentRate - invoiceRate), base.dp)
describe('computeRealizedFx', () => {
  it('is a gain when the base strengthened between booking and payment', () => {
    // 1000 (doc) booked at 1.10, settled at 1.15 -> +50 base
    expect(computeRealizedFx(1000, 1.15, 1.1, 2)).toBe(50);
  });

  it('is a (negative) loss when the rate moved the other way', () => {
    expect(computeRealizedFx(1000, 1.05, 1.1, 2)).toBe(-50);
  });

  it('is exactly zero when the rate did not move (single-currency / same-day)', () => {
    expect(computeRealizedFx(1000, 1.1, 1.1, 2)).toBe(0);
  });

  it('rounds the delta to the base currency minor units (JPY base, 0dp)', () => {
    // 1000 * (0.0072 - 0.0070) = 0.2 -> 0 at 0 decimals
    expect(computeRealizedFx(1000, 0.0072, 0.007, 0)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// baseAmount: read a row's base-currency value for cross-document aggregation.
// Reports MUST sum the *_base columns (one currency), never the raw transaction
// amounts (which mix currencies once >1 currency exists). COALESCE semantics:
// prefer <field>_base, fall back to the raw field during the transition, else 0.
// ─────────────────────────────────────────────────────────────────────────────
describe('baseAmount', () => {
  it('returns the base-currency value when present', () => {
    expect(baseAmount({ amount: 105, amount_base: 44.1 }, 'amount')).toBe(44.1);
    expect(baseAmount({ total_amount: 105, total_amount_base: 44.1 }, 'total_amount')).toBe(44.1);
  });

  it('falls back to the raw amount when base is absent or null (transition rows)', () => {
    expect(baseAmount({ amount: 105 }, 'amount')).toBe(105);
    expect(baseAmount({ amount: 105, amount_base: null }, 'amount')).toBe(105);
  });

  it('treats a base of 0 as a real value, not a missing one', () => {
    expect(baseAmount({ amount: 105, amount_base: 0 }, 'amount')).toBe(0);
  });

  it('returns 0 when neither base nor raw is a usable number', () => {
    expect(baseAmount({}, 'amount')).toBe(0);
    expect(baseAmount({ amount: null, amount_base: null }, 'amount')).toBe(0);
  });
});

// EXP-014: the case-detail Financial Summary and the Revenue-by-Case report must apply
// the SAME receivable filter, or the two case-profit surfaces disagree (a converted
// proforma + its tax invoice get double-counted). This locks the shared contract.
describe('isReceivableInvoice (shared receivable filter — EXP-014)', () => {
  it('counts a tax invoice in any owed status', () => {
    for (const status of ['paid', 'partial', 'overdue', 'sent', null]) {
      expect(isReceivableInvoice({ invoice_type: 'tax_invoice', status })).toBe(true);
    }
  });

  it('excludes proformas regardless of status (same bill as the tax invoice it became)', () => {
    expect(isReceivableInvoice({ invoice_type: 'proforma', status: 'paid' })).toBe(false);
    expect(isReceivableInvoice({ invoice_type: 'proforma', status: 'converted' })).toBe(false);
  });

  it('excludes void/cancelled tax invoices (not owed)', () => {
    expect(isReceivableInvoice({ invoice_type: 'tax_invoice', status: 'void' })).toBe(false);
    expect(isReceivableInvoice({ invoice_type: 'tax_invoice', status: 'cancelled' })).toBe(false);
  });

  it('parity contract: excluded-status list is exactly void + cancelled', () => {
    expect([...RECEIVABLE_INVOICE_EXCLUDED_STATUSES]).toEqual(['void', 'cancelled']);
  });
});

describe('allocateLargestRemainder', () => {
  it('spec example: OMR 0.100 discount over three equal 100.000 lines → 0.034/0.033/0.033', () => {
    expect(allocateLargestRemainder(0.1, [100, 100, 100], 3)).toEqual([0.034, 0.033, 0.033]);
  });
  it('spec example: inclusive ₹762.71 split across equal CGST/SGST weights → 381.36/381.35', () => {
    expect(allocateLargestRemainder(762.71, [9, 9], 2)).toEqual([381.36, 381.35]);
  });
  it('negative totals mirror positive allocation (credit notes)', () => {
    expect(allocateLargestRemainder(-0.1, [100, 100, 100], 3)).toEqual([-0.034, -0.033, -0.033]);
  });
  it('zero weights degrade to stable equal spread', () => {
    expect(allocateLargestRemainder(0.05, [0, 0], 2)).toEqual([0.03, 0.02]);
  });
  it('empty weights → empty result', () => {
    expect(allocateLargestRemainder(10, [], 2)).toEqual([]);
  });
  it('PROPERTY: sums exactly, parts within one minor unit of exact share, deterministic', () => {
    let seed = 424242;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let trial = 0; trial < 500; trial++) {
      const dp = [0, 2, 3][trial % 3];
      const n = 1 + Math.floor(rnd() * 7);
      const weights = Array.from({ length: n }, () => Math.floor(rnd() * 5000) / 10);
      const total = roundMoney(rnd() * 10000 - 2000, dp);
      const parts = allocateLargestRemainder(total, weights, dp);
      const sum = roundMoney(parts.reduce((s, p) => s + p, 0), dp);
      expect(sum).toBe(total);
      expect(allocateLargestRemainder(total, weights, dp)).toEqual(parts); // deterministic
      const weightSum = weights.reduce((s, w) => s + w, 0);
      if (weightSum > 0) {
        parts.forEach((p, i) => {
          const exact = (total * weights[i]) / weightSum;
          expect(Math.abs(p - exact)).toBeLessThanOrEqual(1 / 10 ** dp + 1e-9);
        });
      }
    }
  });
});

describe('roundMoneyWith', () => {
  const docHalfUp = { mode: 'half_up', level: 'document' } as const;
  const docHalfEven = { mode: 'half_even', level: 'document' } as const;
  it('half_up matches the house roundMoney byte-for-byte (Oman parity requirement)', () => {
    for (const v of [62.5, 62.4999, -2.005, 1.0005, 0.0005, -0.0005, 1250.0625]) {
      for (const dp of [0, 2, 3]) {
        expect(roundMoneyWith(v, dp, docHalfUp)).toBe(roundMoney(v, dp));
      }
    }
  });
  it('half_even rounds exact halves to the even minor unit', () => {
    expect(roundMoneyWith(0.125, 2, docHalfEven)).toBe(0.12);
    expect(roundMoneyWith(0.135, 2, docHalfEven)).toBe(0.14);
    expect(roundMoneyWith(2.5, 0, docHalfEven)).toBe(2);
    expect(roundMoneyWith(3.5, 0, docHalfEven)).toBe(4);
  });
});

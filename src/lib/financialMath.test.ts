import { describe, it, expect } from 'vitest';
import {
  roundMoney,
  calculateInvoiceTotals,
  calculateQuoteTotals,
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

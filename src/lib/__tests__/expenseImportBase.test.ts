import { describe, it, expect } from 'vitest';
import { ENTITY_CONFIGS } from '../importExportService';

// EXP-062: imported expenses must be able to carry currency/tax/rate, and amount_base
// is computed by a DB trigger (round(amount*rate, base.decimals)) on any write path
// that doesn't supply it. These guards lock the import config + the rounding contract.

describe('EXP-062 — expenses import config (currency/tax/rate are importable)', () => {
  const cfg = ENTITY_CONFIGS.expenses;

  it('keeps paid_at among dateFields (it is a real column — not phantom)', () => {
    expect(cfg.dateFields).toContain('paid_at');
    expect(cfg.dateFields).toContain('expense_date');
    expect(cfg.dateFields).toContain('approved_at');
  });

  it('lets importers supply tax_amount and exchange_rate (number-coerced)', () => {
    expect(cfg.numberFields).toContain('tax_amount');
    expect(cfg.numberFields).toContain('exchange_rate');
  });

  it('exposes currency as a mappable free-text field', () => {
    expect(cfg.stringFields ?? []).toContain('currency');
  });

  it('never exposes the derived base columns for import (trigger owns them)', () => {
    const all = [...cfg.numberFields, ...(cfg.stringFields ?? [])];
    expect(all).not.toContain('amount_base');
    expect(all).not.toContain('tax_amount_base');
  });
});

describe('EXP-062 — base-amount rounding contract (mirrors the DB trigger)', () => {
  // round(amount * rate, baseDecimals) — must match round() semantics in the SQL trigger.
  const base = (amount: number, rate: number, dec: number) =>
    Math.round(amount * rate * 10 ** dec) / 10 ** dec;

  it('converts a foreign amount at the stored rate to base decimals', () => {
    expect(base(1000, 0.42, 3)).toBe(420);        // EUR 1000 @ 0.42 -> OMR 420.000
  });
  it('is identity at rate 1', () => {
    expect(base(150, 1, 2)).toBe(150);
  });
  it('rounds to zero-decimal currencies (JPY)', () => {
    expect(base(99.6, 1, 0)).toBe(100);
  });
  it('yields 0 for zero tax', () => {
    expect(base(0, 0.42, 3)).toBe(0);
  });
});

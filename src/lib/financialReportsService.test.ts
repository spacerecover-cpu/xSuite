import { describe, it, expect, vi } from 'vitest';

// sumBankBalanceBase is pure, but the module transitively imports ./supabaseClient
// which throws on missing env at load — mock it (same pattern as vatService.test.ts).
vi.mock('./supabaseClient', () => ({ supabase: {} }));

import { sumBankBalanceBase, closingBalanceIsIndicative } from './financialReportsService';

describe('sumBankBalanceBase (D8)', () => {
  it('sums the base-converted balance, never raw cross-currency amounts', () => {
    expect(sumBankBalanceBase([
      { current_balance: 100, current_balance_base: 38 },
      { current_balance: 50, current_balance_base: 50 },
    ], 'current_balance')).toBe(88);
  });
  it('falls back to the raw balance when no base is present (pre-migration unity rows)', () => {
    expect(sumBankBalanceBase([{ current_balance: 50 }], 'current_balance')).toBe(50);
  });
});

describe('closingBalanceIsIndicative (D8 — multi-currency closing balance label)', () => {
  it('is true when any bank row currency differs from base', () => {
    expect(closingBalanceIsIndicative([{ currency: 'OMR' }, { currency: 'EUR' }], 'OMR')).toBe(true);
  });
  it('is false when all rows are base currency or currency is absent', () => {
    expect(closingBalanceIsIndicative([{ currency: 'OMR' }, { currency: null }], 'OMR')).toBe(false);
    expect(closingBalanceIsIndicative([{}], 'OMR')).toBe(false);
  });
});

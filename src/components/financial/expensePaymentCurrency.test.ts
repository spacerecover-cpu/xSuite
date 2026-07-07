import { describe, it, expect } from 'vitest';
import { resolveExpensePaymentCurrency, filterExpensePaymentAccounts } from './expensePaymentCurrency';

describe('resolveExpensePaymentCurrency', () => {
  it('uses the expense currency when set', () => {
    expect(resolveExpensePaymentCurrency('EUR', 'OMR')).toBe('EUR');
  });
  it('falls back to the tenant BASE currency (never a fabricated USD)', () => {
    expect(resolveExpensePaymentCurrency(null, 'OMR')).toBe('OMR');
    expect(resolveExpensePaymentCurrency(undefined, 'OMR')).toBe('OMR');
  });
});

describe('filterExpensePaymentAccounts', () => {
  const accounts = [
    { id: 'a', currency: 'OMR' },
    { id: 'b', currency: 'USD' },
    { id: 'c', currency: null }, // null account currency ⇒ treated as base
  ];

  it('matches accounts in the payment currency', () => {
    const r = filterExpensePaymentAccounts(accounts, 'USD', 'OMR');
    expect(r.map((a) => a.id)).toEqual(['b']);
  });

  it('on an OMR tenant, a base-currency expense keeps OMR accounts selectable (the bug)', () => {
    // pre-fix this defaulted to 'USD' and returned [] for an OMR tenant
    const r = filterExpensePaymentAccounts(accounts, 'OMR', 'OMR');
    expect(r.map((a) => a.id)).toEqual(['a', 'c']); // OMR + null(=base OMR)
  });

  it('never selects a USD account for a base-currency expense on a non-USD tenant', () => {
    const r = filterExpensePaymentAccounts(accounts, 'OMR', 'OMR');
    expect(r.map((a) => a.id)).not.toContain('b');
  });
});

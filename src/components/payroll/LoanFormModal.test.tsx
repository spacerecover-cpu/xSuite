import { describe, it, expect } from 'vitest';
import { computeLoanTerms } from './LoanFormModal';

describe('computeLoanTerms', () => {
  it('ends on the last installment due date, not one month past it', () => {
    // LoanDetailModal schedules installment N at start + (N - 1) months, so a
    // 12-installment loan starting 2026-01-01 ends 2026-12-01.
    expect(
      computeLoanTerms({
        principal: 1200,
        interestRate: 0,
        installments: 12,
        startDate: '2026-01-01',
        decimalPlaces: 2,
      }).endDate,
    ).toBe('2026-12-01');
  });

  it('clamps a month-end start date instead of overflowing into the next month', () => {
    // 2026-08-31 + 6 installments → final installment in Jan 2027 (31 days).
    expect(
      computeLoanTerms({
        principal: 600,
        interestRate: 0,
        installments: 6,
        startDate: '2026-08-31',
        decimalPlaces: 2,
      }).endDate,
    ).toBe('2027-01-31');

    // 2026-01-31 + 1 installment → the start date itself (single installment).
    expect(
      computeLoanTerms({
        principal: 100,
        interestRate: 0,
        installments: 1,
        startDate: '2026-01-31',
        decimalPlaces: 2,
      }).endDate,
    ).toBe('2026-01-31');

    // 2026-01-31 + 2 installments → Feb has 28 days, never 2026-03-03.
    expect(
      computeLoanTerms({
        principal: 100,
        interestRate: 0,
        installments: 2,
        startDate: '2026-01-31',
        decimalPlaces: 2,
      }).endDate,
    ).toBe('2026-02-28');
  });

  it('rounds the installment to the tenant currency precision', () => {
    expect(
      computeLoanTerms({
        principal: 1000,
        interestRate: 0,
        installments: 3,
        startDate: '2026-01-01',
        decimalPlaces: 2,
      }).installmentAmount,
    ).toBe(333.33);

    expect(
      computeLoanTerms({
        principal: 1000,
        interestRate: 0,
        installments: 3,
        startDate: '2026-01-01',
        decimalPlaces: 3,
      }).installmentAmount,
    ).toBe(333.333);
  });

  it('applies the interest rate to the total', () => {
    expect(
      computeLoanTerms({
        principal: 1000,
        interestRate: 10,
        installments: 4,
        startDate: '2026-01-01',
        decimalPlaces: 2,
      }),
    ).toMatchObject({ totalAmount: 1100, installmentAmount: 275 });
  });

  it('returns an empty end date for a missing or malformed start date', () => {
    expect(
      computeLoanTerms({
        principal: 100,
        interestRate: 0,
        installments: 3,
        startDate: '',
        decimalPlaces: 2,
      }).endDate,
    ).toBe('');
  });
});

import { describe, it, expect } from 'vitest';
import { buildPayrollBaseColumns } from './payrollBase';

describe('buildPayrollBaseColumns', () => {
  it('freezes earnings/deductions/net into base at the rate, rounded to base decimals', () => {
    const rc = {
      documentCurrency: 'EUR', documentDecimals: 2,
      baseCurrency: 'OMR', baseDecimals: 3, rate: 0.42, rateSource: 'derived' as const,
    };
    const out = buildPayrollBaseColumns(
      { total_earnings: 1000, total_deductions: 200, net_salary: 800 },
      rc,
    );
    expect(out).toEqual({
      currency: 'EUR', exchange_rate: 0.42, rate_source: 'derived',
      total_earnings_base: 420, total_deductions_base: 84, net_salary_base: 336,
    });
  });
  it('is identity at rate 1 (single-currency tenant)', () => {
    const rc = {
      documentCurrency: 'OMR', documentDecimals: 3,
      baseCurrency: 'OMR', baseDecimals: 3, rate: 1, rateSource: 'derived' as const,
    };
    const out = buildPayrollBaseColumns(
      { total_earnings: 1000, total_deductions: 200, net_salary: 800 },
      rc,
    );
    expect(out.net_salary_base).toBe(800);
    expect(out.exchange_rate).toBe(1);
  });
});

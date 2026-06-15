import { convertToBase } from './financialMath';
import type { RateContext } from './currencyService';

export interface PayrollTotals {
  total_earnings: number;
  total_deductions: number;
  net_salary: number;
}

/** Freeze a payroll record's money fields into the tenant base currency at the
 *  resolved rate. Identity at rate 1 (single-currency tenant). Currency plumbing
 *  only — the statutory payroll rules engine (D5) is Phase 3, out of scope. */
export function buildPayrollBaseColumns(t: PayrollTotals, rc: RateContext) {
  return {
    currency: rc.documentCurrency,
    exchange_rate: rc.rate,
    rate_source: rc.rateSource,
    total_earnings_base: convertToBase(t.total_earnings, rc.rate, rc.baseDecimals),
    total_deductions_base: convertToBase(t.total_deductions, rc.rate, rc.baseDecimals),
    net_salary_base: convertToBase(t.net_salary, rc.rate, rc.baseDecimals),
  };
}

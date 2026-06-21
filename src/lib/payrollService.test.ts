import { describe, it, expect, vi, beforeEach } from 'vitest';

// getDashboardStats fans out across several supabase queries; mock the client
// (env-throwing on import) and route each table to a thenable builder. The
// payroll_records rows are mixed-currency so the assertion proves the dashboard
// totals sum net_salary_base, never the raw native net_salary.
const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('./supabaseClient', () => ({
  supabase: { from, auth: { getUser: vi.fn() } },
  resolveTenantId: vi.fn(),
}));
vi.mock('./currencyService', () => ({ resolveRateContext: vi.fn() }));
vi.mock('./payrollBase', () => ({ buildPayrollBaseColumns: vi.fn(() => ({})) }));

import { payrollService } from './payrollService';

/** Thenable query builder: every chainable method returns the builder; awaiting
 *  it (or calling maybeSingle) yields {data}. `rows` is the resolved payload. */
function makeQuery(rows: unknown) {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'is', 'lte', 'gte', 'order', 'limit']) {
    builder[m] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: rows, error: null }));
  builder.then = (resolve: (v: { data: unknown; error: null; count?: number }) => void) =>
    resolve({ data: rows, error: null, count: Array.isArray(rows) ? rows.length : 0 });
  return builder;
}

beforeEach(() => from.mockReset());

describe('payrollService.getDashboardStats (D7 — cross-record totals must be base currency)', () => {
  it('sums net_salary_base across mixed-currency payroll records, never the raw native net_salary', async () => {
    // 100 @ rate→38 base, plus 50 @ base 50 ⇒ base total 88. Raw native sum would be 150.
    const period = { id: 'period-1', payment_date: '2020-01-28' };
    const records = [
      { net_salary: 100, net_salary_base: 38, status: 'paid' },
      { net_salary: 50, net_salary_base: 50, status: 'approved' },
    ];
    const recordsQuery = makeQuery(records);

    from.mockImplementation((table: string) => {
      if (table === 'payroll_periods') return makeQuery(period);
      if (table === 'employees') return makeQuery([{}, {}]);
      if (table === 'payroll_records') return recordsQuery;
      return makeQuery(null);
    });

    const stats = await payrollService.getDashboardStats();

    expect(stats.totalPayroll).toBe(88);
    expect(stats.avgSalary).toBe(44);
    // the fix is real only if the base shadow is actually selected
    expect(recordsQuery.select).toHaveBeenCalledWith(expect.stringContaining('net_salary_base'));
  });

  it('falls back to the raw net_salary for pre-base transition records (no net_salary_base)', async () => {
    const period = { id: 'period-1', payment_date: '2020-01-28' };
    const records = [{ net_salary: 70, status: 'paid' }];

    from.mockImplementation((table: string) => {
      if (table === 'payroll_periods') return makeQuery(period);
      if (table === 'employees') return makeQuery([{}]);
      if (table === 'payroll_records') return makeQuery(records);
      return makeQuery(null);
    });

    const stats = await payrollService.getDashboardStats();

    expect(stats.totalPayroll).toBe(70);
  });
});

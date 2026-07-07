import { describe, it, expect, vi, beforeEach } from 'vitest';

// getDashboardStats fans out across several supabase queries; mock the client
// (env-throwing on import) and route each table to a thenable builder. The
// payroll_records rows are mixed-currency so the assertion proves the dashboard
// totals sum net_salary_base, never the raw native net_salary.
const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('./supabaseClient', () => ({
  supabase: { from, rpc, auth: { getUser: vi.fn() } },
  resolveTenantId: vi.fn(),
}));
vi.mock('./currencyService', () => ({ resolveRateContext: vi.fn() }));
vi.mock('./payrollBase', () => ({ buildPayrollBaseColumns: vi.fn(() => ({})) }));
vi.mock('./logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { payrollService, computeEmployeePay } from './payrollService';
import { logger } from './logger';

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

beforeEach(() => {
  from.mockReset();
  rpc.mockReset();
});

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

describe('statutory social-security guard (Phase 0)', () => {
  const baseSettings = {
    working_days_per_month: 22,
    working_hours_per_day: 8,
    overtime_rate_multiplier: { regular: 1.5, weekend: 1.5, holiday: 2 },
    payment_day: 28,
  };

  function arrange(
    socialSecurityRate: number | undefined,
    captured: { records?: Array<Record<string, unknown>> },
  ) {
    vi.spyOn(payrollService, 'getPayrollPeriod').mockResolvedValue(
      { id: 'period-1', status: 'draft', start_date: '2026-06-01', end_date: '2026-06-30', period_name: 'Jun 2026' } as never,
    );
    vi.spyOn(payrollService, 'getPayrollSettings').mockResolvedValue(
      { ...baseSettings, social_security_rate: socialSecurityRate } as never,
    );
    vi.spyOn(payrollService, 'getEmployeeAttendance').mockResolvedValue(
      { daysWorked: 22, daysAbsent: 0, daysLeave: 0, regularHours: 176, overtimeHours: 0 } as never,
    );
    vi.spyOn(payrollService, 'getActiveLoans').mockResolvedValue([] as never);
    vi.spyOn(payrollService, 'updatePayrollPeriod').mockResolvedValue(undefined as never);

    from.mockImplementation((table: string) => {
      if (table === 'employees') return makeQuery([{ id: 'emp-1', tenant_id: 't-1', basic_salary: 1000 }]);
      if (table === 'payroll_records') {
        return {
          insert: (rows: Array<Record<string, unknown>>) => {
            captured.records = rows;
            return { select: () => Promise.resolve({ data: rows, error: null }) };
          },
        } as unknown as ReturnType<typeof makeQuery>;
      }
      return makeQuery(null);
    });
  }

  it('skips the deduction and warns loudly when no rate is configured', async () => {
    const captured: { records?: Array<Record<string, unknown>> } = {};
    arrange(undefined, captured);

    await payrollService.processPayroll('period-1');

    expect(captured.records).toHaveLength(1);
    expect(captured.records![0].total_deductions).toBe(0);  // no fabricated 7% PASI
    expect(captured.records![0].net_salary).toBe(1000);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/social-security rate/i));
  });

  it('applies a configured rate exactly (Omani 0.07 keeps working)', async () => {
    const captured: { records?: Array<Record<string, unknown>> } = {};
    arrange(0.07, captured);

    await payrollService.processPayroll('period-1');

    expect(captured.records![0].total_deductions).toBe(70);  // 1000 * 0.07
    expect(captured.records![0].net_salary).toBe(930);
  });
});

describe('bank-file generation is honestly disabled (Phase 0)', () => {
  it('generateBankFile throws the not-configured error and mints nothing', async () => {
    await expect(payrollService.generateBankFile('period-1', 'WPS'))
      .rejects.toThrow(/not configured for this tenant/);

    // No number-sequence RPC call and no payroll_bank_files insert — the
    // placeholder writer must not run any of its side effects.
    expect(rpc).not.toHaveBeenCalledWith('get_next_number', expect.anything());
    expect(from).not.toHaveBeenCalledWith('payroll_bank_files');
  });

  it('generateWPSFileContent throws the same honest error', () => {
    expect(() => payrollService.generateWPSFileContent([])).toThrow(/not configured for this tenant/);
  });
});

describe('computeEmployeePay (Phase 0 — dock unauthorized absence / LOP)', () => {
  const payInput = (o: Record<string, unknown> = {}) => ({
    basicSalary: 1000, workingDaysPerMonth: 22, workingHoursPerDay: 8,
    overtimeMultiplier: 1.5, overtimeHours: 0, daysAbsent: 0,
    socialSecurityRate: null as number | null, loanDeductions: 0,
    ...o,
  });

  it('full attendance, no extras → net == basic salary', () => {
    const r = computeEmployeePay(payInput());
    expect(r.totalEarnings).toBe(1000);
    expect(r.totalDeductions).toBe(0);
    expect(r.netSalary).toBe(1000);
  });

  it('docks unauthorized absence at the daily rate (5 of 22 days absent)', () => {
    const r = computeEmployeePay(payInput({ daysAbsent: 5 }));
    expect(r.absenceDeduction).toBeCloseTo(227.27, 2); // 5 * 1000/22
    expect(r.totalEarnings).toBe(1000);                // basic stays contracted
    expect(r.netSalary).toBeCloseTo(772.73, 2);
  });

  it('never docks more than the basic salary (absence beyond the working-days denominator)', () => {
    const r = computeEmployeePay(payInput({ daysAbsent: 30 }));
    expect(r.absenceDeduction).toBe(1000);
    expect(r.netSalary).toBe(0);
  });

  it('pays overtime at hourly rate × multiplier', () => {
    const r = computeEmployeePay(payInput({ overtimeHours: 10 }));
    expect(r.overtimeAmount).toBeCloseTo(85.23, 2); // 10 * (1000/22/8) * 1.5
    expect(r.totalEarnings).toBeCloseTo(1085.23, 2);
  });

  it('applies a configured social-security rate on the basic', () => {
    const r = computeEmployeePay(payInput({ socialSecurityRate: 0.07 }));
    expect(r.socialSecurityDeduction).toBe(70);
    expect(r.netSalary).toBe(930);
  });

  it('guards a zero working-days config (no divide-by-zero / NaN)', () => {
    const r = computeEmployeePay(payInput({ workingDaysPerMonth: 0, daysAbsent: 5 }));
    expect(r.absenceDeduction).toBe(0);
    expect(r.netSalary).toBe(1000);
  });
});

describe('processPayroll docks unauthorized absence (Phase 0 overpayment fix)', () => {
  function arrangePay(
    over: { daysAbsent?: number },
    captured: { records?: Array<Record<string, unknown>> },
  ) {
    vi.spyOn(payrollService, 'getPayrollPeriod').mockResolvedValue(
      { id: 'period-1', status: 'draft', start_date: '2026-06-01', end_date: '2026-06-30', period_name: 'Jun 2026' } as never,
    );
    vi.spyOn(payrollService, 'getPayrollSettings').mockResolvedValue(
      { working_days_per_month: 22, working_hours_per_day: 8, overtime_rate_multiplier: { regular: 1.5, weekend: 1.5, holiday: 2 }, payment_day: 28, social_security_rate: undefined } as never,
    );
    vi.spyOn(payrollService, 'getEmployeeAttendance').mockResolvedValue(
      { daysWorked: 17, daysAbsent: over.daysAbsent ?? 0, daysLeave: 0, regularHours: 136, overtimeHours: 0 } as never,
    );
    vi.spyOn(payrollService, 'getActiveLoans').mockResolvedValue([] as never);
    vi.spyOn(payrollService, 'updatePayrollPeriod').mockResolvedValue(undefined as never);

    from.mockImplementation((table: string) => {
      if (table === 'employees') return makeQuery([{ id: 'emp-1', tenant_id: 't-1', basic_salary: 1000 }]);
      if (table === 'payroll_records') {
        return {
          insert: (rows: Array<Record<string, unknown>>) => {
            captured.records = rows;
            return { select: () => Promise.resolve({ data: rows, error: null }) };
          },
        } as unknown as ReturnType<typeof makeQuery>;
      }
      return makeQuery(null);
    });
  }

  it('prorates unauthorized absence into the payroll record', async () => {
    const captured: { records?: Array<Record<string, unknown>> } = {};
    arrangePay({ daysAbsent: 5 }, captured);

    await payrollService.processPayroll('period-1');

    expect(captured.records![0].total_deductions as number).toBeCloseTo(227.27, 2);
    expect(captured.records![0].net_salary as number).toBeCloseTo(772.73, 2);
  });

  it('leaves a fully-present employee at full pay', async () => {
    const captured: { records?: Array<Record<string, unknown>> } = {};
    arrangePay({ daysAbsent: 0 }, captured);

    await payrollService.processPayroll('period-1');

    expect(captured.records![0].net_salary).toBe(1000);
  });
});

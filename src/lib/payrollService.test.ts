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
  for (const m of ['select', 'eq', 'in', 'is', 'lte', 'gte', 'order', 'limit', 'update', 'insert']) {
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
  // Each test sets up its own spies in its arrange step; restore between tests so
  // a spyOn(payrollService, ...) from one test never leaks into the next.
  vi.restoreAllMocks();
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
      // The atomic claim (draft -> processing) reads back the still-draft row.
      if (table === 'payroll_periods') return makeQuery({ id: 'period-1', status: 'draft' });
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
      // The atomic claim (draft -> processing) reads back the still-draft row.
      if (table === 'payroll_periods') return makeQuery({ id: 'period-1', status: 'draft' });
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

describe('getCurrentPayrollPeriod is deterministic under overlapping periods (bug #105)', () => {
  it('orders by start_date desc and caps to one row so maybeSingle never sees >1 match', async () => {
    // Two monthly periods both covering today (no DB overlap constraint exists).
    // Without .order().limit(1) the underlying .maybeSingle() throws PGRST116 and
    // rejects getDashboardStats, blanking the payroll dashboard.
    const periodQuery = makeQuery({ id: 'period-newest' });
    from.mockImplementation((table: string) =>
      table === 'payroll_periods' ? periodQuery : makeQuery(null),
    );

    await payrollService.getCurrentPayrollPeriod();

    expect(periodQuery.order).toHaveBeenCalledWith('start_date', { ascending: false });
    expect(periodQuery.limit).toHaveBeenCalledWith(1);
  });
});

describe('getActiveLoans excludes future-dated loans (bug #55)', () => {
  it('filters on start_date <= asOfDate when a period boundary is given', async () => {
    const loansQuery = makeQuery([{ id: 'loan-1', installment_amount: 100 }]);
    from.mockImplementation((table: string) =>
      table === 'employee_loans' ? loansQuery : makeQuery(null),
    );

    await payrollService.getActiveLoans('emp-1', '2026-07-31');

    expect(loansQuery.eq).toHaveBeenCalledWith('status', 'active');
    // the fix: a loan whose repayment window opens after the period is not due yet
    expect(loansQuery.lte).toHaveBeenCalledWith('start_date', '2026-07-31');
  });

  it('omits the start_date filter when called without a date', async () => {
    const loansQuery = makeQuery([]);
    from.mockImplementation(() => loansQuery);

    await payrollService.getActiveLoans('emp-1');

    expect(loansQuery.lte).not.toHaveBeenCalled();
  });
});

describe('processPayroll only deducts loans whose repayment has started (bug #55)', () => {
  it('scopes active-loan lookup to loans due by the period end_date', async () => {
    vi.spyOn(payrollService, 'getPayrollPeriod').mockResolvedValue(
      { id: 'period-1', status: 'draft', start_date: '2026-07-01', end_date: '2026-07-31', period_name: 'Jul 2026' } as never,
    );
    vi.spyOn(payrollService, 'getPayrollSettings').mockResolvedValue(
      { working_days_per_month: 22, working_hours_per_day: 8, overtime_rate_multiplier: { regular: 1.5, weekend: 1.5, holiday: 2 }, payment_day: 28, social_security_rate: undefined } as never,
    );
    vi.spyOn(payrollService, 'getEmployeeAttendance').mockResolvedValue(
      { daysWorked: 22, daysAbsent: 0, daysLeave: 0, regularHours: 176, overtimeHours: 0 } as never,
    );
    const activeLoansSpy = vi.spyOn(payrollService, 'getActiveLoans').mockResolvedValue([] as never);

    from.mockImplementation((table: string) => {
      if (table === 'employees') return makeQuery([{ id: 'emp-1', tenant_id: 't-1', basic_salary: 1000 }]);
      if (table === 'payroll_periods') return makeQuery({ id: 'period-1', status: 'processing' });
      if (table === 'payroll_records') {
        return { insert: (rows: unknown) => ({ select: () => Promise.resolve({ data: rows, error: null }) }) } as never;
      }
      return makeQuery(null);
    });

    await payrollService.processPayroll('period-1');

    expect(activeLoansSpy).toHaveBeenCalledWith('emp-1', '2026-07-31');
  });
});

describe('recordLoanRepayment caps the final rounded installment (bug #89)', () => {
  // Wires getEmployeeLoan -> the given loan, and captures the loan_repayments
  // insert amount and the employee_loans update payload.
  function arrangeLoan(
    loan: Record<string, unknown>,
    captured: { recorded?: number; update?: Record<string, unknown> },
  ) {
    vi.spyOn(payrollService, 'getEmployeeLoan').mockResolvedValue(loan as never);
    from.mockImplementation((table: string) => {
      if (table === 'loan_repayments') {
        return {
          insert: (row: { amount: number }) => {
            captured.recorded = row.amount;
            return { select: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) };
          },
        } as never;
      }
      if (table === 'employee_loans') {
        return {
          update: (payload: Record<string, unknown>) => {
            captured.update = payload;
            return { eq: () => Promise.resolve({ data: null, error: null }) };
          },
        } as never;
      }
      // completion path stamps end_date via currentTenantToday() -> tenants read
      if (table === 'tenants') return makeQuery({ timezone: 'UTC' });
      return makeQuery(null);
    });
  }

  it('never over-collects or writes a negative remaining_amount on the final installment', async () => {
    // 100.00 over 6 installments -> installment 16.67; after 5 deductions the
    // outstanding balance is 16.65, smaller than one scheduled installment.
    const captured: { recorded?: number; update?: Record<string, unknown> } = {};
    arrangeLoan(
      { id: 'loan-1', tenant_id: 't-1', total_amount: 100, remaining_amount: 16.65,
        installment_amount: 16.67, installments: 6, paid_installments: 5, status: 'active', end_date: null },
      captured,
    );

    await payrollService.recordLoanRepayment({ loan_id: 'loan-1', amount: 16.67, payment_date: '2026-07-31' });

    expect(captured.recorded).toBe(16.65);            // capped at outstanding, not the full 16.67
    expect(captured.update!.remaining_amount).toBe(0); // clamped, never the old -0.02
    expect(captured.update!.status).toBe('completed');
  });

  it('completes a loan whose balance clears even if the installment count is not yet reached', async () => {
    const captured: { recorded?: number; update?: Record<string, unknown> } = {};
    arrangeLoan(
      { id: 'loan-2', tenant_id: 't-1', total_amount: 100, remaining_amount: 10,
        installment_amount: 50, installments: 6, paid_installments: 2, status: 'active', end_date: null },
      captured,
    );

    await payrollService.recordLoanRepayment({ loan_id: 'loan-2', amount: 50, payment_date: '2026-07-31' });

    expect(captured.recorded).toBe(10);                // never collects past the 10 owed
    expect(captured.update!.remaining_amount).toBe(0);
    expect(captured.update!.status).toBe('completed'); // balance-based completion, count is only 3/6
  });

  it('records the full installment and decrements the balance mid-loan (normal path intact)', async () => {
    const captured: { recorded?: number; update?: Record<string, unknown> } = {};
    arrangeLoan(
      { id: 'loan-3', tenant_id: 't-1', total_amount: 100, remaining_amount: 100,
        installment_amount: 16.67, installments: 6, paid_installments: 0, status: 'active', end_date: null },
      captured,
    );

    await payrollService.recordLoanRepayment({ loan_id: 'loan-3', amount: 16.67, payment_date: '2026-07-31' });

    expect(captured.recorded).toBe(16.67);
    expect(captured.update!.remaining_amount).toBe(83.33); // roundMoney(100 - 16.67), no float noise
    expect(captured.update!.paid_installments).toBe(1);
    expect(captured.update!.status).toBe('active');        // not completed
  });
});

describe('processPayroll is idempotent under retry/concurrency (bug #19)', () => {
  // The initial getPayrollPeriod read sees 'draft' (a stale read — the period was
  // already claimed by a concurrent run or a prior partial run). `claimResult`
  // drives what the atomic draft->processing CAS reads back: null means it matched
  // zero rows (someone else won), an object means this caller won the claim.
  function arrangeClaim(
    claimResult: unknown,
    captured: { inserted?: boolean; records?: Array<Record<string, unknown>> },
  ) {
    vi.spyOn(payrollService, 'getPayrollPeriod').mockResolvedValue(
      { id: 'period-1', status: 'draft', start_date: '2026-06-01', end_date: '2026-06-30', period_name: 'Jun 2026' } as never,
    );
    vi.spyOn(payrollService, 'getPayrollSettings').mockResolvedValue(
      { working_days_per_month: 22, working_hours_per_day: 8, overtime_rate_multiplier: { regular: 1.5, weekend: 1.5, holiday: 2 }, payment_day: 28, social_security_rate: undefined } as never,
    );
    vi.spyOn(payrollService, 'getEmployeeAttendance').mockResolvedValue(
      { daysWorked: 22, daysAbsent: 0, daysLeave: 0, regularHours: 176, overtimeHours: 0 } as never,
    );
    vi.spyOn(payrollService, 'getActiveLoans').mockResolvedValue([] as never);

    from.mockImplementation((table: string) => {
      if (table === 'employees') return makeQuery([{ id: 'emp-1', tenant_id: 't-1', basic_salary: 1000 }]);
      if (table === 'payroll_periods') return makeQuery(claimResult);
      if (table === 'payroll_records') {
        return {
          insert: (rows: Array<Record<string, unknown>>) => {
            captured.inserted = true;
            captured.records = rows;
            return { select: () => Promise.resolve({ data: rows, error: null }) };
          },
        } as unknown as ReturnType<typeof makeQuery>;
      }
      return makeQuery(null);
    });
  }

  it('aborts when the period is no longer draft — no duplicate records inserted, no loans re-deducted', async () => {
    const captured: { inserted?: boolean } = {};
    arrangeClaim(null, captured); // claim CAS matches zero rows: already claimed

    await expect(payrollService.processPayroll('period-1')).rejects.toThrow(/already being processed/i);
    expect(captured.inserted).toBeUndefined(); // the records insert never ran
  });

  it('claims the period BEFORE inserting records on a fresh run', async () => {
    const captured: { inserted?: boolean } = {};
    arrangeClaim({ id: 'period-1', status: 'processing' }, captured); // claim CAS wins

    const result = await payrollService.processPayroll('period-1');

    expect(captured.inserted).toBe(true);
    expect(result.success).toBe(true);
  });
});

describe('getEmployeeAttendance excludes soft-deleted rows (bug #59)', () => {
  it('filters attendance_records on deleted_at IS NULL so cancelled absences never drive pay', async () => {
    const attQuery = makeQuery([]);
    from.mockImplementation((table: string) =>
      table === 'attendance_records' ? attQuery : makeQuery(null),
    );

    await payrollService.getEmployeeAttendance('emp-1', '2026-06-01', '2026-06-30');

    // Without this filter a soft-deleted 'absent'/overtime row still counts into
    // daysAbsent/overtimeHours and corrupts net pay — every other payroll read
    // filters deleted_at; this pay-affecting query must too.
    expect(attQuery.is).toHaveBeenCalledWith('deleted_at', null);
  });
});

describe('period status cascades onto payroll_records (bug #60)', () => {
  it('approvePayroll advances the period records to approved (not left on calculated)', async () => {
    const recordsQuery = makeQuery(null);
    from.mockImplementation((table: string) =>
      table === 'payroll_records' ? recordsQuery : makeQuery({ id: 'period-1', status: 'approved' }),
    );

    await payrollService.approvePayroll('period-1', 'user-1');

    expect(recordsQuery.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }));
    expect(recordsQuery.eq).toHaveBeenCalledWith('period_id', 'period-1');
    expect(recordsQuery.is).toHaveBeenCalledWith('deleted_at', null); // skip soft-deleted rows
  });

  it('markPayrollAsPaid advances the period records to paid', async () => {
    const recordsQuery = makeQuery(null);
    from.mockImplementation((table: string) =>
      table === 'payroll_records' ? recordsQuery : makeQuery({ id: 'period-1', status: 'paid' }),
    );

    await payrollService.markPayrollAsPaid('period-1', 'user-1');

    expect(recordsQuery.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'paid' }));
    expect(recordsQuery.eq).toHaveBeenCalledWith('period_id', 'period-1');
  });
});

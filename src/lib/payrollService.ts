import { supabase, resolveTenantId } from './supabaseClient';
import type { Database, Json } from '../types/database.types';
import { resolveRateContext } from './currencyService';
import { buildPayrollBaseColumns } from './payrollBase';
import { baseAmount, roundMoney } from './financialMath';
import { currentTenantToday } from './tenantToday';
import { logger } from './logger';

type PayrollPeriod = Database['public']['Tables']['payroll_periods']['Row'];
type PayrollPeriodInsert = Database['public']['Tables']['payroll_periods']['Insert'];
type PayrollAdjustment = Database['public']['Tables']['payroll_adjustments']['Row'];
type PayrollAdjustmentInsert = Database['public']['Tables']['payroll_adjustments']['Insert'];
type EmployeeLoan = Database['public']['Tables']['employee_loans']['Row'];
type EmployeeLoanInsert = Database['public']['Tables']['employee_loans']['Insert'];
type LoanRepayment = Database['public']['Tables']['loan_repayments']['Row'];
type PayrollSettings = Database['public']['Tables']['payroll_settings']['Row'];
type PayrollRecordInsert = Database['public']['Tables']['payroll_records']['Insert'];
type EmployeeSalaryStructure = Database['public']['Tables']['employee_salary_structures']['Row'];
type EmployeeSalaryStructureInsert = Database['public']['Tables']['employee_salary_structures']['Insert'];

export interface PayrollDashboardStats {
  totalPayroll: number;
  employeeCount: number;
  pendingApprovals: number;
  processedThisMonth: number;
  avgSalary: number;
  upcomingPaymentDate: string | null;
}

export interface ProcessPayrollOptions {
  employeeIds?: string[];
  includePendingAdjustments?: boolean;
}

export interface EmployeePayInput {
  basicSalary: number;
  workingDaysPerMonth: number;
  workingHoursPerDay: number;
  overtimeMultiplier: number;
  overtimeHours: number;
  daysAbsent: number;
  socialSecurityRate: number | null;
  loanDeductions: number;
}

export interface EmployeePayResult {
  overtimeAmount: number;
  absenceDeduction: number;
  socialSecurityDeduction: number;
  totalEarnings: number;
  totalDeductions: number;
  netSalary: number;
}

/** Compute one employee's pay for a period. Unauthorized ABSENCE ('absent' days)
 *  is Loss of Pay, docked at the daily rate but never more than the basic salary;
 *  approved leave ('leave' days) is presumed PAID and is NOT docked here
 *  (distinguishing unpaid-leave types is a Phase-1 item). Rates are guarded against
 *  a zero config. Pending payroll_adjustments are intentionally NOT applied here —
 *  see the note in processPayroll. */
export function computeEmployeePay(input: EmployeePayInput): EmployeePayResult {
  const dailyRate = input.workingDaysPerMonth > 0 ? input.basicSalary / input.workingDaysPerMonth : 0;
  const hourlyRate = input.workingHoursPerDay > 0 ? dailyRate / input.workingHoursPerDay : 0;

  const overtimeAmount = Number(input.overtimeHours || 0) * hourlyRate * input.overtimeMultiplier;
  // LOP can never dock more than the basic salary (guards a period whose absent
  // days exceed the configured working-days denominator).
  const absenceDeduction = Math.min(
    input.basicSalary,
    Math.max(0, Number(input.daysAbsent || 0)) * dailyRate,
  );

  const socialSecurityDeduction = input.socialSecurityRate == null ? 0 : input.basicSalary * input.socialSecurityRate;
  const totalEarnings = input.basicSalary + overtimeAmount;
  const totalDeductions = absenceDeduction + socialSecurityDeduction + input.loanDeductions;
  const netSalary = totalEarnings - totalDeductions;

  return { overtimeAmount, absenceDeduction, socialSecurityDeduction, totalEarnings, totalDeductions, netSalary };
}

/** The amount to collect for one loan this period: the fixed installment, but
 *  never more than the outstanding balance. installment_amount is stored rounded
 *  to 2dp, so N installments can sum to slightly more than total_amount — the
 *  final scheduled installment must not over-collect past the balance nor drive
 *  remaining_amount negative (bug #89). Used for BOTH the net-pay deduction and
 *  the recorded repayment so the payroll record and the loan ledger stay in
 *  lock-step. */
function scheduledLoanDeduction(
  loan: Pick<EmployeeLoan, 'installment_amount' | 'remaining_amount' | 'total_amount'>,
): number {
  const outstanding = Math.max(0, Number(loan.remaining_amount ?? loan.total_amount));
  return Math.min(Number(loan.installment_amount ?? 0), outstanding);
}

interface PayrollSettingsValues {
  working_days_per_month: number;
  working_hours_per_day: number;
  overtime_rate_multiplier: { regular: number; weekend: number; holiday: number };
  social_security_rate?: number;
  currency: { code: string; symbol: string; decimals: number };
  payment_day: number;
}

const DEFAULT_PAYROLL_SETTINGS: PayrollSettingsValues = {
  working_days_per_month: 22,
  working_hours_per_day: 8,
  overtime_rate_multiplier: { regular: 1.25, weekend: 1.5, holiday: 2.0 },
  currency: { code: 'USD', symbol: '$', decimals: 2 },
  payment_day: 28,
};

function parsePayrollSettings(row: PayrollSettings | null): PayrollSettingsValues {
  if (!row) return DEFAULT_PAYROLL_SETTINGS;
  const raw = (row.settings ?? {}) as Record<string, unknown>;
  const overtimeRaw = raw.overtime_rate_multiplier as
    | { regular?: number; weekend?: number; holiday?: number }
    | undefined;
  const currencyRaw = raw.currency as
    | { code?: string; symbol?: string; decimals?: number }
    | undefined;
  return {
    working_days_per_month:
      typeof raw.working_days_per_month === 'number'
        ? raw.working_days_per_month
        : DEFAULT_PAYROLL_SETTINGS.working_days_per_month,
    working_hours_per_day:
      typeof raw.working_hours_per_day === 'number'
        ? raw.working_hours_per_day
        : DEFAULT_PAYROLL_SETTINGS.working_hours_per_day,
    overtime_rate_multiplier: {
      regular: overtimeRaw?.regular ?? DEFAULT_PAYROLL_SETTINGS.overtime_rate_multiplier.regular,
      weekend: overtimeRaw?.weekend ?? DEFAULT_PAYROLL_SETTINGS.overtime_rate_multiplier.weekend,
      holiday: overtimeRaw?.holiday ?? DEFAULT_PAYROLL_SETTINGS.overtime_rate_multiplier.holiday,
    },
    social_security_rate:
      typeof row.social_security_rate === 'number' ? row.social_security_rate : undefined,
    currency: {
      code: currencyRaw?.code ?? DEFAULT_PAYROLL_SETTINGS.currency.code,
      symbol: currencyRaw?.symbol ?? DEFAULT_PAYROLL_SETTINGS.currency.symbol,
      decimals: currencyRaw?.decimals ?? DEFAULT_PAYROLL_SETTINGS.currency.decimals,
    },
    payment_day:
      typeof raw.payment_day === 'number' ? raw.payment_day : DEFAULT_PAYROLL_SETTINGS.payment_day,
  };
}

export const payrollService = {
  // ============================================================================
  // SALARY COMPONENTS
  // ============================================================================

  async getSalaryComponents() {
    const { data, error } = await supabase
      .from('salary_components')
      .select('*')
      .is('deleted_at', null)
      .order('sort_order');

    if (error) throw error;
    return data;
  },

  async getSalaryComponent(id: string) {
    const { data, error } = await supabase
      .from('salary_components')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async createSalaryComponent(component: Database['public']['Tables']['salary_components']['Insert']) {
    const { data, error } = await supabase
      .from('salary_components')
      // Stamp the real tenant: the trigger only fills NULL, and '' (some callers'
      // placeholder) fails the uuid cast. resolveTenantId() owns this centrally.
      .insert({ ...component, tenant_id: await resolveTenantId() })
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async updateSalaryComponent(id: string, updates: Partial<Database['public']['Tables']['salary_components']['Update']>) {
    const { data, error } = await supabase
      .from('salary_components')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async deleteSalaryComponent(id: string) {
    const { error } = await supabase
      .from('salary_components')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  },

  // ============================================================================
  // PAYROLL PERIODS
  // ============================================================================

  async getPayrollPeriods(filters?: { status?: string; year?: number }) {
    let query = supabase
      .from('payroll_periods')
      .select('*')
      .is('deleted_at', null)
      .order('start_date', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.year) {
      const startOfYear = `${filters.year}-01-01`;
      const endOfYear = `${filters.year}-12-31`;
      query = query.gte('start_date', startOfYear).lte('start_date', endOfYear);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as PayrollPeriod[];
  },

  async getPayrollPeriod(id: string) {
    const { data, error } = await supabase
      .from('payroll_periods')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) throw error;
    return data as PayrollPeriod | null;
  },

  async getCurrentPayrollPeriod() {
    const now = new Date();
    // Multiple overlapping monthly periods can cover today (there is no DB
    // overlap/uniqueness constraint on payroll_periods, and the UI lets an admin
    // create a duplicate current-month period). Order deterministically and cap
    // to one row so .maybeSingle() never sees >1 match and throws PGRST116 —
    // which would otherwise reject getDashboardStats and blank the dashboard.
    const { data, error } = await supabase
      .from('payroll_periods')
      .select('*')
      .lte('start_date', now.toISOString().split('T')[0])
      .gte('end_date', now.toISOString().split('T')[0])
      .eq('period_type', 'monthly')
      .is('deleted_at', null)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data as PayrollPeriod | null;
  },

  async createPayrollPeriod(data: PayrollPeriodInsert) {
    const { data: period, error } = await supabase
      .from('payroll_periods')
      .insert({ ...data, tenant_id: await resolveTenantId() })
      .select()
      .maybeSingle();

    if (error) throw error;
    return period as PayrollPeriod;
  },

  async updatePayrollPeriod(id: string, updates: Partial<PayrollPeriodInsert>) {
    const { data, error } = await supabase
      .from('payroll_periods')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data as PayrollPeriod;
  },

  async approvePayroll(periodId: string, approvedBy: string) {
    const period = await this.updatePayrollPeriod(periodId, {
      status: 'approved',
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
    });
    // Records are inserted 'calculated' and were never advanced afterwards, so
    // the dashboard "Processed This Month" count and the per-employee status
    // badge stayed stuck on 'calculated' even in approved/paid periods (bug #60).
    // Cascade the period status onto its records so both surfaces stay truthful.
    await this.setPeriodRecordsStatus(periodId, 'approved');
    return period;
  },

  async approvePayrollPeriod(periodId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');
    return this.approvePayroll(periodId, user.id);
  },

  async markPayrollAsPaid(periodId: string, paidBy: string) {
    const period = await this.updatePayrollPeriod(periodId, {
      status: 'paid',
      paid_by: paidBy,
      paid_at: new Date().toISOString(),
    });
    // Advance the period's records to 'paid' too (bug #60) — see approvePayroll.
    await this.setPeriodRecordsStatus(periodId, 'paid');
    return period;
  },

  /** Cascade a period-level status transition onto its payroll_records. Records
   *  are created 'calculated' by processPayroll and no other path mutates their
   *  status, so approve/mark-paid must propagate here or the dashboard count and
   *  the per-employee status badge never leave 'calculated' (bug #60). Skips
   *  soft-deleted rows; tenant scoping is enforced by RLS. */
  async setPeriodRecordsStatus(periodId: string, status: string) {
    const { error } = await supabase
      .from('payroll_records')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('period_id', periodId)
      .is('deleted_at', null);

    if (error) throw error;
  },

  async markPayrollPeriodAsPaid(periodId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');
    return this.markPayrollAsPaid(periodId, user.id);
  },

  // ============================================================================
  // PAYROLL RECORDS
  // ============================================================================

  async getPayrollRecords(periodId: string) {
    const { data, error } = await supabase
      .from('payroll_records')
      .select(`
        *,
        employee:employees(id, first_name, last_name, employee_number, bank_name, bank_account_number)
      `)
      .eq('period_id', periodId)
      .is('deleted_at', null)
      .order('created_at');

    if (error) throw error;
    return data;
  },

  async getPayrollRecord(id: string) {
    const { data, error } = await supabase
      .from('payroll_records')
      .select(`
        *,
        employee:employees(id, first_name, last_name, employee_number, department:departments(name), position:positions(title))
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async getEmployeePayrollHistory(employeeId: string, limit = 12) {
    const { data, error } = await supabase
      .from('payroll_records')
      .select(`
        *,
        period:payroll_periods(period_name, start_date, end_date, payment_date)
      `)
      .eq('employee_id', employeeId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  },

  async getPayrollRecordItems(recordId: string) {
    const { data, error } = await supabase
      .from('payroll_record_items')
      .select('*')
      .eq('record_id', recordId)
      .order('component_type')
      .order('sort_order');

    if (error) throw error;
    return data;
  },

  // ============================================================================
  // PAYROLL PROCESSING
  // ============================================================================

  async processPayroll(periodId: string, options: ProcessPayrollOptions = {}) {
    const period = await this.getPayrollPeriod(periodId);
    if (!period) throw new Error('Payroll period not found');
    if (period.status !== 'draft') throw new Error('Payroll period is not in draft status');

    let employeesQuery = supabase
      .from('employees')
      .select(`
        *,
        department:departments(name),
        position:positions(title)
      `)
      .eq('employment_status', 'active');

    if (options.employeeIds && options.employeeIds.length > 0) {
      employeesQuery = employeesQuery.in('id', options.employeeIds);
    }

    const { data: employees, error: empError } = await employeesQuery;
    if (empError) throw empError;

    const settings = await this.getPayrollSettings();
    const workingDaysPerMonth = settings.working_days_per_month || 22;
    const workingHoursPerDay = settings.working_hours_per_day || 8;

    // NOTE: options.includePendingAdjustments is accepted for API stability, but
    // applying payroll_adjustments to net pay is a scoped follow-up. Doing it
    // safely requires the row's `is_deduction` flag (not a type guess), a decision
    // on pending-vs-approved status, and stamping/period-linking applied rows so
    // they are never double-applied across runs. Until then adjustments are NOT
    // auto-applied — previously they were fetched here and silently discarded
    // (same net-pay effect, minus the wasted query).

    const records: PayrollRecordInsert[] = [];
    const tenantId = employees && employees.length > 0 ? employees[0].tenant_id : null;

    // Statutory deductions are COUNTRY facts, not universal constants. An unset
    // rate means the deduction is SKIPPED with a loud warning — never a fabricated
    // Omani 7% (country payroll packs land in localization Phase 6).
    const socialSecurityRate = settings.social_security_rate ?? null;
    if (socialSecurityRate == null) {
      logger.warn(
        'payroll: no statutory social-security rate configured for this tenant — the deduction is SKIPPED. ' +
        'Set it in Payroll Settings before relying on net-pay figures.',
      );
    }
    const overtimeMultiplier = settings.overtime_rate_multiplier.regular;

    // Multi-currency closure (D7): freeze currency + rate + *_base on each payroll
    // record. Resolve ONE rate context per run at the tenant base currency. We
    // deliberately do NOT pass settings.currency.code here: it defaults to 'USD'
    // (a fail-loud violation) and would convert base-currency salaries as if they
    // were USD. Per-employee functional-currency payroll is Phase 3 (D5), not here.
    const rc = await resolveRateContext(undefined, period.end_date, null);

    // Loan repayments are collected here and posted only AFTER payroll_records
    // are committed (below), so a failed records insert can never leave loans
    // deducted with no payroll record behind them.
    const pendingLoanRepayments: Array<{
      loan_id: string;
      amount: number;
      payment_date: string;
      payment_method: string;
      notes: string;
    }> = [];

    for (const employee of employees || []) {
      const basicSalary = Number(employee.basic_salary || 0);
      if (!basicSalary) continue;

      const attendance = await this.getEmployeeAttendance(
        employee.id,
        period.start_date,
        period.end_date
      );

      const activeLoans = await this.getActiveLoans(employee.id, period.end_date);
      const loanDeductions = activeLoans.reduce(
        (sum, loan) => sum + scheduledLoanDeduction(loan),
        0
      );

      // Unauthorized absence is docked (Loss of Pay) and overtime paid —
      // previously the fetched absence days were ignored, overstating net pay.
      const { overtimeAmount, totalEarnings, totalDeductions, netSalary } = computeEmployeePay({
        basicSalary,
        workingDaysPerMonth,
        workingHoursPerDay,
        overtimeMultiplier,
        overtimeHours: Number(attendance.overtimeHours || 0),
        daysAbsent: attendance.daysAbsent,
        socialSecurityRate,
        loanDeductions,
      });

      records.push({
        tenant_id: employee.tenant_id,
        period_id: periodId,
        employee_id: employee.id,
        basic_salary: basicSalary,
        working_days: workingDaysPerMonth,
        hours_worked: attendance.regularHours,
        overtime_hours: attendance.overtimeHours,
        overtime_amount: overtimeAmount,
        total_earnings: totalEarnings,
        total_deductions: totalDeductions,
        net_salary: netSalary,
        ...buildPayrollBaseColumns(
          { total_earnings: totalEarnings, total_deductions: totalDeductions, net_salary: netSalary },
          rc,
        ),
        status: 'calculated',
      });

      for (const loan of activeLoans) {
        pendingLoanRepayments.push({
          loan_id: loan.id,
          amount: scheduledLoanDeduction(loan),
          payment_date: period.end_date,
          payment_method: 'payroll_deduction',
          notes: `Automatic deduction for ${period.period_name}`,
        });
      }
    }

    void tenantId;

    if (records.length > 0) {
      // eslint-disable-next-line xsuite/no-raw-currency-aggregation -- single-currency: records[] is built in this one processPayroll run under a single resolved rate context (rc); summing the document amounts is correct here
      const totalGross = records.reduce((sum, r) => sum + Number(r.total_earnings ?? 0), 0);
      // eslint-disable-next-line xsuite/no-raw-currency-aggregation -- single-currency: records[] is built in this one processPayroll run under a single resolved rate context (rc); summing the document amounts is correct here
      const totalDeductions = records.reduce(
        (sum, r) => sum + Number(r.total_deductions ?? 0),
        0
      );
      // eslint-disable-next-line xsuite/no-raw-currency-aggregation -- single-currency: records[] is built in this one processPayroll run under a single resolved rate context (rc); summing the document amounts is correct here
      const totalNet = records.reduce((sum, r) => sum + Number(r.net_salary ?? 0), 0);

      // Idempotency + concurrency guard: CLAIM the period by flipping it out of
      // 'draft' BEFORE inserting any payroll_records or posting loan repayments,
      // conditional on it STILL being 'draft'. A single UPDATE ... WHERE
      // status = 'draft' is atomic in Postgres, so of two concurrent runs — or a
      // retry after a mid-run failure — exactly one matches the row and proceeds;
      // every other caller matches zero rows and aborts here, before it can write
      // a duplicate set of records or double-deduct a loan. Doing this write FIRST
      // also relocates the previously-last, failure-prone period update to the
      // front: if it fails (e.g. the transient network drop in the original bug)
      // nothing else has been written yet, so a retry has nothing to duplicate.
      //
      // This is the app-level guard. A DB-side SECURITY DEFINER RPC (records +
      // loans + status in ONE transaction) plus a partial unique constraint on
      // payroll_records(period_id, employee_id) WHERE deleted_at IS NULL are the
      // belt-and-suspenders backstop — see cross-file notes.
      const { data: claimed, error: claimError } = await supabase
        .from('payroll_periods')
        .update({
          status: 'processing',
          total_gross: totalGross,
          total_deductions: totalDeductions,
          total_net: totalNet,
          employee_count: records.length,
          updated_at: new Date().toISOString(),
        })
        .eq('id', periodId)
        .eq('status', 'draft')
        .is('deleted_at', null)
        .select()
        .maybeSingle();

      if (claimError) throw claimError;
      if (!claimed) {
        // The period was already claimed by a concurrent run, or it left 'draft'
        // between the initial read and this write. Do NOT insert a second set of
        // records or re-run loan deductions.
        throw new Error('Payroll period is already being processed');
      }

      const { data: createdRecords, error: recordError } = await supabase
        .from('payroll_records')
        .insert(records)
        .select();

      if (recordError) throw recordError;

      // Post loan repayments now that the period is claimed and payroll_records
      // are committed, so neither a records-insert failure nor a retry can
      // deduct loans without a backing record.
      for (const repayment of pendingLoanRepayments) {
        await this.recordLoanRepayment(repayment);
      }

      return {
        success: true,
        recordsCreated: createdRecords?.length ?? 0,
        totalGross,
        totalNet,
      };
    }

    return { success: false, recordsCreated: 0, totalGross: 0, totalNet: 0 };
  },

  async getEmployeeAttendance(employeeId: string, startDate: string, endDate: string) {
    const { data, error } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('employee_id', employeeId)
      .gte('date', startDate)
      .lte('date', endDate)
      .is('deleted_at', null);

    if (error) throw error;

    const daysWorked = data?.filter(d => d.status === 'present').length || 0;
    const daysAbsent = data?.filter(d => d.status === 'absent').length || 0;
    const daysLeave = data?.filter(d => d.status === 'leave').length || 0;
    const regularHours = data?.reduce((sum, d) => sum + (d.hours_worked || 0), 0) || 0;
    const overtimeHours = data?.reduce((sum, d) => sum + (d.overtime_hours || 0), 0) || 0;

    return {
      daysWorked,
      daysAbsent,
      daysLeave,
      regularHours,
      overtimeHours,
    };
  },

  // ============================================================================
  // ADJUSTMENTS
  // ============================================================================

  async getPayrollAdjustments(filters?: { status?: string; employeeId?: string }) {
    let query = supabase
      .from('payroll_adjustments')
      .select(`
        *,
        employee:employees(first_name, last_name, employee_number)
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.employeeId) {
      query = query.eq('employee_id', filters.employeeId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async getPendingAdjustments(employeeId?: string) {
    let query = supabase
      .from('payroll_adjustments')
      .select('*')
      .eq('status', 'pending')
      .is('deleted_at', null);

    if (employeeId) {
      query = query.eq('employee_id', employeeId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as PayrollAdjustment[];
  },

  async createPayrollAdjustment(data: PayrollAdjustmentInsert) {
    const { data: adjustment, error } = await supabase
      .from('payroll_adjustments')
      .insert({ ...data, tenant_id: await resolveTenantId() })
      .select()
      .maybeSingle();

    if (error) throw error;
    return adjustment as PayrollAdjustment;
  },

  async approveAdjustment(id: string, approvedBy: string) {
    const { data, error } = await supabase
      .from('payroll_adjustments')
      .update({
        status: 'approved',
        approved_by: approvedBy,
        approved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data as PayrollAdjustment;
  },

  async approvePayrollAdjustment(id: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');
    return this.approveAdjustment(id, user.id);
  },

  async cancelAdjustment(id: string) {
    const { data, error } = await supabase
      .from('payroll_adjustments')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data as PayrollAdjustment;
  },

  async cancelPayrollAdjustment(id: string) {
    return this.cancelAdjustment(id);
  },

  // ============================================================================
  // EMPLOYEE LOANS
  // ============================================================================

  async getEmployeeLoans(filters?: { status?: string; employeeId?: string }) {
    let query = supabase
      .from('employee_loans')
      .select(`
        *,
        employee:employees(first_name, last_name, employee_number)
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.employeeId) {
      query = query.eq('employee_id', filters.employeeId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async getEmployeeLoan(id: string) {
    const { data, error } = await supabase
      .from('employee_loans')
      .select(`
        *,
        employee:employees(first_name, last_name, employee_number)
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async getActiveLoans(employeeId: string, asOfDate?: string) {
    let query = supabase
      .from('employee_loans')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('status', 'active')
      .is('deleted_at', null);

    // start_date is the due date of installment #1 (LoanDetailModal builds the
    // repayment schedule as start_date + i months), so a loan whose repayment
    // window opens AFTER the period must not be deducted yet. Only pull loans
    // whose first installment is due on or before asOfDate (the period end).
    if (asOfDate) {
      query = query.lte('start_date', asOfDate);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as EmployeeLoan[];
  },

  async createEmployeeLoan(data: EmployeeLoanInsert) {
    const { data: nextNumber } = await supabase.rpc('get_next_number', {
      p_scope: 'loan',
    });

    const loanData: EmployeeLoanInsert = {
      ...data,
      loan_number: nextNumber || `LOAN-${Date.now()}`,
      tenant_id: await resolveTenantId(),
    };

    const { data: loan, error } = await supabase
      .from('employee_loans')
      .insert(loanData)
      .select()
      .maybeSingle();

    if (error) throw error;
    return loan as EmployeeLoan;
  },

  async approveLoan(id: string, approvedBy: string) {
    const { data, error } = await supabase
      .from('employee_loans')
      .update({
        status: 'active',
        approved_by: approvedBy,
        approved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data as EmployeeLoan;
  },

  async getLoanRepaymentHistory(loanId: string) {
    const { data, error } = await supabase
      .from('loan_repayments')
      .select('*')
      .eq('loan_id', loanId)
      .order('repayment_date', { ascending: false });

    if (error) throw error;
    return data as LoanRepayment[];
  },

  async recordLoanRepayment(repayment: {
    loan_id: string;
    amount: number;
    payment_date: string;
    payment_method?: string;
    notes?: string;
  }) {
    const loan = await this.getEmployeeLoan(repayment.loan_id);
    if (!loan) throw new Error('Loan not found');

    // Never collect (or record) more than the outstanding balance. The stored
    // installment_amount is rounded to 2dp, so N installments can sum past the
    // loan total; an uncapped final deduction over-collects and drives
    // remaining_amount negative, polluting outstanding-balance aggregations (bug #89).
    const outstanding = Math.max(0, Number(loan.remaining_amount ?? loan.total_amount));
    const appliedAmount = Math.min(repayment.amount, outstanding);

    const repaymentInsert: Database['public']['Tables']['loan_repayments']['Insert'] = {
      tenant_id: loan.tenant_id,
      loan_id: repayment.loan_id,
      amount: appliedAmount,
      repayment_date: repayment.payment_date,
      payment_method: repayment.payment_method || 'payroll_deduction',
      notes: repayment.notes,
    };

    const { data, error } = await supabase
      .from('loan_repayments')
      .insert(repaymentInsert)
      .select()
      .maybeSingle();

    if (error) throw error;

    const newRemainingAmount = roundMoney(Math.max(0, outstanding - appliedAmount));
    const newPaidInstallments = (loan.paid_installments || 0) + 1;
    // Complete on either the scheduled installment count OR a cleared balance, so
    // a loan is never left 'active' owing nothing (rounding rounded down) nor
    // 'completed' while still owing.
    const isCompleted = newPaidInstallments >= loan.installments || newRemainingAmount <= 0;

    const { error: updateError } = await supabase
      .from('employee_loans')
      .update({
        remaining_amount: newRemainingAmount,
        paid_installments: newPaidInstallments,
        status: isCompleted ? 'completed' : loan.status,
        end_date: isCompleted ? await currentTenantToday() : loan.end_date,
      })
      .eq('id', repayment.loan_id);

    if (updateError) throw updateError;

    return data;
  },

  // ============================================================================
  // EMPLOYEE SALARY STRUCTURES
  // ============================================================================

  async getEmployeeSalaryStructure(employeeId: string) {
    const { data, error } = await supabase
      .from('employee_salary_structures')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('is_current', true)
      .is('deleted_at', null)
      .order('effective_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data as EmployeeSalaryStructure | null;
  },

  async createEmployeeSalaryStructure(data: EmployeeSalaryStructureInsert) {
    await supabase
      .from('employee_salary_structures')
      .update({ is_current: false })
      .eq('employee_id', data.employee_id)
      .eq('is_current', true);

    const { data: structure, error } = await supabase
      .from('employee_salary_structures')
      .insert({ ...data, is_current: true })
      .select()
      .maybeSingle();

    if (error) throw error;
    return structure as EmployeeSalaryStructure;
  },

  // ============================================================================
  // SETTINGS
  // ============================================================================

  async getPayrollSettings(): Promise<PayrollSettingsValues> {
    const { data, error } = await supabase
      .from('payroll_settings')
      .select('*')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return parsePayrollSettings(data as PayrollSettings | null);
  },

  async updatePayrollSettings(settings: PayrollSettingsValues) {
    const { data: existing, error: fetchError } = await supabase
      .from('payroll_settings')
      .select('id, settings')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) throw fetchError;

    const merged = {
      ...((existing?.settings ?? {}) as Record<string, unknown>),
      working_days_per_month: settings.working_days_per_month,
      working_hours_per_day: settings.working_hours_per_day,
      overtime_rate_multiplier: settings.overtime_rate_multiplier,
      currency: settings.currency,
      payment_day: settings.payment_day,
    } as Json;

    if (existing?.id) {
      const { error } = await supabase
        .from('payroll_settings')
        .update({ settings: merged, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('payroll_settings')
        .insert({ settings: merged } as Database['public']['Tables']['payroll_settings']['Insert']);
      if (error) throw error;
    }

    return true;
  },

  async resetPayrollSettings() {
    const { error } = await supabase
      .from('payroll_settings')
      .update({ deleted_at: new Date().toISOString() })
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error) throw error;
    return true;
  },

  // ============================================================================
  // DASHBOARD STATS
  // ============================================================================

  async getDashboardStats(): Promise<PayrollDashboardStats> {
    const currentPeriod = await this.getCurrentPayrollPeriod();

    const { count: employeeCount } = await supabase
      .from('employees')
      .select('*', { count: 'exact', head: true })
      .eq('employment_status', 'active');

    const { data: pendingPeriods } = await supabase
      .from('payroll_periods')
      .select('*')
      .in('status', ['draft', 'processing'])
      .is('deleted_at', null);

    let totalPayroll = 0;
    let processedThisMonth = 0;

    if (currentPeriod) {
      const { data: records } = await supabase
        .from('payroll_records')
        .select('net_salary, net_salary_base, status')
        .eq('period_id', currentPeriod.id)
        .is('deleted_at', null);

      totalPayroll = records?.reduce((sum, r) => sum + baseAmount(r, 'net_salary'), 0) || 0;
      processedThisMonth = records?.filter(r => r.status === 'paid' || r.status === 'approved').length || 0;
    }

    return {
      totalPayroll,
      employeeCount: employeeCount || 0,
      pendingApprovals: pendingPeriods?.length || 0,
      processedThisMonth,
      avgSalary: employeeCount ? totalPayroll / employeeCount : 0,
      upcomingPaymentDate: currentPeriod?.payment_date || null,
    };
  },

  // ============================================================================
  // BANK FILES
  // ============================================================================

  async generateBankFile(_periodId: string, _format: 'WPS' | 'ACH' | 'custom' = 'WPS'): Promise<never> {
    // Honest disable (localization Phase 0): the previous writer emitted a
    // pipe-delimited placeholder with hardcoded 'USD' and 'Bank Muscat' — not WPS
    // SIF, not NACHA, not BACS; no bank accepts it and it truncated 3-decimal OMR
    // salaries. Real country bank-file formats arrive with the Phase-6 payroll
    // packs (PayrollPack.bankFileOps: 'om_wps_sif', 'us_nacha', 'uk_bacs').
    throw new Error(
      'Salary bank-file generation is not configured for this tenant yet. The previous export produced a ' +
      'non-compliant placeholder file (wrong currency, wrong format) and has been disabled. Country-specific ' +
      'bank formats (WPS SIF, NACHA, BACS) ship with the payroll country packs.',
    );
  },

  generateWPSFileContent(_records: Array<Record<string, unknown>>): string {
    throw new Error(
      'WPS file generation is not configured for this tenant yet — see generateBankFile.',
    );
  },
};

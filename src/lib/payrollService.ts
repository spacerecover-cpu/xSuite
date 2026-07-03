import { supabase, resolveTenantId } from './supabaseClient';
import type { Database, Json } from '../types/database.types';
import { resolveRateContext } from './currencyService';
import { buildPayrollBaseColumns } from './payrollBase';
import { baseAmount } from './financialMath';
import { currentTenantToday } from './tenantToday';

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
  social_security_rate: 0.07,
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
      typeof row.social_security_rate === 'number'
        ? row.social_security_rate
        : DEFAULT_PAYROLL_SETTINGS.social_security_rate,
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
    const { data, error } = await supabase
      .from('payroll_periods')
      .select('*')
      .lte('start_date', now.toISOString().split('T')[0])
      .gte('end_date', now.toISOString().split('T')[0])
      .eq('period_type', 'monthly')
      .is('deleted_at', null)
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
    return this.updatePayrollPeriod(periodId, {
      status: 'approved',
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
    });
  },

  async approvePayrollPeriod(periodId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');
    return this.approvePayroll(periodId, user.id);
  },

  async markPayrollAsPaid(periodId: string, paidBy: string) {
    return this.updatePayrollPeriod(periodId, {
      status: 'paid',
      paid_by: paidBy,
      paid_at: new Date().toISOString(),
    });
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

    if (options.includePendingAdjustments) {
      await this.getPendingAdjustments();
    }

    const records: PayrollRecordInsert[] = [];
    const tenantId = employees && employees.length > 0 ? employees[0].tenant_id : null;

    // Deductions and overtime are tenant-configurable, not hardcoded. The
    // statutory rate defaults to 0.07 (preserving prior behavior) and the
    // overtime multiplier to 1.5 when unset.
    const socialSecurityRate = settings.social_security_rate ?? 0.07;
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

      const dailyRate = basicSalary / workingDaysPerMonth;
      const hourlyRate = dailyRate / workingHoursPerDay;

      const attendance = await this.getEmployeeAttendance(
        employee.id,
        period.start_date,
        period.end_date
      );

      const activeLoans = await this.getActiveLoans(employee.id);
      const loanDeductions = activeLoans.reduce(
        (sum, loan) => sum + Number(loan.installment_amount),
        0
      );

      // Pay overtime: hourly rate × overtime hours × the tenant's overtime
      // multiplier. Previously the fetched overtime hours were discarded.
      const overtimeAmount = Number(attendance.overtimeHours || 0) * hourlyRate * overtimeMultiplier;
      const totalEarnings = basicSalary + overtimeAmount;
      const socialSecurityDeduction = basicSalary * socialSecurityRate;
      const totalDeductions = socialSecurityDeduction + loanDeductions;
      const netSalary = totalEarnings - totalDeductions;

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
          amount: Number(loan.installment_amount),
          payment_date: period.end_date,
          payment_method: 'payroll_deduction',
          notes: `Automatic deduction for ${period.period_name}`,
        });
      }
    }

    void tenantId;

    if (records.length > 0) {
      const { data: createdRecords, error: recordError } = await supabase
        .from('payroll_records')
        .insert(records)
        .select();

      if (recordError) throw recordError;

      // Post loan repayments now that payroll_records are committed, so a
      // records-insert failure above can never deduct loans without backing.
      for (const repayment of pendingLoanRepayments) {
        await this.recordLoanRepayment(repayment);
      }

      // eslint-disable-next-line xsuite/no-raw-currency-aggregation -- single-currency: records[] is built in this one processPayroll run under a single resolved rate context (rc); summing the document amounts is correct here
      const totalGross = records.reduce((sum, r) => sum + Number(r.total_earnings ?? 0), 0);
      // eslint-disable-next-line xsuite/no-raw-currency-aggregation -- single-currency: records[] is built in this one processPayroll run under a single resolved rate context (rc); summing the document amounts is correct here
      const totalDeductions = records.reduce(
        (sum, r) => sum + Number(r.total_deductions ?? 0),
        0
      );
      // eslint-disable-next-line xsuite/no-raw-currency-aggregation -- single-currency: records[] is built in this one processPayroll run under a single resolved rate context (rc); summing the document amounts is correct here
      const totalNet = records.reduce((sum, r) => sum + Number(r.net_salary ?? 0), 0);

      await this.updatePayrollPeriod(periodId, {
        status: 'processing',
        total_gross: totalGross,
        total_deductions: totalDeductions,
        total_net: totalNet,
        employee_count: records.length,
      });

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
      .lte('date', endDate);

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

  async getActiveLoans(employeeId: string) {
    const { data, error } = await supabase
      .from('employee_loans')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('status', 'active')
      .is('deleted_at', null);

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

    const repaymentInsert: Database['public']['Tables']['loan_repayments']['Insert'] = {
      tenant_id: loan.tenant_id,
      loan_id: repayment.loan_id,
      amount: repayment.amount,
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

    const newRemainingAmount = Number(loan.remaining_amount ?? loan.total_amount) - repayment.amount;
    const newPaidInstallments = (loan.paid_installments || 0) + 1;
    const isCompleted = newPaidInstallments >= loan.installments;

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

  async generateBankFile(periodId: string, format: 'WPS' | 'ACH' | 'custom' = 'WPS') {
    const period = await this.getPayrollPeriod(periodId);
    if (!period) throw new Error('Payroll period not found');

    const records = await this.getPayrollRecords(periodId);

    const { data: nextNumber } = await supabase.rpc('get_next_number', {
      p_scope: 'payroll_bank_file',
    });

    const fileContent = this.generateWPSFileContent(records);
    const fileName = `${nextNumber || `PBF-${Date.now()}`}.txt`;

    const { data: bankFile, error } = await supabase
      .from('payroll_bank_files')
      .insert({
        file_name: fileName,
        period_id: periodId,
        file_format: format,
        total_amount: period.total_net,
        record_count: records.length,
        status: 'generated',
      } as Database['public']['Tables']['payroll_bank_files']['Insert'])
      .select()
      .maybeSingle();

    if (error) throw error;
    return { ...bankFile, file_content: fileContent, file_number: nextNumber || fileName };
  },

  generateWPSFileContent(records: Array<Record<string, unknown>>): string {
    const lines = records.map((record) => {
      const employee = record.employee as
        | { employee_number?: string | null; first_name?: string; last_name?: string; bank_name?: string | null; bank_account_number?: string | null }
        | null
        | undefined;
      const netSalary = typeof record.net_salary === 'number' ? record.net_salary : Number(record.net_salary ?? 0);
      return [
        employee?.employee_number || '',
        employee ? `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim() : '',
        employee?.bank_account_number || '',
        netSalary.toFixed(2),
        'USD',
        employee?.bank_name || 'Bank Muscat',
      ].join('|');
    });

    return lines.join('\n');
  },
};

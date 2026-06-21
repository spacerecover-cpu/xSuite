import { supabase } from './supabaseClient';
import { sanitizeFilterValue } from './postgrestSanitizer';
import type { Database } from '../types/database.types';

type Timesheet = Database['public']['Tables']['timesheets']['Row'];
type TimesheetInsert = Database['public']['Tables']['timesheets']['Insert'];
type TimesheetUpdate = Database['public']['Tables']['timesheets']['Update'];
type Employee = Database['public']['Tables']['employees']['Row'];

export type TimesheetWithEmployee = Timesheet & {
  employee: Pick<Employee, 'id' | 'first_name' | 'last_name' | 'employee_number'> | null;
};

export interface TimesheetFilters {
  status?: string;
  employeeId?: string;
  isBillable?: boolean;
  projectName?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface TimesheetStats {
  totalEntries: number;
  pendingReview: number;
  billableHoursThisMonth: number;
  totalHoursThisWeek: number;
}

export interface TimesheetSummaryRow {
  employeeId: string;
  employeeName: string;
  employeeNumber: string | null;
  totalDays: number;
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  avgHoursPerDay: number;
  projects: string[];
  entries: TimesheetWithEmployee[];
}

export const timesheetService = {
  async getTimesheets(filters?: TimesheetFilters): Promise<TimesheetWithEmployee[]> {
    let query = supabase
      .from('timesheets')
      .select(`
        *,
        employee:employees!timesheets_employee_id_fkey(id, first_name, last_name, employee_number)
      `)
      .order('work_date', { ascending: false });

    if (filters?.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }
    if (filters?.employeeId) {
      query = query.eq('employee_id', filters.employeeId);
    }
    if (filters?.isBillable !== undefined) {
      query = query.eq('is_billable', filters.isBillable);
    }
    if (filters?.projectName) {
      query = query.ilike('project_name', `%${filters.projectName}%`);
    }
    if (filters?.startDate) {
      query = query.gte('work_date', filters.startDate);
    }
    if (filters?.endDate) {
      query = query.lte('work_date', filters.endDate);
    }
    if (filters?.search) {
      const s = sanitizeFilterValue(filters.search);
      query = query.or(
        `project_name.ilike.%${s}%,task_description.ilike.%${s}%`
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as unknown as TimesheetWithEmployee[];
  },

  async getTimesheetById(id: string): Promise<TimesheetWithEmployee | null> {
    const { data, error } = await supabase
      .from('timesheets')
      .select(`
        *,
        employee:employees!timesheets_employee_id_fkey(id, first_name, last_name, employee_number)
      `)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data as unknown as TimesheetWithEmployee | null;
  },

  async createTimesheet(payload: TimesheetInsert): Promise<Timesheet> {
    const { data, error } = await supabase
      .from('timesheets')
      .insert({ ...payload, status: payload.status ?? 'draft' })
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Failed to create timesheet');
    return data;
  },

  async updateTimesheet(id: string, payload: TimesheetUpdate): Promise<Timesheet> {
    const { data, error } = await supabase
      .from('timesheets')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Failed to update timesheet');
    return data;
  },

  async deleteTimesheet(id: string): Promise<void> {
    const { error } = await supabase.from('timesheets').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  },

  async submitTimesheet(id: string): Promise<Timesheet> {
    const { data, error } = await supabase
      .from('timesheets')
      .update({
        status: 'submitted',
        submitted_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Failed to submit timesheet');
    return data;
  },

  async approveTimesheet(id: string, approverId: string, notes?: string): Promise<Timesheet> {
    const { data, error } = await supabase
      .from('timesheets')
      .update({
        status: 'approved',
        approved_by: approverId,
        approved_date: new Date().toISOString(),
        notes: notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Failed to approve timesheet');
    return data;
  },

  async rejectTimesheet(id: string, approverId: string, notes?: string): Promise<Timesheet> {
    const { data, error } = await supabase
      .from('timesheets')
      .update({
        status: 'rejected',
        approved_by: approverId,
        approved_date: new Date().toISOString(),
        notes: notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Failed to reject timesheet');
    return data;
  },

  async getEmployees() {
    const { data, error } = await supabase
      .from('employees')
      .select('id, first_name, last_name, employee_number, department_id, employment_status')
      .eq('employment_status', 'active')
      .order('first_name');
    if (error) throw error;
    return data ?? [];
  },

  async getTimesheetStats(): Promise<TimesheetStats> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const startOfWeek = (() => {
      const d = new Date(now);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(d.setDate(diff)).toISOString().split('T')[0];
    })();

    const [totalRes, pendingRes, billableRes, weekRes] = await Promise.all([
      supabase.from('timesheets').select('id', { count: 'exact', head: true }),
      supabase
        .from('timesheets')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'submitted'),
      supabase
        .from('timesheets')
        .select('hours')
        .eq('is_billable', true)
        .gte('work_date', startOfMonth),
      supabase.from('timesheets').select('hours').gte('work_date', startOfWeek),
    ]);

    const billableHours = (billableRes.data ?? []).reduce((sum, r) => sum + (r.hours ?? 0), 0);
    const weekHours = (weekRes.data ?? []).reduce((sum, r) => sum + (r.hours ?? 0), 0);

    return {
      totalEntries: totalRes.count ?? 0,
      pendingReview: pendingRes.count ?? 0,
      billableHoursThisMonth: billableHours,
      totalHoursThisWeek: weekHours,
    };
  },

  async getMonthlySummary(
    year: number,
    month: number,
    employeeId?: string
  ): Promise<TimesheetSummaryRow[]> {
    const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    let query = supabase
      .from('timesheets')
      .select(`
        *,
        employee:employees!timesheets_employee_id_fkey(id, first_name, last_name, employee_number)
      `)
      .gte('work_date', startDate)
      .lte('work_date', endDate)
      .order('work_date');

    if (employeeId) {
      query = query.eq('employee_id', employeeId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as unknown as TimesheetWithEmployee[];
    const byEmployee = new Map<string, TimesheetWithEmployee[]>();

    for (const row of rows) {
      const eid = row.employee_id;
      if (!byEmployee.has(eid)) byEmployee.set(eid, []);
      byEmployee.get(eid)!.push(row);
    }

    const summary: TimesheetSummaryRow[] = [];
    for (const [eid, entries] of byEmployee) {
      const emp = entries[0].employee;
      const uniqueDays = new Set(entries.map(e => e.work_date)).size;
      const totalHours = entries.reduce((s, e) => s + (e.hours ?? 0), 0);
      const billableHours = entries.filter(e => e.is_billable).reduce((s, e) => s + (e.hours ?? 0), 0);
      const projects = [...new Set(entries.map(e => e.project_name).filter(Boolean))] as string[];

      summary.push({
        employeeId: eid,
        employeeName: emp ? `${emp.first_name} ${emp.last_name}` : 'Unknown',
        employeeNumber: emp?.employee_number ?? null,
        totalDays: uniqueDays,
        totalHours,
        billableHours,
        nonBillableHours: totalHours - billableHours,
        avgHoursPerDay: uniqueDays > 0 ? totalHours / uniqueDays : 0,
        projects,
        entries,
      });
    }

    return summary.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  },
};

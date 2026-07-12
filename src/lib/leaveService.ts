import { supabase } from './supabaseClient';
import type { Database } from '../types/database.types';
import { currentTenantToday } from './tenantToday';

type LeaveType = Database['public']['Tables']['master_leave_types']['Row'];
type LeaveTypeInsert = Database['public']['Tables']['master_leave_types']['Insert'];
type LeaveTypeUpdate = Database['public']['Tables']['master_leave_types']['Update'];
type LeaveRequest = Database['public']['Tables']['leave_requests']['Row'];
type LeaveRequestInsert = Database['public']['Tables']['leave_requests']['Insert'];
type LeaveRequestUpdate = Database['public']['Tables']['leave_requests']['Update'];
type LeaveBalance = Database['public']['Tables']['leave_balances']['Row'];
type LeaveBalanceInsert = Database['public']['Tables']['leave_balances']['Insert'];
type LeaveBalanceUpdate = Database['public']['Tables']['leave_balances']['Update'];
type Employee = Database['public']['Tables']['employees']['Row'];

export type LeaveRequestWithDetails = LeaveRequest & {
  employee: Pick<Employee, 'id' | 'first_name' | 'last_name' | 'employee_number'> | null;
  leave_type: Pick<LeaveType, 'id' | 'name' | 'is_paid'> | null;
  approver: { full_name: string } | null;
};

export type LeaveBalanceWithDetails = LeaveBalance & {
  employee: Pick<Employee, 'id' | 'first_name' | 'last_name' | 'employee_number'> | null;
  leave_type: Pick<LeaveType, 'id' | 'name' | 'is_paid'> | null;
};

export interface LeaveFilters {
  status?: string;
  employeeId?: string;
  leaveTypeId?: string;
  year?: number;
  search?: string;
}

export interface LeaveStats {
  totalRequests: number;
  pendingApprovals: number;
  approvedThisMonth: number;
  rejectedThisMonth: number;
  employeesOnLeaveToday: number;
}

type LeaveRequestBalanceInfo = Pick<
  LeaveRequest,
  'employee_id' | 'leave_type_id' | 'days' | 'start_date' | 'status'
>;

// The balance year is derived from the request's start_date (leading YYYY of the
// ISO date), matching how allocations are keyed in leave_balances(year).
function leaveRequestYear(startDate: string): number {
  return Number.parseInt(startDate.slice(0, 4), 10);
}

async function fetchLeaveRequestForBalance(id: string): Promise<LeaveRequestBalanceInfo | null> {
  const { data, error } = await supabase
    .from('leave_requests')
    .select('employee_id, leave_type_id, days, start_date, status')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Applies a signed delta (+days on approval, -days when reversing a previously
// approved request) to the matching leave_balances row and recomputes
// remaining_days = total_days - used_days. No-op when no balance exists yet.
// Not atomic with the request update (no client-side transaction) — a DB trigger
// would be the forensic-grade path; see cross-file notes.
async function adjustLeaveBalanceUsage(
  employeeId: string,
  leaveTypeId: string,
  year: number,
  deltaDays: number,
): Promise<void> {
  if (!deltaDays || Number.isNaN(year)) return;
  const { data: balance, error } = await supabase
    .from('leave_balances')
    .select('id, total_days, used_days')
    .eq('employee_id', employeeId)
    .eq('leave_type_id', leaveTypeId)
    .eq('year', year)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!balance) return;
  const nextUsed = Math.max(0, (balance.used_days ?? 0) + deltaDays);
  const { error: updateError } = await supabase
    .from('leave_balances')
    .update({
      used_days: nextUsed,
      remaining_days: balance.total_days - nextUsed,
      updated_at: new Date().toISOString(),
    })
    .eq('id', balance.id);
  if (updateError) throw updateError;
}

export const leaveService = {
  async getLeaveTypes(): Promise<LeaveType[]> {
    const { data, error } = await supabase
      .from('master_leave_types')
      .select('*')
      .order('name');
    if (error) throw error;
    return data ?? [];
  },

  async getActiveLeaveTypes(): Promise<LeaveType[]> {
    const { data, error } = await supabase
      .from('master_leave_types')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return data ?? [];
  },

  async createLeaveType(payload: LeaveTypeInsert): Promise<LeaveType> {
    const { data, error } = await supabase
      .from('master_leave_types')
      .insert(payload)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Failed to create leave type');
    return data;
  },

  async updateLeaveType(id: string, payload: LeaveTypeUpdate): Promise<LeaveType> {
    const { data, error } = await supabase
      .from('master_leave_types')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Failed to update leave type');
    return data;
  },

  async getLeaveRequests(filters: LeaveFilters = {}): Promise<LeaveRequestWithDetails[]> {
    let query = supabase
      .from('leave_requests')
      .select(`
        *,
        employee:employees!leave_requests_employee_id_fkey(id, first_name, last_name, employee_number),
        leave_type:master_leave_types!leave_requests_leave_type_id_fkey(id, name, is_paid),
        approver:profiles!leave_requests_reviewed_by_fkey(full_name)
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }
    if (filters.employeeId) {
      query = query.eq('employee_id', filters.employeeId);
    }
    if (filters.leaveTypeId) {
      query = query.eq('leave_type_id', filters.leaveTypeId);
    }
    if (filters.year) {
      const start = `${filters.year}-01-01`;
      const end = `${filters.year}-12-31`;
      query = query.gte('start_date', start).lte('start_date', end);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as LeaveRequestWithDetails[];
  },

  async getLeaveRequestById(id: string): Promise<LeaveRequestWithDetails | null> {
    const { data, error } = await supabase
      .from('leave_requests')
      .select(`
        *,
        employee:employees!leave_requests_employee_id_fkey(id, first_name, last_name, employee_number),
        leave_type:master_leave_types!leave_requests_leave_type_id_fkey(id, name, is_paid),
        approver:profiles!leave_requests_reviewed_by_fkey(full_name)
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return data as LeaveRequestWithDetails | null;
  },

  async createLeaveRequest(payload: LeaveRequestInsert): Promise<LeaveRequest> {
    const { data, error } = await supabase
      .from('leave_requests')
      .insert(payload)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Failed to create leave request');
    return data;
  },

  async updateLeaveRequest(id: string, payload: LeaveRequestUpdate): Promise<LeaveRequest> {
    const { data, error } = await supabase
      .from('leave_requests')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Failed to update leave request');
    return data;
  },

  async approveLeaveRequest(id: string, approverId: string, notes?: string): Promise<LeaveRequest> {
    const existing = await fetchLeaveRequestForBalance(id);
    const { data, error } = await supabase
      .from('leave_requests')
      .update({
        status: 'approved',
        reviewed_by: approverId,
        reviewed_date: await currentTenantToday(),
        review_notes: notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Failed to approve leave request');
    // Only consume balance on a fresh approval — re-approving an already-approved
    // request must not double-count.
    if (existing && existing.status !== 'approved') {
      await adjustLeaveBalanceUsage(
        existing.employee_id,
        existing.leave_type_id,
        leaveRequestYear(existing.start_date),
        existing.days,
      );
    }
    return data;
  },

  async rejectLeaveRequest(id: string, approverId: string, notes?: string): Promise<LeaveRequest> {
    const existing = await fetchLeaveRequestForBalance(id);
    const { data, error } = await supabase
      .from('leave_requests')
      .update({
        status: 'rejected',
        reviewed_by: approverId,
        reviewed_date: await currentTenantToday(),
        review_notes: notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Failed to reject leave request');
    // Reverse previously consumed balance when rejecting an approved request.
    if (existing && existing.status === 'approved') {
      await adjustLeaveBalanceUsage(
        existing.employee_id,
        existing.leave_type_id,
        leaveRequestYear(existing.start_date),
        -existing.days,
      );
    }
    return data;
  },

  async deleteLeaveRequest(id: string): Promise<void> {
    const existing = await fetchLeaveRequestForBalance(id);
    const { error } = await supabase
      .from('leave_requests')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    // Reverse previously consumed balance when deleting an approved request.
    if (existing && existing.status === 'approved') {
      await adjustLeaveBalanceUsage(
        existing.employee_id,
        existing.leave_type_id,
        leaveRequestYear(existing.start_date),
        -existing.days,
      );
    }
  },

  async getLeaveBalances(filters: { year?: number; employeeId?: string } = {}): Promise<LeaveBalanceWithDetails[]> {
    let query = supabase
      .from('leave_balances')
      .select(`
        *,
        employee:employees!leave_balances_employee_id_fkey(id, first_name, last_name, employee_number),
        leave_type:master_leave_types!leave_balances_leave_type_id_fkey(id, name, is_paid)
      `)
      .order('employee_id');

    if (filters.year) {
      query = query.eq('year', filters.year);
    }
    if (filters.employeeId) {
      query = query.eq('employee_id', filters.employeeId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as LeaveBalanceWithDetails[];
  },

  async upsertLeaveBalance(payload: LeaveBalanceInsert): Promise<LeaveBalance> {
    const { data, error } = await supabase
      .from('leave_balances')
      .upsert(payload, { onConflict: 'employee_id,leave_type_id,year' })
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Failed to upsert leave balance');
    return data;
  },

  async updateLeaveBalance(id: string, payload: LeaveBalanceUpdate): Promise<LeaveBalance> {
    const { data, error } = await supabase
      .from('leave_balances')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Failed to update leave balance');
    return data;
  },

  async getEmployees(): Promise<Employee[]> {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .is('termination_date', null)
      .order('first_name');
    if (error) throw error;
    return data ?? [];
  },

  async getLeaveStats(): Promise<LeaveStats> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];

    const [allRequests, pendingResult, approvedThisMonth, rejectedThisMonth, onLeaveToday] = await Promise.all([
      supabase.from('leave_requests').select('id', { count: 'exact', head: true }).is('deleted_at', null),
      supabase.from('leave_requests').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'pending'),
      supabase.from('leave_requests').select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('status', 'approved')
        .gte('reviewed_date', monthStart)
        .lte('reviewed_date', monthEnd),
      supabase.from('leave_requests').select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('status', 'rejected')
        .gte('reviewed_date', monthStart)
        .lte('reviewed_date', monthEnd),
      supabase.from('leave_requests').select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('status', 'approved')
        .lte('start_date', today)
        .gte('end_date', today),
    ]);

    return {
      totalRequests: allRequests.count ?? 0,
      pendingApprovals: pendingResult.count ?? 0,
      approvedThisMonth: approvedThisMonth.count ?? 0,
      rejectedThisMonth: rejectedThisMonth.count ?? 0,
      employeesOnLeaveToday: onLeaveToday.count ?? 0,
    };
  },

  async getEmployeeLeaveBalance(employeeId: string, leaveTypeId: string, year: number): Promise<LeaveBalance | null> {
    const { data, error } = await supabase
      .from('leave_balances')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('leave_type_id', leaveTypeId)
      .eq('year', year)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
};

import { supabase } from './supabaseClient';
import type { Database } from '../types/database.types';

type OnboardingChecklist = Database['public']['Tables']['onboarding_checklists']['Row'];
type OnboardingChecklistInsert = Database['public']['Tables']['onboarding_checklists']['Insert'];
type OnboardingChecklistUpdate = Database['public']['Tables']['onboarding_checklists']['Update'];
type OnboardingChecklistItem = Database['public']['Tables']['onboarding_checklist_items']['Row'];
type OnboardingChecklistItemInsert = Database['public']['Tables']['onboarding_checklist_items']['Insert'];
type OnboardingChecklistItemUpdate = Database['public']['Tables']['onboarding_checklist_items']['Update'];
type OnboardingTask = Database['public']['Tables']['onboarding_tasks']['Row'];
type OnboardingTaskUpdate = Database['public']['Tables']['onboarding_tasks']['Update'];
type Employee = Database['public']['Tables']['employees']['Row'];
type Position = Database['public']['Tables']['positions']['Row'];

export type ChecklistWithItems = OnboardingChecklist & {
  onboarding_checklist_items: OnboardingChecklistItem[];
  positions: Position | null;
  item_count?: number;
};

export type TaskWithDetails = OnboardingTask & {
  onboarding_checklist_items: OnboardingChecklistItem | null;
};

export type EmployeeWithTasks = Employee & {
  task_count: number;
  completed_count: number;
  overdue_count: number;
  tasks: TaskWithDetails[];
};

export const TASK_STATUSES = ['pending', 'in_progress', 'completed', 'skipped'] as const;
export type TaskStatus = typeof TASK_STATUSES[number];

export async function getChecklists() {
  const { data, error } = await supabase
    .from('onboarding_checklists')
    .select(`
      *,
      positions!for_position_id (*),
      onboarding_checklist_items (*)
    `)
    .order('name');

  if (error) throw error;
  const checklists = (data || []) as ChecklistWithItems[];
  checklists.forEach(c => {
    c.item_count = c.onboarding_checklist_items?.length || 0;
  });
  return checklists;
}

export async function getChecklist(id: string) {
  const { data, error } = await supabase
    .from('onboarding_checklists')
    .select(`*, positions!for_position_id (*), onboarding_checklist_items (*)`)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data as ChecklistWithItems | null;
}

export async function createChecklist(checklist: OnboardingChecklistInsert) {
  const { data, error } = await supabase
    .from('onboarding_checklists')
    .insert(checklist)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateChecklist(id: string, updates: OnboardingChecklistUpdate) {
  const { data, error } = await supabase
    .from('onboarding_checklists')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function deleteChecklist(id: string) {
  const { error } = await supabase
    .from('onboarding_checklists')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function getChecklistItems(checklistId: string) {
  const { data, error } = await supabase
    .from('onboarding_checklist_items')
    .select('*')
    .eq('checklist_id', checklistId)
    .order('order_index');

  if (error) throw error;
  return (data || []) as OnboardingChecklistItem[];
}

export async function createChecklistItem(item: OnboardingChecklistItemInsert) {
  const { data, error } = await supabase
    .from('onboarding_checklist_items')
    .insert(item)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateChecklistItem(id: string, updates: OnboardingChecklistItemUpdate) {
  const { data, error } = await supabase
    .from('onboarding_checklist_items')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function deleteChecklistItem(id: string) {
  const { error } = await supabase
    .from('onboarding_checklist_items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function getEmployeeTasks(employeeId?: string) {
  let query = supabase
    .from('onboarding_tasks')
    .select(`*, onboarding_checklist_items (*)`)
    .order('due_date', { ascending: true });

  if (employeeId) {
    query = query.eq('employee_id', employeeId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as TaskWithDetails[];
}

export async function updateTask(id: string, updates: OnboardingTaskUpdate) {
  const { data, error } = await supabase
    .from('onboarding_tasks')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function completeTask(id: string) {
  return updateTask(id, {
    status: 'completed',
    completed_at: new Date().toISOString(),
  });
}

export async function assignChecklistToEmployee(
  employeeId: string,
  checklistId: string,
  startDate: string
) {
  const items = await getChecklistItems(checklistId);

  void startDate;
  const tasks = items.map(item => ({
    employee_id: employeeId,
    checklist_item_id: item.id,
    title: item.title,
    description: item.description,
    status: 'pending' as const,
    due_date: null,
  }));

  const { data, error } = await supabase
    .from('onboarding_tasks')
    .insert(tasks as never)
    .select();

  if (error) throw error;
  return data;
}

export async function getOnboardingStats() {
  const today = new Date().toISOString().split('T')[0];

  const { data: tasks } = await supabase
    .from('onboarding_tasks')
    .select('status, due_date, employee_id');

  const allTasks = tasks || [];
  const activeEmployeeIds = new Set(
    allTasks.filter(t => t.status !== 'completed').map(t => t.employee_id)
  );

  const completedCount = allTasks.filter(t => t.status === 'completed').length;
  const totalCount = allTasks.length;
  const overdueCount = allTasks.filter(
    t => t.status !== 'completed' && t.due_date && t.due_date < today
  ).length;

  return {
    activeOnboardees: activeEmployeeIds.size,
    overdueTasksCount: overdueCount,
    completionRate: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
  };
}

export async function getEmployeesWithTasks() {
  const today = new Date().toISOString().split('T')[0];

  const { data: tasks, error } = await supabase
    .from('onboarding_tasks')
    .select(`
      *,
      onboarding_checklist_items (*)
    `)
    .order('due_date', { ascending: true });

  if (error) throw error;

  const tasksByEmployee: Record<string, TaskWithDetails[]> = {};
  (tasks || []).forEach(t => {
    if (!tasksByEmployee[t.employee_id]) tasksByEmployee[t.employee_id] = [];
    tasksByEmployee[t.employee_id].push(t as TaskWithDetails);
  });

  const employeeIds = Object.keys(tasksByEmployee);
  if (employeeIds.length === 0) return [];

  const { data: employees, error: empError } = await supabase
    .from('employees')
    .select('*')
    .in('id', employeeIds);

  if (empError) throw empError;

  return (employees || []).map(emp => {
    const empTasks = tasksByEmployee[emp.id] || [];
    return {
      ...emp,
      tasks: empTasks,
      task_count: empTasks.length,
      completed_count: empTasks.filter(t => t.status === 'completed').length,
      overdue_count: empTasks.filter(
        t => t.status !== 'completed' && t.due_date && t.due_date < today
      ).length,
    } as EmployeeWithTasks;
  });
}

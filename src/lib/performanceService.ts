import { supabase } from './supabaseClient';
import type { Database } from '../types/database.types';
import { currentTenantToday } from './tenantToday';

type PerformanceReview = Database['public']['Tables']['performance_reviews']['Row'];
type PerformanceReviewInsert = Database['public']['Tables']['performance_reviews']['Insert'];
type PerformanceReviewUpdate = Database['public']['Tables']['performance_reviews']['Update'];
type Employee = Database['public']['Tables']['employees']['Row'];

export type ReviewWithDetails = PerformanceReview & {
  employee: (Employee & { full_name?: string }) | null;
  reviewer: { id: string; full_name: string | null; avatar_url: string | null } | null;
};

export const REVIEW_STATUSES = ['draft', 'submitted', 'completed'] as const;
export type ReviewStatus = typeof REVIEW_STATUSES[number];

export async function getReviews(filters?: {
  status?: string;
  employeeId?: string;
  fromDate?: string;
  toDate?: string;
}) {
  let query = supabase
    .from('performance_reviews')
    .select(`
      *,
      employee:employees!employee_id (
        id, first_name, last_name, employee_number, department_id,
        departments (name),
        positions (title)
      ),
      reviewer:profiles!performance_reviews_reviewer_profile_fkey (id, full_name, avatar_url)
    `)
    .order('created_at', { ascending: false });

  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.employeeId) query = query.eq('employee_id', filters.employeeId);
  // NOTE: performance_reviews v1.0.0 stores `review_period` as a single free-text column
  // (format "YYYY-MM-DD to YYYY-MM-DD"); the prior `review_period_start`/`review_period_end`
  // columns were dropped. fromDate/toDate filters use ilike on the year fragment so they
  // approximate range filtering without crashing. Exact-range filtering requires either a
  // migration to restore the two timestamp columns, or client-side parsing of review_period.
  if (filters?.fromDate) {
    const yearFrom = filters.fromDate.slice(0, 4);
    query = query.ilike('review_period', `%${yearFrom}%`);
  }
  if (filters?.toDate) {
    const yearTo = filters.toDate.slice(0, 4);
    query = query.ilike('review_period', `%${yearTo}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as unknown as ReviewWithDetails[];
}

export async function getReview(id: string) {
  const { data, error } = await supabase
    .from('performance_reviews')
    .select(`
      *,
      employee:employees!employee_id (
        id, first_name, last_name, employee_number, department_id,
        departments (name),
        positions (title)
      ),
      reviewer:profiles!performance_reviews_reviewer_profile_fkey (id, full_name, avatar_url)
    `)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data as ReviewWithDetails | null;
}

export async function createReview(review: PerformanceReviewInsert) {
  const { data, error } = await supabase
    .from('performance_reviews')
    .insert(review)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateReview(id: string, updates: PerformanceReviewUpdate) {
  const { data, error } = await supabase
    .from('performance_reviews')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function deleteReview(id: string) {
  const { error } = await supabase
    .from('performance_reviews')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function submitReview(id: string) {
  return updateReview(id, {
    status: 'submitted',
    review_date: await currentTenantToday(),
  });
}

export async function completeReview(id: string) {
  return updateReview(id, { status: 'completed' });
}

export async function getPerformanceStats() {
  const { data: reviews } = await supabase
    .from('performance_reviews')
    .select('status, overall_rating');

  const allReviews = reviews || [];
  const withRating = allReviews.filter(r => r.overall_rating != null);
  const avgRating =
    withRating.length > 0
      ? withRating.reduce((sum, r) => sum + (r.overall_rating || 0), 0) / withRating.length
      : 0;

  return {
    total: allReviews.length,
    draft: allReviews.filter(r => r.status === 'draft').length,
    submitted: allReviews.filter(r => r.status === 'submitted').length,
    completed: allReviews.filter(r => r.status === 'completed').length,
    averageRating: Math.round(avgRating * 10) / 10,
  };
}

export async function getEmployeesForReview() {
  const { data, error } = await supabase
    .from('employees')
    .select(`
      id, first_name, last_name, employee_number,
      departments (name),
      positions (title)
    `)
    .eq('employment_status', 'active')
    .order('first_name');

  if (error) throw error;
  return data || [];
}

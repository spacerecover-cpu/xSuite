import { supabase } from './supabaseClient';
import type { Database } from '../types/database.types';

type RecruitmentJob = Database['public']['Tables']['recruitment_jobs']['Row'];
type RecruitmentJobInsert = Database['public']['Tables']['recruitment_jobs']['Insert'];
type RecruitmentJobUpdate = Database['public']['Tables']['recruitment_jobs']['Update'];
type RecruitmentCandidate = Database['public']['Tables']['recruitment_candidates']['Row'];
type RecruitmentCandidateInsert = Database['public']['Tables']['recruitment_candidates']['Insert'];
type RecruitmentCandidateUpdate = Database['public']['Tables']['recruitment_candidates']['Update'];
type Department = Database['public']['Tables']['departments']['Row'];
type Position = Database['public']['Tables']['positions']['Row'];

export type JobWithDetails = RecruitmentJob & {
  departments: Department | null;
  positions: Position | null;
  candidate_count?: number;
};

export type CandidateWithJob = RecruitmentCandidate & {
  recruitment_jobs: RecruitmentJob | null;
};

export const CANDIDATE_STAGES = [
  'applied',
  'screening',
  'interview',
  'offer',
  'hired',
  'rejected',
] as const;

export type CandidateStage = typeof CANDIDATE_STAGES[number];

export const JOB_STATUSES = ['open', 'closed', 'paused', 'draft'] as const;
export type JobStatus = typeof JOB_STATUSES[number];

export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'internship'] as const;
export type EmploymentType = typeof EMPLOYMENT_TYPES[number];

export async function getJobs(filters?: { status?: string; departmentId?: string }) {
  let query = supabase
    .from('recruitment_jobs')
    .select(`
      *,
      departments (*),
      positions (*)
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.departmentId) {
    query = query.eq('department_id', filters.departmentId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const jobs = (data || []) as JobWithDetails[];

  const jobIds = jobs.map(j => j.id);
  if (jobIds.length > 0) {
    const { data: candidateCounts } = await supabase
      .from('recruitment_candidates')
      .select('job_id')
      .in('job_id', jobIds)
      .is('deleted_at', null);

    const countMap: Record<string, number> = {};
    (candidateCounts || []).forEach(c => {
      if (c.job_id) countMap[c.job_id] = (countMap[c.job_id] || 0) + 1;
    });

    jobs.forEach(j => {
      j.candidate_count = countMap[j.id] || 0;
    });
  }

  return jobs;
}

export async function getJob(id: string) {
  const { data, error } = await supabase
    .from('recruitment_jobs')
    .select(`*, departments (*), positions (*)`)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw error;
  return data as JobWithDetails | null;
}

export async function createJob(job: RecruitmentJobInsert) {
  const { data, error } = await supabase
    .from('recruitment_jobs')
    .insert(job)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateJob(id: string, updates: RecruitmentJobUpdate) {
  const { data, error } = await supabase
    .from('recruitment_jobs')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function deleteJob(id: string) {
  const { error } = await supabase
    .from('recruitment_jobs')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function getCandidates(jobId?: string) {
  let query = supabase
    .from('recruitment_candidates')
    .select(`*, recruitment_jobs (title, department_id)`)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (jobId) {
    query = query.eq('job_id', jobId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as CandidateWithJob[];
}

export async function createCandidate(candidate: RecruitmentCandidateInsert) {
  const { data, error } = await supabase
    .from('recruitment_candidates')
    .insert(candidate)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateCandidate(id: string, updates: RecruitmentCandidateUpdate) {
  const { data, error } = await supabase
    .from('recruitment_candidates')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function deleteCandidate(id: string) {
  const { error } = await supabase
    .from('recruitment_candidates')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function moveCandidateStage(id: string, stage: CandidateStage) {
  return updateCandidate(id, { current_stage: stage });
}

export async function getRecruitmentStats() {
  const [jobsResult, candidatesResult] = await Promise.all([
    supabase.from('recruitment_jobs').select('status').is('deleted_at', null),
    supabase.from('recruitment_candidates').select('current_stage').is('deleted_at', null),
  ]);

  const jobs = jobsResult.data || [];
  const candidates = candidatesResult.data || [];

  return {
    totalJobs: jobs.length,
    openJobs: jobs.filter(j => j.status === 'open').length,
    totalCandidates: candidates.length,
    hired: candidates.filter(c => c.current_stage === 'hired').length,
    interviews: candidates.filter(c => c.current_stage === 'interview').length,
    offers: candidates.filter(c => c.current_stage === 'offer').length,
  };
}

export async function getDepartments() {
  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) throw error;
  return (data || []) as Department[];
}

export async function getPositions(departmentId?: string) {
  let query = supabase
    .from('positions')
    .select('*')
    .eq('is_active', true)
    .order('title');

  if (departmentId) {
    query = query.eq('department_id', departmentId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Position[];
}

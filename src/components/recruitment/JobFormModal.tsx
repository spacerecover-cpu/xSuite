import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { recruitmentKeys } from '../../lib/queryKeys';
import {
  createJob,
  updateJob,
  getDepartments,
  getPositions,
  EMPLOYMENT_TYPES,
  JOB_STATUSES,
  type JobWithDetails,
} from '../../lib/recruitmentService';
import type { Database } from '../../types/database.types';
import toast from 'react-hot-toast';

interface JobFormData {
  title: string;
  department_id: string;
  position_id: string;
  employment_type: string;
  location: string;
  salary_range_min: string;
  salary_range_max: string;
  openings: string;
  status: string;
  closes_at: string;
  description: string;
}

function parseSalaryRange(range: string | null | undefined): { min: string; max: string } {
  if (!range) return { min: '', max: '' };
  const parts = range.split('-').map(s => s.trim());
  return { min: parts[0] || '', max: parts[1] || '' };
}

function buildSalaryRange(min: string, max: string): string | null {
  const trimmedMin = min.trim();
  const trimmedMax = max.trim();
  if (!trimmedMin && !trimmedMax) return null;
  if (trimmedMin && trimmedMax) return `${trimmedMin}-${trimmedMax}`;
  return trimmedMin || trimmedMax;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  job?: JobWithDetails | null;
}

export const JobFormModal: React.FC<Props> = ({ isOpen, onClose, job }) => {
  const queryClient = useQueryClient();
  const isEditing = !!job;

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<JobFormData>({
    defaultValues: {
      title: '',
      department_id: '',
      position_id: '',
      employment_type: 'full_time',
      location: '',
      salary_range_min: '',
      salary_range_max: '',
      openings: '1',
      status: 'open',
      closes_at: '',
      description: '',
    },
  });

  const selectedDepartmentId = watch('department_id');

  useEffect(() => {
    if (job) {
      const { min, max } = parseSalaryRange(job.salary_range);
      reset({
        title: job.title,
        department_id: job.department_id || '',
        position_id: job.position_id || '',
        employment_type: job.employment_type || 'full_time',
        location: job.location || '',
        salary_range_min: min,
        salary_range_max: max,
        openings: job.openings?.toString() || '1',
        status: job.status || 'open',
        closes_at: job.closes_at ? job.closes_at.slice(0, 10) : '',
        description: job.description || '',
      });
    } else {
      reset({
        title: '',
        department_id: '',
        position_id: '',
        employment_type: 'full_time',
        location: '',
        salary_range_min: '',
        salary_range_max: '',
        openings: '1',
        status: 'open',
        closes_at: '',
        description: '',
      });
    }
  }, [job, reset, isOpen]);

  const { data: departments = [] } = useQuery({
    queryKey: recruitmentKeys.departments(),
    queryFn: getDepartments,
  });

  const { data: positions = [] } = useQuery({
    queryKey: recruitmentKeys.positions(),
    queryFn: () => getPositions(selectedDepartmentId || undefined),
  });

  const mutation = useMutation({
    mutationFn: (data: JobFormData) => {
      const payload = {
        title: data.title,
        department_id: data.department_id || null,
        position_id: data.position_id || null,
        employment_type: data.employment_type || null,
        location: data.location || null,
        salary_range: buildSalaryRange(data.salary_range_min, data.salary_range_max),
        openings: data.openings ? parseInt(data.openings) : 1,
        status: data.status,
        closes_at: data.closes_at || null,
        description: data.description || null,
      } as Database['public']['Tables']['recruitment_jobs']['Insert'];
      return isEditing ? updateJob(job!.id, payload) : createJob(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recruitmentKeys.all });
      toast.success(isEditing ? 'Job updated' : 'Job created');
      onClose();
    },
    onError: () => {
      toast.error('Failed to save job');
    },
  });

  const employmentTypeLabels: Record<string, string> = {
    full_time: 'Full Time',
    part_time: 'Part Time',
    contract: 'Contract',
    internship: 'Internship',
  };

  const statusLabels: Record<string, string> = {
    open: 'Open',
    closed: 'Closed',
    paused: 'Paused',
    draft: 'Draft',
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Edit Job' : 'Post New Job'} size="lg" closeOnBackdrop={false}>
      <form onSubmit={handleSubmit(data => mutation.mutate(data))} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Job Title <span className="text-danger">*</span>
          </label>
          <Input
            {...register('title', { required: 'Title is required' })}
            placeholder="e.g. Data Recovery Engineer"
          />
          {errors.title && <p className="text-danger text-xs mt-1">{errors.title.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="job-department" className="block text-sm font-medium text-slate-700 mb-1">Department</label>
            <select
              id="job-department"
              {...register('department_id')}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select department...</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="job-position" className="block text-sm font-medium text-slate-700 mb-1">Position</label>
            <select
              id="job-position"
              {...register('position_id')}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select position...</option>
              {positions.map(p => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="job-employment-type" className="block text-sm font-medium text-slate-700 mb-1">Employment Type</label>
            <select
              id="job-employment-type"
              {...register('employment_type')}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {EMPLOYMENT_TYPES.map(t => (
                <option key={t} value={t}>{employmentTypeLabels[t]}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="job-status" className="block text-sm font-medium text-slate-700 mb-1">Status</label>
            <select
              id="job-status"
              {...register('status')}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {JOB_STATUSES.map(s => (
                <option key={s} value={s}>{statusLabels[s]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
            <Input {...register('location')} placeholder="e.g. Dubai, UAE" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Openings</label>
            <Input {...register('openings')} type="number" min="1" placeholder="1" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Salary Min</label>
            <Input {...register('salary_range_min')} type="number" placeholder="e.g. 5000" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Salary Max</label>
            <Input {...register('salary_range_max')} type="number" placeholder="e.g. 10000" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Closing Date</label>
          <Input {...register('closes_at')} type="date" />
        </div>

        <div>
          <label htmlFor="job-description" className="block text-sm font-medium text-slate-700 mb-1">Job Description</label>
          <textarea
            id="job-description"
            {...register('description')}
            rows={4}
            placeholder="Describe responsibilities, requirements, and qualifications..."
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving...' : isEditing ? 'Update Job' : 'Post Job'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

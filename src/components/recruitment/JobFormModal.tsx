import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Briefcase, Loader2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { SearchableSelect } from '../ui/SearchableSelect';
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
import { useToast } from '../../hooks/useToast';

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
  const toast = useToast();
  const isEditing = !!job;

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<JobFormData>({
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
  const positionId = watch('position_id');
  const employmentType = watch('employment_type');
  const status = watch('status');

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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Job' : 'Post New Job'}
      subtitle={isEditing ? "Update this job's details." : 'Enter the job details to post it.'}
      icon={Briefcase}
      titleSize="sm"
      size="lg"
      showClose
      closeOnBackdrop={false}
    >
      <form onSubmit={handleSubmit(data => mutation.mutate(data))} className="space-y-5">
        <Input
          label="Job Title"
          floatingLabel
          required
          error={errors.title?.message}
          placeholder="e.g. Data Recovery Engineer"
          {...register('title', { required: 'Title is required' })}
        />

        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
          <SearchableSelect
            label="Department"
            floatingLabel
            shrinkDefaultValue
            usePortal
            value={selectedDepartmentId}
            onChange={(value) => setValue('department_id', value)}
            options={[{ id: '', name: 'No Department' }, ...departments.map(d => ({ id: d.id, name: d.name }))]}
            placeholder="No Department"
          />

          <SearchableSelect
            label="Position"
            floatingLabel
            shrinkDefaultValue
            usePortal
            value={positionId}
            onChange={(value) => setValue('position_id', value)}
            options={[{ id: '', name: 'No Position' }, ...positions.map(p => ({ id: p.id, name: p.title }))]}
            placeholder="No Position"
          />
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
          <SearchableSelect
            label="Employment Type"
            floatingLabel
            usePortal
            value={employmentType}
            onChange={(value) => setValue('employment_type', value)}
            options={EMPLOYMENT_TYPES.map(t => ({ id: t, name: employmentTypeLabels[t] }))}
          />

          <SearchableSelect
            label="Status"
            floatingLabel
            usePortal
            value={status}
            onChange={(value) => setValue('status', value)}
            options={JOB_STATUSES.map(s => ({ id: s, name: statusLabels[s] }))}
          />
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
          <Input label="Location" floatingLabel placeholder="e.g. Dubai, UAE" {...register('location')} />
          <Input label="Openings" floatingLabel type="number" min="1" placeholder="1" {...register('openings')} />
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
          <Input label="Salary Min" floatingLabel type="number" placeholder="e.g. 5000" {...register('salary_range_min')} />
          <Input label="Salary Max" floatingLabel type="number" placeholder="e.g. 10000" {...register('salary_range_max')} />
        </div>

        <div>
          <label htmlFor="job-closes-at" className="block text-sm font-medium text-slate-700 mb-1">Closing Date</label>
          <Input id="job-closes-at" {...register('closes_at')} type="date" />
        </div>

        <Textarea
          label="Job Description"
          floatingLabel
          rows={4}
          className="resize-none"
          placeholder="Describe responsibilities, requirements, and qualifications..."
          {...register('description')}
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" size="sm" className="text-xs" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" className="text-xs" disabled={mutation.isPending}>
            {mutation.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Saving...
              </>
            ) : isEditing ? (
              'Update Job'
            ) : (
              'Post Job'
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { recruitmentKeys } from '../../lib/queryKeys';
import {
  createCandidate,
  updateCandidate,
  CANDIDATE_STAGES,
  type CandidateWithJob,
  type JobWithDetails,
} from '../../lib/recruitmentService';
import type { Database } from '../../types/database.types';
import { useToast } from '../../hooks/useToast';

interface CandidateFormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  current_stage: string;
  rating: string;
  notes: string;
  cover_letter: string;
}

function splitName(name: string | null | undefined): { first: string; last: string } {
  if (!name) return { first: '', last: '' };
  const trimmed = name.trim();
  const firstSpace = trimmed.indexOf(' ');
  if (firstSpace === -1) return { first: trimmed, last: '' };
  return {
    first: trimmed.slice(0, firstSpace),
    last: trimmed.slice(firstSpace + 1),
  };
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  candidate?: CandidateWithJob | null;
  job: JobWithDetails;
}

const stageLabels: Record<string, string> = {
  applied: 'Applied',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Rejected',
};

export const CandidateFormModal: React.FC<Props> = ({ isOpen, onClose, candidate, job }) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const isEditing = !!candidate;

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CandidateFormData>({
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      current_stage: 'applied',
      rating: '',
      notes: '',
      cover_letter: '',
    },
  });

  useEffect(() => {
    if (candidate) {
      const { first, last } = splitName(candidate.name);
      reset({
        first_name: first,
        last_name: last,
        email: candidate.email ?? '',
        phone: candidate.phone || '',
        current_stage: candidate.current_stage || 'applied',
        rating: candidate.rating?.toString() || '',
        notes: candidate.notes || '',
        cover_letter: candidate.cover_letter || '',
      });
    } else {
      reset({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        current_stage: 'applied',
        rating: '',
        notes: '',
        cover_letter: '',
      });
    }
  }, [candidate, reset, isOpen]);

  const mutation = useMutation({
    mutationFn: (data: CandidateFormData) => {
      const fullName = `${data.first_name.trim()} ${data.last_name.trim()}`.trim();
      const payload = {
        name: fullName,
        email: data.email,
        phone: data.phone || null,
        current_stage: data.current_stage,
        rating: data.rating ? parseInt(data.rating) : null,
        notes: data.notes || null,
        cover_letter: data.cover_letter || null,
        job_id: job.id,
        applied_date: new Date().toISOString().split('T')[0],
      } as Database['public']['Tables']['recruitment_candidates']['Insert'];
      return isEditing
        ? updateCandidate(candidate!.id, payload)
        : createCandidate(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recruitmentKeys.all });
      toast.success(isEditing ? 'Candidate updated' : 'Candidate added');
      onClose();
    },
    onError: () => {
      toast.error('Failed to save candidate');
    },
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Candidate' : `Add Candidate — ${job.title}`}
      size="lg"
      closeOnBackdrop={false}
    >
      <form onSubmit={handleSubmit(data => mutation.mutate(data))} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              First Name <span className="text-danger">*</span>
            </label>
            <Input
              {...register('first_name', { required: 'Required' })}
              placeholder="First name"
            />
            {errors.first_name && <p className="text-danger text-xs mt-1">{errors.first_name.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Last Name <span className="text-danger">*</span>
            </label>
            <Input
              {...register('last_name', { required: 'Required' })}
              placeholder="Last name"
            />
            {errors.last_name && <p className="text-danger text-xs mt-1">{errors.last_name.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email <span className="text-danger">*</span>
            </label>
            <Input
              {...register('email', { required: 'Required' })}
              type="email"
              placeholder="email@example.com"
            />
            {errors.email && <p className="text-danger text-xs mt-1">{errors.email.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
            <Input {...register('phone')} placeholder="+971 50 000 0000" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="candidate-stage" className="block text-sm font-medium text-slate-700 mb-1">Stage</label>
            <select
              id="candidate-stage"
              {...register('current_stage')}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {CANDIDATE_STAGES.map(s => (
                <option key={s} value={s}>{stageLabels[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="candidate-rating" className="block text-sm font-medium text-slate-700 mb-1">Rating (1-5)</label>
            <select
              id="candidate-rating"
              {...register('rating')}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">No rating</option>
              {[1, 2, 3, 4, 5].map(n => (
                <option key={n} value={n}>{n} {n === 1 ? 'Star' : 'Stars'}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="candidate-cover-letter" className="block text-sm font-medium text-slate-700 mb-1">Cover Letter / Summary</label>
          <textarea
            id="candidate-cover-letter"
            {...register('cover_letter')}
            rows={3}
            placeholder="Candidate's cover letter or summary..."
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>

        <div>
          <label htmlFor="candidate-notes" className="block text-sm font-medium text-slate-700 mb-1">Internal Notes</label>
          <textarea
            id="candidate-notes"
            {...register('notes')}
            rows={3}
            placeholder="Internal recruiter notes..."
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving...' : isEditing ? 'Update' : 'Add Candidate'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

import React, { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Loader2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { SearchableSelect } from '../ui/SearchableSelect';
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

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<CandidateFormData>({
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
      } as Database['public']['Tables']['recruitment_candidates']['Insert'];
      return isEditing
        ? updateCandidate(candidate!.id, payload)
        : createCandidate({
            ...payload,
            applied_date: new Date().toISOString().split('T')[0],
          });
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
      subtitle={isEditing ? "Update this candidate's details." : "Enter the candidate's details to add them."}
      icon={UserPlus}
      titleSize="sm"
      size="lg"
      showClose
      closeOnBackdrop={false}
    >
      <form onSubmit={handleSubmit(data => mutation.mutate(data))} className="space-y-5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
          <Input
            label="First Name"
            floatingLabel
            {...register('first_name', { required: 'Required' })}
            error={errors.first_name?.message}
            required
            placeholder="First name"
          />
          <Input
            label="Last Name"
            floatingLabel
            {...register('last_name', { required: 'Required' })}
            error={errors.last_name?.message}
            required
            placeholder="Last name"
          />
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
          <Input
            label="Email"
            floatingLabel
            type="email"
            {...register('email', { required: 'Required' })}
            error={errors.email?.message}
            required
            placeholder="email@example.com"
          />
          <Input
            label="Phone"
            floatingLabel
            {...register('phone')}
            placeholder="+971 50 000 0000"
          />
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
          <Controller
            control={control}
            name="current_stage"
            render={({ field }) => (
              <SearchableSelect
                label="Stage"
                floatingLabel
                shrinkDefaultValue
                usePortal
                value={field.value}
                onChange={field.onChange}
                options={CANDIDATE_STAGES.map(s => ({ id: s, name: stageLabels[s] }))}
              />
            )}
          />
          <Controller
            control={control}
            name="rating"
            render={({ field }) => (
              <SearchableSelect
                label="Rating (1-5)"
                floatingLabel
                shrinkDefaultValue
                usePortal
                value={field.value}
                onChange={field.onChange}
                options={[
                  { id: '', name: 'No rating' },
                  ...[1, 2, 3, 4, 5].map(n => ({ id: String(n), name: `${n} ${n === 1 ? 'Star' : 'Stars'}` })),
                ]}
                placeholder="No rating"
              />
            )}
          />
        </div>

        <Textarea
          label="Cover Letter / Summary"
          floatingLabel
          {...register('cover_letter')}
          rows={3}
          className="resize-none"
          placeholder="Candidate's cover letter or summary..."
        />

        <Textarea
          label="Internal Notes"
          floatingLabel
          {...register('notes')}
          rows={3}
          className="resize-none"
          placeholder="Internal recruiter notes..."
        />

        <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200">
          <Button type="button" variant="secondary" size="sm" className="text-xs" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" className="text-xs" disabled={mutation.isPending}>
            {mutation.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Saving...
              </>
            ) : isEditing ? 'Update' : 'Add Candidate'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

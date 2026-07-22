import React, { useEffect, useId } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Star, ClipboardCheck, Loader2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { SearchableSelect } from '../ui/SearchableSelect';
import { performanceKeys } from '../../lib/queryKeys';
import {
  createReview,
  updateReview,
  getEmployeesForReview,
  type ReviewWithDetails,
} from '../../lib/performanceService';
import { useAuth } from '../../contexts/AuthContext';
import type { Database } from '../../types/database.types';
import { useToast } from '../../hooks/useToast';

interface ReviewFormData {
  employee_id: string;
  review_period_start: string;
  review_period_end: string;
  overall_rating: string;
  strengths: string;
  areas_for_improvement: string;
  goals_achieved: string;
  goals_next_period: string;
  comments: string;
  status: string;
}

const GOALS_NEXT_DIVIDER = '\n\n---\nNext period:\n';

function parseReviewPeriod(period: string | null | undefined): { start: string; end: string } {
  if (!period) return { start: '', end: '' };
  const match = period.match(/^(\S+)\s+to\s+(\S+)$/);
  if (match) return { start: match[1], end: match[2] };
  return { start: '', end: '' };
}

function buildReviewPeriod(start: string, end: string): string | null {
  if (!start && !end) return null;
  return `${start} to ${end}`;
}

function splitGoals(goals: string | null | undefined): { achieved: string; next: string } {
  if (!goals) return { achieved: '', next: '' };
  const idx = goals.indexOf(GOALS_NEXT_DIVIDER);
  if (idx === -1) return { achieved: goals, next: '' };
  return {
    achieved: goals.slice(0, idx),
    next: goals.slice(idx + GOALS_NEXT_DIVIDER.length),
  };
}

function buildGoals(achieved: string, next: string): string | null {
  if (!achieved && !next) return null;
  if (!next) return achieved || null;
  return `${achieved}${GOALS_NEXT_DIVIDER}${next}`;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  review?: ReviewWithDetails | null;
}

function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const [hovered, setHovered] = React.useState(0);

  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(n)}
          className="focus:outline-none"
        >
          <Star
            className={`w-7 h-7 transition-colors ${
              n <= (hovered || value)
                ? n <= 2
                  ? 'fill-danger text-danger'
                  : n === 3
                  ? 'fill-warning text-warning'
                  : 'fill-success text-success'
                : 'text-slate-200'
            }`}
          />
        </button>
      ))}
      {value > 0 && (
        <span className="ml-2 text-sm font-medium text-slate-600 self-center">
          {value === 1
            ? 'Needs Improvement'
            : value === 2
            ? 'Below Expectations'
            : value === 3
            ? 'Meets Expectations'
            : value === 4
            ? 'Exceeds Expectations'
            : 'Outstanding'}
        </span>
      )}
    </div>
  );
}

export const ReviewFormModal: React.FC<Props> = ({ isOpen, onClose, review }) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const isEditing = !!review;
  const periodStartFieldId = useId();
  const periodEndFieldId = useId();

  const [rating, setRating] = React.useState(0);

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<ReviewFormData>();

  useEffect(() => {
    if (review) {
      const { start, end } = parseReviewPeriod(review.review_period);
      const { achieved, next } = splitGoals(review.goals);
      reset({
        employee_id: review.employee_id,
        review_period_start: start,
        review_period_end: end,
        overall_rating: review.overall_rating?.toString() || '',
        strengths: review.strengths || '',
        areas_for_improvement: review.improvements || '',
        goals_achieved: achieved,
        goals_next_period: next,
        comments: review.comments || '',
        status: review.status || 'draft',
      });
      setRating(review.overall_rating || 0);
    } else {
      reset({
        employee_id: '',
        review_period_start: '',
        review_period_end: '',
        overall_rating: '',
        strengths: '',
        areas_for_improvement: '',
        goals_achieved: '',
        goals_next_period: '',
        comments: '',
        status: 'draft',
      });
      setRating(0);
    }
  }, [review, reset, isOpen]);

  const { data: employees = [] } = useQuery({
    queryKey: performanceKeys.employees(),
    queryFn: getEmployeesForReview,
  });

  const mutation = useMutation({
    mutationFn: (data: ReviewFormData) => {
      const payload = {
        employee_id: data.employee_id,
        reviewer_id: review?.reviewer_id || user!.id,
        review_period: buildReviewPeriod(data.review_period_start, data.review_period_end),
        overall_rating: rating || null,
        strengths: data.strengths || null,
        improvements: data.areas_for_improvement || null,
        goals: buildGoals(data.goals_achieved, data.goals_next_period),
        comments: data.comments || null,
        status: data.status,
      } as Database['public']['Tables']['performance_reviews']['Insert'];
      return isEditing ? updateReview(review!.id, payload) : createReview(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: performanceKeys.all });
      toast.success(isEditing ? 'Review updated' : 'Review created');
      onClose();
    },
    onError: () => {
      toast.error('Failed to save review');
    },
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Performance Review' : 'New Performance Review'}
      subtitle={isEditing ? "Update this performance review's details." : 'Enter the performance review details to get started.'}
      icon={ClipboardCheck}
      titleSize="sm"
      size="lg"
      showClose
      closeOnBackdrop={false}
    >
      <form onSubmit={handleSubmit(data => mutation.mutate(data))} className="space-y-5">
        <Controller
          name="employee_id"
          control={control}
          rules={{ required: 'Select an employee' }}
          render={({ field }) => (
            <SearchableSelect
              label="Employee"
              floatingLabel
              shrinkDefaultValue
              usePortal
              required
              disabled={isEditing}
              value={field.value}
              onChange={field.onChange}
              options={employees.map((e: { id: string; first_name: string; last_name: string; employee_number?: string | null }) => ({
                id: e.id,
                name: `${e.first_name} ${e.last_name}${e.employee_number ? ` (${e.employee_number})` : ''}`,
              }))}
              placeholder="Select an employee"
              error={errors.employee_id?.message}
            />
          )}
        />

        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
          <div>
            <label htmlFor={periodStartFieldId} className="block text-sm font-medium text-slate-700 mb-1">
              Period Start <span className="text-danger">*</span>
            </label>
            <Input
              id={periodStartFieldId}
              {...register('review_period_start', { required: 'Required' })}
              type="date"
            />
            {errors.review_period_start && (
              <p className="text-danger text-xs mt-1">{errors.review_period_start.message}</p>
            )}
          </div>
          <div>
            <label htmlFor={periodEndFieldId} className="block text-sm font-medium text-slate-700 mb-1">
              Period End <span className="text-danger">*</span>
            </label>
            <Input
              id={periodEndFieldId}
              {...register('review_period_end', { required: 'Required' })}
              type="date"
            />
            {errors.review_period_end && (
              <p className="text-danger text-xs mt-1">{errors.review_period_end.message}</p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Overall Rating</label>
          <StarPicker value={rating} onChange={setRating} />
        </div>

        <Textarea
          label="Strengths"
          floatingLabel
          {...register('strengths')}
          rows={3}
          className="resize-none"
          placeholder="Key strengths demonstrated during the review period..."
        />

        <Textarea
          label="Areas for Improvement"
          floatingLabel
          {...register('areas_for_improvement')}
          rows={3}
          className="resize-none"
          placeholder="Areas that need development or improvement..."
        />

        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
          <Textarea
            label="Goals Achieved"
            floatingLabel
            {...register('goals_achieved')}
            rows={3}
            className="resize-none"
            placeholder="Goals accomplished this period..."
          />
          <Textarea
            label="Goals Next Period"
            floatingLabel
            {...register('goals_next_period')}
            rows={3}
            className="resize-none"
            placeholder="Objectives for the next review period..."
          />
        </div>

        <Textarea
          label="Additional Comments"
          floatingLabel
          {...register('comments')}
          rows={2}
          className="resize-none"
          placeholder="Any additional comments or notes..."
        />

        <Controller
          name="status"
          control={control}
          render={({ field }) => (
            <SearchableSelect
              label="Status"
              floatingLabel
              shrinkDefaultValue
              usePortal
              value={field.value}
              onChange={field.onChange}
              options={[
                { id: 'draft', name: 'Draft' },
                { id: 'submitted', name: 'Submitted' },
                { id: 'completed', name: 'Completed' },
              ]}
              placeholder="Draft"
            />
          )}
        />

        <div className="flex justify-end gap-2.5 pt-2">
          <Button type="button" variant="secondary" size="sm" className="text-xs" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" className="text-xs" disabled={mutation.isPending}>
            {mutation.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Saving...
              </>
            ) : isEditing ? (
              'Update Review'
            ) : (
              'Save Review'
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

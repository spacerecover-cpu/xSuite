import React, { useEffect, useId } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { employeeOnboardingKeys } from '../../lib/queryKeys';
import {
  getChecklists,
  assignChecklistToEmployee,
} from '../../lib/employeeOnboardingService';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../../hooks/useToast';

interface FormData {
  employee_id: string;
  checklist_id: string;
  start_date: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  preselectedEmployeeId?: string;
}

export const AssignChecklistModal: React.FC<Props> = ({
  isOpen,
  onClose,
  preselectedEmployeeId,
}) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const employeeFieldId = useId();
  const checklistFieldId = useId();
  const startDateFieldId = useId();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      employee_id: preselectedEmployeeId || '',
      checklist_id: '',
      start_date: new Date().toISOString().split('T')[0],
    },
  });

  useEffect(() => {
    reset({
      employee_id: preselectedEmployeeId || '',
      checklist_id: '',
      start_date: new Date().toISOString().split('T')[0],
    });
  }, [isOpen, preselectedEmployeeId, reset]);

  const { data: checklists = [] } = useQuery({
    queryKey: employeeOnboardingKeys.checklists(),
    queryFn: getChecklists,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-for-onboarding'],
    queryFn: async () => {
      const { data } = await supabase
        .from('employees')
        .select('id, first_name, last_name, employee_number')
        .eq('employment_status', 'active')
        .order('first_name');
      return data || [];
    },
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      assignChecklistToEmployee(data.employee_id, data.checklist_id, data.start_date),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: employeeOnboardingKeys.all });
      toast.success('Checklist assigned successfully');
      onClose();
    },
    onError: () => {
      toast.error('Failed to assign checklist');
    },
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Assign Onboarding Checklist">
      <form onSubmit={handleSubmit(data => mutation.mutate(data))} className="space-y-4">
        <div>
          <label htmlFor={employeeFieldId} className="block text-sm font-medium text-slate-700 mb-1">
            Employee <span className="text-danger">*</span>
          </label>
          <select
            id={employeeFieldId}
            {...register('employee_id', { required: 'Select an employee' })}
            disabled={!!preselectedEmployeeId}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-slate-50"
          >
            <option value="">Select employee...</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>
                {e.first_name} {e.last_name}
                {e.employee_number ? ` (${e.employee_number})` : ''}
              </option>
            ))}
          </select>
          {errors.employee_id && (
            <p className="text-danger text-xs mt-1">{errors.employee_id.message}</p>
          )}
        </div>

        <div>
          <label htmlFor={checklistFieldId} className="block text-sm font-medium text-slate-700 mb-1">
            Checklist <span className="text-danger">*</span>
          </label>
          <select
            id={checklistFieldId}
            {...register('checklist_id', { required: 'Select a checklist' })}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Select checklist...</option>
            {checklists.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.item_count} items)
              </option>
            ))}
          </select>
          {errors.checklist_id && (
            <p className="text-danger text-xs mt-1">{errors.checklist_id.message}</p>
          )}
        </div>

        <div>
          <label htmlFor={startDateFieldId} className="block text-sm font-medium text-slate-700 mb-1">
            Start Date <span className="text-danger">*</span>
          </label>
          <Input
            id={startDateFieldId}
            {...register('start_date', { required: 'Start date is required' })}
            type="date"
          />
          {errors.start_date && (
            <p className="text-danger text-xs mt-1">{errors.start_date.message}</p>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Assigning...' : 'Assign Checklist'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

import React, { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Loader2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SearchableSelect } from '../ui/SearchableSelect';
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

  const { control, register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Assign Onboarding Checklist"
      subtitle="Assign an onboarding checklist to this employee."
      icon={ClipboardList}
      titleSize="sm"
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
              disabled={!!preselectedEmployeeId}
              value={field.value}
              onChange={field.onChange}
              options={[
                { id: '', name: 'No Employee' },
                ...employees.map(e => ({
                  id: e.id,
                  name: `${e.first_name} ${e.last_name}${e.employee_number ? ` (${e.employee_number})` : ''}`,
                })),
              ]}
              placeholder="No Employee"
              error={errors.employee_id?.message}
            />
          )}
        />

        <Controller
          name="checklist_id"
          control={control}
          rules={{ required: 'Select a checklist' }}
          render={({ field }) => (
            <SearchableSelect
              label="Checklist"
              floatingLabel
              shrinkDefaultValue
              usePortal
              required
              value={field.value}
              onChange={field.onChange}
              options={[
                { id: '', name: 'No Checklist' },
                ...checklists.map(c => ({
                  id: c.id,
                  name: `${c.name} (${c.item_count} items)`,
                })),
              ]}
              placeholder="No Checklist"
              error={errors.checklist_id?.message}
            />
          )}
        />

        <Input
          label="Start Date"
          floatingLabel
          type="date"
          required
          {...register('start_date', { required: 'Start date is required' })}
          error={errors.start_date?.message}
        />

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <Button type="button" variant="secondary" size="sm" className="text-xs" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" className="text-xs" disabled={mutation.isPending}>
            {mutation.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Assigning...
              </>
            ) : (
              'Assign Checklist'
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

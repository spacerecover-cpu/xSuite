import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, SlidersHorizontal } from 'lucide-react';
import { payrollService } from '../../lib/payrollService';
import { payrollKeys } from '../../lib/queryKeys';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { SearchableSelect } from '../ui/SearchableSelect';
import { useToast } from '../../hooks/useToast';
import { supabase } from '../../lib/supabaseClient';

interface Props {
  onClose: () => void;
}

export function AdjustmentFormModal({ onClose }: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    employee_id: '',
    type: 'bonus',
    amount: '',
    description: '',
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, first_name, last_name, employee_number')
        .eq('employment_status', 'active')
        .is('deleted_at', null)
        .order('first_name');

      if (error) throw error;
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: (data: Parameters<typeof payrollService.createPayrollAdjustment>[0]) => payrollService.createPayrollAdjustment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: payrollKeys.all });
      toast.success('Adjustment created successfully');
      onClose();
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create adjustment');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.employee_id || !formData.amount || !formData.description.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    saveMutation.mutate({
      tenant_id: '' as string,
      employee_id: formData.employee_id,
      type: formData.type,
      amount: parseFloat(formData.amount),
      description: formData.description.trim(),
    });
  };

  const handleChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const employeeOptions = employees.map((emp) => ({
    id: emp.id,
    name: `${emp.first_name} ${emp.last_name}${emp.employee_number ? ` (${emp.employee_number})` : ''}`,
  }));

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Add Payroll Adjustment"
      subtitle="Enter the payroll adjustment details to record it."
      icon={SlidersHorizontal}
      titleSize="sm"
      showClose
      closeOnBackdrop={false}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <SearchableSelect
          label="Employee"
          floatingLabel
          shrinkDefaultValue
          usePortal
          required
          options={employeeOptions}
          value={formData.employee_id}
          onChange={(value) => handleChange('employee_id', value)}
          placeholder="Select employee..."
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-5">
          <SearchableSelect
            label="Type"
            floatingLabel
            shrinkDefaultValue
            usePortal
            required
            value={formData.type}
            onChange={(value) => handleChange('type', value)}
            options={[
              { id: 'bonus', name: 'Bonus' },
              { id: 'advance', name: 'Salary Advance' },
              { id: 'reimbursement', name: 'Reimbursement' },
              { id: 'deduction', name: 'Deduction' },
              { id: 'other', name: 'Other' },
            ]}
          />

          <Input
            label="Amount (OMR)"
            floatingLabel
            required
            type="number"
            step="0.001"
            value={formData.amount}
            onChange={(e) => handleChange('amount', e.target.value)}
            placeholder="0.000"
          />
        </div>

        <Textarea
          label="Description"
          floatingLabel
          required
          value={formData.description}
          onChange={(e) => handleChange('description', e.target.value)}
          placeholder="Enter reason for adjustment..."
          className="resize-none"
          rows={3}
        />

        <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200">
          <Button type="button" variant="secondary" size="sm" className="text-xs" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" className="text-xs" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Adjustment'
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

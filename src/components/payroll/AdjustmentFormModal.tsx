import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { payrollService } from '../../lib/payrollService';
import { payrollKeys } from '../../lib/queryKeys';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
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
    <Modal isOpen onClose={onClose} title="Add Payroll Adjustment">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <SearchableSelect
            label="Employee"
            required
            options={employeeOptions}
            value={formData.employee_id}
            onChange={(value) => handleChange('employee_id', value)}
            placeholder="Select employee..."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Type <span className="text-danger">*</span>
            </label>
            <select
              value={formData.type}
              onChange={(e) => handleChange('type', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="bonus">Bonus</option>
              <option value="commission">Commission</option>
              <option value="advance">Salary Advance</option>
              <option value="penalty">Penalty</option>
              <option value="reimbursement">Reimbursement</option>
              <option value="deduction">Deduction</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Amount (OMR) <span className="text-danger">*</span>
            </label>
            <Input
              type="number"
              step="0.001"
              value={formData.amount}
              onChange={(e) => handleChange('amount', e.target.value)}
              placeholder="0.000"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Description <span className="text-danger">*</span>
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder="Enter reason for adjustment..."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            rows={3}
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Creating...' : 'Create Adjustment'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

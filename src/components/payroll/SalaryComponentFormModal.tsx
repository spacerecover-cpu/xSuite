import { useId, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { payrollService } from '../../lib/payrollService';
import { payrollKeys } from '../../lib/queryKeys';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { useToast } from '../../hooks/useToast';
import type { Database } from '../../types/database.types';

type SalaryComponent = Database['public']['Tables']['salary_components']['Row'];
type SalaryComponentInsert = Database['public']['Tables']['salary_components']['Insert'];

interface Props {
  component: SalaryComponent | null;
  onClose: () => void;
}

export function SalaryComponentFormModal({ component, onClose }: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!component;
  const nameFieldRef = useRef<HTMLInputElement>(null);
  const nameFieldId = useId();
  const typeFieldId = useId();
  const calculationFieldId = useId();
  const percentageFieldId = useId();

  const [formData, setFormData] = useState({
    name: component?.name || '',
    type: component?.type || 'earning',
    calculation_type: component?.calculation_type || 'fixed',
    percentage: component?.percentage?.toString() || '0',
    is_taxable: component?.is_taxable ?? true,
    is_mandatory: component?.is_mandatory ?? false,
  });

  const saveMutation = useMutation({
    mutationFn: (data: SalaryComponentInsert) => {
      if (isEditing) {
        return payrollService.updateSalaryComponent(component.id, data);
      }
      return payrollService.createSalaryComponent(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: payrollKeys.salaryComponents() });
      toast.success(
        isEditing ? 'Component updated successfully' : 'Component created successfully'
      );
      onClose();
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Failed to save component');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    const submitData: SalaryComponentInsert = {
      tenant_id: '' as string,
      name: formData.name.trim(),
      type: formData.type,
      calculation_type: formData.calculation_type,
      percentage: formData.calculation_type === 'percentage' ? parseFloat(formData.percentage) || 0 : null,
      is_taxable: formData.is_taxable,
      is_mandatory: formData.is_mandatory,
      is_active: true,
    };

    saveMutation.mutate(submitData);
  };

  const handleChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Modal isOpen onClose={onClose} title={isEditing ? 'Edit Salary Component' : 'Add Salary Component'} closeOnBackdrop={false} initialFocusRef={nameFieldRef}>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor={nameFieldId} className="block text-sm font-medium text-slate-700 mb-2">
              Name <span className="text-danger">*</span>
            </label>
            <Input
              ref={nameFieldRef}
              id={nameFieldId}
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="e.g., Basic Salary"
            />
          </div>

          <div>
            <label htmlFor={typeFieldId} className="block text-sm font-medium text-slate-700 mb-2">
              Component Type <span className="text-danger">*</span>
            </label>
            <select
              id={typeFieldId}
              value={formData.type}
              onChange={(e) => handleChange('type', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="earning">Earning</option>
              <option value="allowance">Allowance</option>
              <option value="bonus">Bonus</option>
              <option value="deduction">Deduction</option>
            </select>
          </div>

          <div>
            <label htmlFor={calculationFieldId} className="block text-sm font-medium text-slate-700 mb-2">
              Calculation Type <span className="text-danger">*</span>
            </label>
            <select
              id={calculationFieldId}
              value={formData.calculation_type}
              onChange={(e) => handleChange('calculation_type', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="fixed">Fixed Amount</option>
              <option value="percentage">Percentage</option>
            </select>
          </div>

          {formData.calculation_type === 'percentage' && (
            <div>
              <label htmlFor={percentageFieldId} className="block text-sm font-medium text-slate-700 mb-2">
                Percentage (%)
              </label>
              <Input
                id={percentageFieldId}
                type="number"
                step="0.01"
                value={formData.percentage}
                onChange={(e) => handleChange('percentage', e.target.value)}
                placeholder="0"
              />
            </div>
          )}
        </div>

        <div className="space-y-3 border-t border-slate-200 pt-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={formData.is_taxable}
              onChange={(e) => handleChange('is_taxable', e.target.checked)}
              className="w-4 h-4 text-primary border-slate-300 rounded focus:ring-primary"
            />
            <div>
              <span className="text-sm font-medium text-slate-700">Taxable</span>
              <p className="text-xs text-slate-500">Include in taxable income calculations</p>
            </div>
          </label>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={formData.is_mandatory}
              onChange={(e) => handleChange('is_mandatory', e.target.checked)}
              className="w-4 h-4 text-primary border-slate-300 rounded focus:ring-primary"
            />
            <div>
              <span className="text-sm font-medium text-slate-700">Mandatory</span>
              <p className="text-xs text-slate-500">Required component for all employees</p>
            </div>
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving...' : isEditing ? 'Update' : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

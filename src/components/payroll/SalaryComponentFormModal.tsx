import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Wallet } from 'lucide-react';
import { payrollService } from '../../lib/payrollService';
import { payrollKeys } from '../../lib/queryKeys';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { SearchableSelect } from '../ui/SearchableSelect';
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
    <Modal
      isOpen
      onClose={onClose}
      title={isEditing ? 'Edit Salary Component' : 'Add Salary Component'}
      subtitle={isEditing ? "Update this salary component's details." : 'Enter the salary component details to add it.'}
      icon={Wallet}
      titleSize="sm"
      showClose
      closeOnBackdrop={false}
      initialFocusRef={nameFieldRef}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-5">
          <Input
            ref={nameFieldRef}
            label="Name"
            floatingLabel
            required
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="e.g., Basic Salary"
          />

          <SearchableSelect
            label="Component Type"
            floatingLabel
            usePortal
            required
            value={formData.type}
            onChange={(value) => handleChange('type', value)}
            options={[
              { id: 'earning', name: 'Earning' },
              { id: 'allowance', name: 'Allowance' },
              { id: 'bonus', name: 'Bonus' },
              { id: 'deduction', name: 'Deduction' },
            ]}
          />

          <SearchableSelect
            label="Calculation Type"
            floatingLabel
            usePortal
            required
            value={formData.calculation_type}
            onChange={(value) => handleChange('calculation_type', value)}
            options={[
              { id: 'fixed', name: 'Fixed Amount' },
              { id: 'percentage', name: 'Percentage' },
            ]}
          />

          {formData.calculation_type === 'percentage' && (
            <Input
              label="Percentage (%)"
              floatingLabel
              type="number"
              step="0.01"
              value={formData.percentage}
              onChange={(e) => handleChange('percentage', e.target.value)}
              placeholder="0"
            />
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

        <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200">
          <Button type="button" variant="secondary" size="sm" className="text-xs" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" className="text-xs" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Saving...
              </>
            ) : isEditing ? (
              'Update'
            ) : (
              'Create'
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

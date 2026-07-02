import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, CreditCard as Edit2, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { payrollService } from '../../lib/payrollService';
import { payrollKeys } from '../../lib/queryKeys';
import { Button } from '../../components/ui/Button';
import { PageHeaderSlot } from '../../components/layout/PageHeaderSlot';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../hooks/useToast';
import { SalaryComponentFormModal } from '../../components/payroll/SalaryComponentFormModal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import type { Database } from '../../types/database.types';

type SalaryComponent = Database['public']['Tables']['salary_components']['Row'];

export default function SalaryComponentsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingComponent, setEditingComponent] = useState<SalaryComponent | null>(null);
  const [deletingComponent, setDeletingComponent] = useState<SalaryComponent | null>(null);

  const { data: components = [], isLoading } = useQuery({
    queryKey: payrollKeys.salaryComponents(),
    queryFn: () => payrollService.getSalaryComponents(),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      payrollService.updateSalaryComponent(id, { is_active: isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: payrollKeys.salaryComponents() });
      toast.success('Component status updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update component');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => payrollService.deleteSalaryComponent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: payrollKeys.salaryComponents() });
      toast.success('Component deleted successfully');
      setDeletingComponent(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete component');
    },
  });

  const handleEdit = (component: SalaryComponent) => {
    setEditingComponent(component);
    setShowFormModal(true);
  };

  const handleAdd = () => {
    setEditingComponent(null);
    setShowFormModal(true);
  };

  const handleCloseModal = () => {
    setShowFormModal(false);
    setEditingComponent(null);
  };

  const handleToggleActive = (component: SalaryComponent) => {
    toggleActiveMutation.mutate({ id: component.id, isActive: !component.is_active });
  };

  const handleDelete = (component: SalaryComponent) => {
    setDeletingComponent(component);
  };

  const confirmDelete = () => {
    if (deletingComponent) {
      deleteMutation.mutate(deletingComponent.id);
    }
  };

  const earningComponents = components.filter((c) => c.type === 'earning' || c.type === 'allowance' || c.type === 'bonus');
  const deductionComponents = components.filter((c) => c.type === 'deduction');

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-1/4"></div>
          <div className="h-64 bg-slate-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1400px] mx-auto">
      <PageHeaderSlot
        title="Salary Components"
        actions={
          <Button onClick={handleAdd}>
            <Plus className="w-4 h-4 mr-2" />
            Add Component
          </Button>
        }
      />

      <div className="space-y-8">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Earnings & Allowances</h2>
            <Badge variant="success">{earningComponents.length} Components</Badge>
          </div>

          {earningComponents.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <p className="text-slate-500">No earning components defined yet.</p>
              <Button onClick={handleAdd} variant="secondary" className="mt-4">
                <Plus className="w-4 h-4 mr-2" />
                Add First Earning Component
              </Button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Calculation
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Percentage
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {earningComponents.map((component) => (
                    <tr key={component.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-slate-900">{component.name}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant="success">{component.type}</Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-slate-700 capitalize">{component.calculation_type}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-slate-900">
                          {component.calculation_type === 'percentage' && component.percentage != null
                            ? `${component.percentage}%`
                            : '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={component.is_active ? 'success' : 'secondary'}>
                          {component.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleToggleActive(component)}
                            className="p-1.5 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100"
                            title={component.is_active ? 'Deactivate' : 'Activate'}
                          >
                            {component.is_active ? (
                              <ToggleRight className="w-4 h-4" />
                            ) : (
                              <ToggleLeft className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => handleEdit(component)}
                            className="p-1.5 text-primary hover:text-primary/90 rounded-lg hover:bg-primary/10"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(component)}
                            className="p-1.5 text-danger hover:text-danger/90 rounded-lg hover:bg-danger-muted"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Deductions</h2>
            <Badge variant="danger">{deductionComponents.length} Components</Badge>
          </div>

          {deductionComponents.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <p className="text-slate-500">No deduction components defined yet.</p>
              <Button onClick={handleAdd} variant="secondary" className="mt-4">
                <Plus className="w-4 h-4 mr-2" />
                Add First Deduction Component
              </Button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Calculation
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Percentage
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {deductionComponents.map((component) => (
                    <tr key={component.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-slate-900">{component.name}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant="danger">{component.type}</Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-slate-700 capitalize">{component.calculation_type}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-slate-900">
                          {component.calculation_type === 'percentage' && component.percentage != null
                            ? `${component.percentage}%`
                            : '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={component.is_active ? 'success' : 'secondary'}>
                          {component.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleToggleActive(component)}
                            className="p-1.5 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100"
                            title={component.is_active ? 'Deactivate' : 'Activate'}
                          >
                            {component.is_active ? (
                              <ToggleRight className="w-4 h-4" />
                            ) : (
                              <ToggleLeft className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => handleEdit(component)}
                            className="p-1.5 text-primary hover:text-primary/90 rounded-lg hover:bg-primary/10"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(component)}
                            className="p-1.5 text-danger hover:text-danger/90 rounded-lg hover:bg-danger-muted"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showFormModal && (
        <SalaryComponentFormModal
          component={editingComponent}
          onClose={handleCloseModal}
        />
      )}

      {deletingComponent && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setDeletingComponent(null)}
          onConfirm={confirmDelete}
          title="Delete Salary Component"
          message={`Are you sure you want to delete "${deletingComponent.name}"? This action cannot be undone.`}
          confirmText="Delete"
          variant="danger"
        />
      )}
    </div>
  );
}

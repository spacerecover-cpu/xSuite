import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Check, X, Search, TrendingUp, TrendingDown } from 'lucide-react';
import { payrollService } from '../../lib/payrollService';
import { payrollKeys } from '../../lib/queryKeys';
import { Button } from '../../components/ui/Button';
import { PageHeaderSlot } from '../../components/layout/PageHeaderSlot';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../hooks/useToast';
import { useCurrency } from '../../hooks/useCurrency';
import { format } from 'date-fns';
import { AdjustmentFormModal } from '../../components/payroll/AdjustmentFormModal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

type AdjustmentRow = Awaited<ReturnType<typeof payrollService.getPayrollAdjustments>>[number];

export default function PayrollAdjustmentsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { formatCurrency } = useCurrency();
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showFormModal, setShowFormModal] = useState(false);
  const [approvingAdjustment, setApprovingAdjustment] = useState<AdjustmentRow | null>(null);
  const [cancellingAdjustment, setCancellingAdjustment] = useState<AdjustmentRow | null>(null);

  const { data: adjustments = [], isLoading } = useQuery({
    queryKey: payrollKeys.adjustments({ status: statusFilter === 'all' ? undefined : statusFilter }),
    queryFn: () =>
      payrollService.getPayrollAdjustments({
        status: statusFilter === 'all' ? undefined : statusFilter,
      }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => payrollService.approvePayrollAdjustment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: payrollKeys.all });
      toast.success('Adjustment approved successfully');
      setApprovingAdjustment(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to approve adjustment');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => payrollService.cancelPayrollAdjustment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: payrollKeys.all });
      toast.success('Adjustment cancelled');
      setCancellingAdjustment(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to cancel adjustment');
    },
  });

  const filteredAdjustments = adjustments.filter(
    (adj) =>
      adj.employee?.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      adj.employee?.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      adj.employee?.employee_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      adj.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadgeVariant = (status: string | null): 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' => {
    switch (status) {
      case 'pending':
        return 'warning';
      case 'approved':
        return 'success';
      case 'applied':
        return 'success';
      case 'cancelled':
        return 'danger';
      default:
        return 'secondary';
    }
  };

  const getAdjustmentTypeLabel = (type: string | null) => {
    if (!type) return '';
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const isDeductionType = (type: string | null) => {
    return type === 'deduction' || type === 'penalty' || type === 'advance';
  };

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
        title="Payroll Adjustments"
        actions={
          <Button onClick={() => setShowFormModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Adjustment
          </Button>
        }
      />

      <div className="mb-6 flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Search adjustments..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="applied">Applied</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {filteredAdjustments.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-slate-500">
              {searchTerm ? 'No adjustments found matching your search' : 'No payroll adjustments yet'}
            </p>
            <Button onClick={() => setShowFormModal(true)} variant="secondary" className="mt-4">
              <Plus className="w-4 h-4 mr-2" />
              Add First Adjustment
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Employee
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Effective Date
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
                {filteredAdjustments.map((adjustment) => (
                  <tr key={adjustment.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-900">
                          {adjustment.employee?.first_name} {adjustment.employee?.last_name}
                        </span>
                        <span className="text-xs text-slate-500">
                          {adjustment.employee?.employee_number}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={isDeductionType(adjustment.type) ? 'danger' : 'success'}>
                        {getAdjustmentTypeLabel(adjustment.type)}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-700">{adjustment.description}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isDeductionType(adjustment.type) ? (
                          <TrendingDown className="w-4 h-4 text-danger" />
                        ) : (
                          <TrendingUp className="w-4 h-4 text-success" />
                        )}
                        <span
                          className={`text-sm font-medium ${
                            isDeductionType(adjustment.type) ? 'text-danger' : 'text-success'
                          }`}
                        >
                          {formatCurrency(adjustment.amount)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-700">
                        {format(new Date(adjustment.created_at), 'MMM dd, yyyy')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={getStatusBadgeVariant(adjustment.status)}>
                        {adjustment.status ?? 'unknown'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {adjustment.status === 'pending' && (
                          <>
                            <button
                              onClick={() => setApprovingAdjustment(adjustment)}
                              className="p-1.5 text-success hover:text-success/90 rounded-lg hover:bg-success-muted"
                              title="Approve"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setCancellingAdjustment(adjustment)}
                              className="p-1.5 text-danger hover:text-danger/90 rounded-lg hover:bg-danger-muted"
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showFormModal && (
        <AdjustmentFormModal onClose={() => setShowFormModal(false)} />
      )}

      {approvingAdjustment && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setApprovingAdjustment(null)}
          onConfirm={() => approveMutation.mutate(approvingAdjustment.id)}
          title="Approve Adjustment"
          message={`Are you sure you want to approve this ${getAdjustmentTypeLabel(
            approvingAdjustment.type
          )} of ${formatCurrency(approvingAdjustment.amount)} for ${
            approvingAdjustment.employee?.first_name
          } ${approvingAdjustment.employee?.last_name}?`}
          confirmText="Approve"
          variant="info"
        />
      )}

      {cancellingAdjustment && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setCancellingAdjustment(null)}
          onConfirm={() => cancelMutation.mutate(cancellingAdjustment.id)}
          title="Cancel Adjustment"
          message={`Are you sure you want to cancel this adjustment? This action cannot be undone.`}
          confirmText="Cancel Adjustment"
          variant="danger"
        />
      )}
    </div>
  );
}

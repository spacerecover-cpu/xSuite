import React from 'react';
import { CheckCircle, Clock, XCircle, DollarSign, Calendar, TrendingUp } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { payrollService } from '../../lib/payrollService';
import { payrollKeys } from '../../lib/queryKeys';
import { supabase } from '../../lib/supabaseClient';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { useCurrency } from '../../hooks/useCurrency';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import { useAuth } from '../../contexts/AuthContext';

interface LoanDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  loanId: string;
}

export const LoanDetailModal: React.FC<LoanDetailModalProps> = ({
  isOpen,
  onClose,
  loanId,
}) => {
  const { formatCurrency } = useCurrency();
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: loan, isLoading } = useQuery({
    queryKey: ['loan', loanId],
    queryFn: () => payrollService.getEmployeeLoan(loanId),
    enabled: !!loanId,
  });

  const { data: repayments = [] } = useQuery({
    queryKey: ['loan-repayments', loanId],
    queryFn: () => payrollService.getLoanRepaymentHistory(loanId),
    enabled: !!loanId,
  });

  const cancelLoanMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('employee_loans')
        .update({ status: 'cancelled' })
        .eq('id', loanId)
        .select()
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: payrollKeys.all });
      queryClient.invalidateQueries({ queryKey: ['loan', loanId] });
      toast.success('Loan cancelled successfully');
      onClose();
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Failed to cancel loan');
    },
  });

  const approveLoanMutation = useMutation({
    mutationFn: () => payrollService.approveLoan(loanId, user?.id || ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: payrollKeys.all });
      queryClient.invalidateQueries({ queryKey: ['loan', loanId] });
      toast.success('Loan approved successfully');
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Failed to approve loan');
    },
  });

  if (isLoading || !loan) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Loan Details">
        <div className="p-8 text-center text-slate-500">Loading loan details...</div>
      </Modal>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <TrendingUp className="h-5 w-5 text-info" />;
      case 'pending':
        return <Clock className="h-5 w-5 text-warning" />;
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-success" />;
      case 'cancelled':
        return <XCircle className="h-5 w-5 text-danger" />;
      default:
        return null;
    }
  };

  const getStatusVariant = (status: string): 'success' | 'warning' | 'info' | 'danger' | 'default' => {
    switch (status) {
      case 'active':
        return 'info';
      case 'pending':
        return 'warning';
      case 'completed':
        return 'success';
      case 'cancelled':
        return 'danger';
      default:
        return 'default';
    }
  };

  const generateRepaymentSchedule = () => {
    const schedule = [];
    const startDate = new Date(loan.start_date);
    const installments = loan.installments;
    const installmentAmount = Number(loan.installment_amount);

    for (let i = 0; i < installments; i++) {
      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + i);

      const isPaid = i < (loan.paid_installments || 0);
      const repayment = repayments.find((r) => {
        const repaymentDate = new Date(r.repayment_date);
        return (
          repaymentDate.getMonth() === dueDate.getMonth() &&
          repaymentDate.getFullYear() === dueDate.getFullYear()
        );
      });

      schedule.push({
        installmentNumber: i + 1,
        dueDate,
        amount: installmentAmount,
        status: isPaid ? 'paid' : 'pending',
        paymentDate: repayment?.repayment_date,
      });
    }

    return schedule;
  };

  const schedule = generateRepaymentSchedule();
  const progress = ((loan.paid_installments || 0) / loan.installments) * 100;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Loan Details" size="large">
      <div className="space-y-6">
        <div className="flex items-center justify-between pb-4 border-b">
          <div className="flex items-center space-x-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{loan.loan_number}</h2>
              <p className="text-sm text-slate-600">
                {loan.employee.first_name} {loan.employee.last_name} (
                {loan.employee.employee_number})
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {getStatusIcon(loan.status || 'pending')}
            <Badge variant={getStatusVariant(loan.status || 'pending')}>
              {(loan.status || 'pending').charAt(0).toUpperCase() +
                (loan.status || 'pending').slice(1)}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-600">Principal</span>
              <DollarSign className="h-4 w-4 text-slate-400" />
            </div>
            <p className="text-xl font-bold text-slate-900">
              {formatCurrency(Number(loan.amount))}
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-600">Total Amount</span>
              <DollarSign className="h-4 w-4 text-slate-400" />
            </div>
            <p className="text-xl font-bold text-slate-900">
              {formatCurrency(Number(loan.total_amount))}
            </p>
            {loan.interest_rate && Number(loan.interest_rate) > 0 && (
              <p className="text-xs text-slate-500 mt-1">{loan.interest_rate}% interest</p>
            )}
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-600">Remaining</span>
              <TrendingUp className="h-4 w-4 text-slate-400" />
            </div>
            <p className="text-xl font-bold text-warning">
              {formatCurrency(Number(loan.remaining_amount))}
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-600">Next Payment</span>
              <Calendar className="h-4 w-4 text-slate-400" />
            </div>
            <p className="text-xl font-bold text-slate-900">
              {formatCurrency(Number(loan.installment_amount))}
            </p>
            {loan.status === 'active' && (
              <p className="text-xs text-slate-500 mt-1">
                Due {new Date(loan.start_date).toLocaleDateString()}
              </p>
            )}
          </Card>
        </div>

        <div className="bg-slate-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">Repayment Progress</span>
            <span className="text-sm text-slate-600">
              {loan.paid_installments || 0} of {loan.installments} installments
            </span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-3">
            <div
              className="bg-primary h-3 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs text-slate-500">
              {formatCurrency(
                Number(loan.total_amount) - Number(loan.remaining_amount)
              )}{' '}
              paid
            </span>
            <span className="text-xs text-slate-500">{progress.toFixed(1)}%</span>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Loan Information</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-600">Loan Type:</span>
              <p className="font-medium text-slate-900 mt-1">
                {(loan.loan_type ?? '')
                  .split('_')
                  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                  .join(' ') || '-'}
              </p>
            </div>
            <div>
              <span className="text-slate-600">Interest Rate:</span>
              <p className="font-medium text-slate-900 mt-1">
                {loan.interest_rate ? `${loan.interest_rate}%` : 'Interest-free'}
              </p>
            </div>
            <div>
              <span className="text-slate-600">Start Date:</span>
              <p className="font-medium text-slate-900 mt-1">
                {new Date(loan.start_date).toLocaleDateString()}
              </p>
            </div>
            <div>
              <span className="text-slate-600">End Date:</span>
              <p className="font-medium text-slate-900 mt-1">
                {loan.end_date ? new Date(loan.end_date).toLocaleDateString() : '-'}
              </p>
            </div>
          </div>
          {loan.notes && (
            <div className="mt-4">
              <span className="text-slate-600">Notes:</span>
              <p className="text-slate-900 mt-1">{loan.notes}</p>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Repayment Schedule</h3>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Due Date
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {schedule.map((item) => (
                  <tr
                    key={item.installmentNumber}
                    className={
                      item.status === 'paid'
                        ? 'bg-success-muted'
                        : item.installmentNumber === (loan.paid_installments || 0) + 1
                          ? 'bg-info-muted'
                          : ''
                    }
                  >
                    <td className="px-4 py-3 text-sm text-slate-900">
                      {item.installmentNumber}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-900">
                      {item.dueDate.toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-slate-900">
                      {formatCurrency(item.amount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {item.status === 'paid' ? (
                        <Badge variant="success">
                          <CheckCircle className="h-3 w-3 mr-1 inline" />
                          Paid
                        </Badge>
                      ) : (
                        <Badge variant="default">
                          <Clock className="h-3 w-3 mr-1 inline" />
                          Pending
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-between pt-6 border-t">
          <div className="space-x-3">
            {loan.status === 'pending' && (
              <Button
                onClick={() => approveLoanMutation.mutate()}
                disabled={approveLoanMutation.isPending}
              >
                Approve Loan
              </Button>
            )}
            {(loan.status === 'pending' || loan.status === 'active') && (
              <Button
                variant="secondary"
                onClick={async () => {
                  const ok = await confirm({
                    title: 'Cancel Loan',
                    message:
                      'Are you sure you want to cancel this loan? This action cannot be undone.',
                    confirmLabel: 'Cancel Loan',
                    tone: 'danger',
                  });
                  if (ok) {
                    cancelLoanMutation.mutate();
                  }
                }}
                disabled={cancelLoanMutation.isPending}
              >
                Cancel Loan
              </Button>
            )}
          </div>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};

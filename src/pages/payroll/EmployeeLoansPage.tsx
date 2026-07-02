import React, { useState } from 'react';
import { Plus, Search, TrendingUp, DollarSign, Calendar } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { payrollService } from '../../lib/payrollService';
import { payrollKeys } from '../../lib/queryKeys';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { StatCard } from '../../components/shared/StatCard';
import { PageHeaderSlot } from '../../components/layout/PageHeaderSlot';
import { LoanFormModal } from '../../components/payroll/LoanFormModal';
import { LoanDetailModal } from '../../components/payroll/LoanDetailModal';
import { useCurrency } from '../../hooks/useCurrency';
import type { Database } from '../../types/database.types';

type EmployeeLoan = Database['public']['Tables']['employee_loans']['Row'] & {
  employee: {
    first_name: string;
    last_name: string;
    employee_number: string | null;
  };
};

export const EmployeeLoansPage: React.FC = () => {
  const { formatCurrency } = useCurrency();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);

  const loanFilters = statusFilter !== 'all' ? { status: statusFilter } : undefined;

  const { data: loans = [], isLoading } = useQuery({
    queryKey: payrollKeys.loans(loanFilters),
    queryFn: () => payrollService.getEmployeeLoans(loanFilters),
  });

  const filteredLoans = loans.filter((loan) => {
    const matchesSearch =
      !searchTerm ||
      loan.loan_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${loan.employee.first_name} ${loan.employee.last_name}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      loan.employee.employee_number?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = typeFilter === 'all' || loan.loan_type === typeFilter;

    return matchesSearch && matchesType;
  });

  const stats = {
    activeLoans: loans.filter((l) => l.status === 'active').length,
    totalOutstanding: loans
      .filter((l) => l.status === 'active')
      .reduce((sum, l) => sum + Number(l.remaining_amount ?? 0), 0),
    monthlyDeductions: loans
      .filter((l) => l.status === 'active')
      .reduce((sum, l) => sum + Number(l.installment_amount), 0),
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

  const getTypeVariant = (type: string | null): 'info' | 'warning' | 'default' => {
    switch (type) {
      case 'salary_advance':
        return 'info';
      case 'personal_loan':
        return 'default';
      case 'emergency_loan':
        return 'warning';
      default:
        return 'default';
    }
  };

  const formatType = (type: string | null) => {
    if (!type) return '';
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const calculateProgress = (loan: EmployeeLoan) => {
    const paid = loan.paid_installments || 0;
    const total = loan.installments;
    const percentage = total > 0 ? (paid / total) * 100 : 0;
    return { paid, total, percentage };
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeaderSlot
        title="Employee Loans"
        actions={
          <Button onClick={() => setShowLoanForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Loan
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          label="Active Loans"
          value={String(stats.activeLoans)}
          icon={TrendingUp}
        />
        <StatCard
          label="Total Outstanding"
          value={formatCurrency(stats.totalOutstanding)}
          icon={DollarSign}
        />
        <StatCard
          label="Monthly Deductions"
          value={formatCurrency(stats.monthlyDeductions)}
          icon={Calendar}
        />
      </div>

      <Card>
        <div className="p-6 border-b border-slate-200">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search by loan number, employee name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="all">All Types</option>
              <option value="salary_advance">Salary Advance</option>
              <option value="personal_loan">Personal Loan</option>
              <option value="emergency_loan">Emergency Loan</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-slate-500">Loading loans...</div>
          ) : filteredLoans.length === 0 ? (
            <div className="p-12 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4">
                <TrendingUp className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-medium text-slate-900 mb-2">No loans found</h3>
              <p className="text-slate-500 mb-6">
                Get started by creating your first employee loan.
              </p>
              <Button onClick={() => setShowLoanForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add First Loan
              </Button>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Loan Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Employee
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Principal
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Total Amount
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Installment
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Progress
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Remaining
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {filteredLoans.map((loan) => {
                  const progress = calculateProgress(loan);
                  return (
                    <tr
                      key={loan.id}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                      onClick={() => setSelectedLoanId(loan.id)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-primary hover:text-primary/80">
                          {loan.loan_number}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-slate-900">
                            {loan.employee.first_name} {loan.employee.last_name}
                          </div>
                          <div className="text-sm text-slate-500">
                            {loan.employee.employee_number}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={getTypeVariant(loan.loan_type)}>
                          {formatType(loan.loan_type)}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-slate-900">
                        {formatCurrency(Number(loan.amount))}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm text-slate-900">
                          {formatCurrency(Number(loan.total_amount))}
                        </div>
                        {loan.interest_rate && Number(loan.interest_rate) > 0 && (
                          <div className="text-xs text-slate-500">
                            ({loan.interest_rate}% interest)
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-slate-900">
                        {formatCurrency(Number(loan.installment_amount))}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <div className="flex-1 bg-slate-200 rounded-full h-2 max-w-[100px]">
                            <div
                              className="bg-primary h-2 rounded-full transition-all"
                              style={{ width: `${progress.percentage}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-600 whitespace-nowrap">
                            {progress.paid}/{progress.total}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-slate-900">
                        {formatCurrency(Number(loan.remaining_amount ?? 0))}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={getStatusVariant(loan.status || 'pending')}>
                          {(loan.status || 'pending').charAt(0).toUpperCase() +
                            (loan.status || 'pending').slice(1)}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLoanId(loan.id);
                          }}
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {showLoanForm && (
        <LoanFormModal isOpen={showLoanForm} onClose={() => setShowLoanForm(false)} />
      )}

      {selectedLoanId && (
        <LoanDetailModal
          isOpen={!!selectedLoanId}
          onClose={() => setSelectedLoanId(null)}
          loanId={selectedLoanId}
        />
      )}
    </div>
  );
};

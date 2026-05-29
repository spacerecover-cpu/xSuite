import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, DollarSign, Calendar, TrendingUp, CreditCard as Edit } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { payrollService } from '../../lib/payrollService';
import { payrollKeys } from '../../lib/queryKeys';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { useCurrency } from '../../hooks/useCurrency';
import type { Database } from '../../types/database.types';

type Employee = Database['public']['Tables']['employees']['Row'] & {
  profiles: Database['public']['Tables']['profiles']['Row'];
  departments: Database['public']['Tables']['departments']['Row'] | null;
  positions: Database['public']['Tables']['positions']['Row'] | null;
};

export const EmployeeProfilePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { formatCurrency } = useCurrency();

  const { data: employee, isLoading } = useQuery({
    queryKey: ['employee', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select(`
          *,
          profiles (*),
          departments (*),
          positions (*)
        `)
        .eq('id', id!)
        .maybeSingle();

      if (error) throw error;
      return data as Employee;
    },
    enabled: !!id,
  });

  const { data: salaryStructure } = useQuery({
    queryKey: ['employee-salary', id],
    queryFn: () => payrollService.getEmployeeSalaryStructure(id!),
    enabled: !!id,
  });

  const { data: activeLoans = [] } = useQuery({
    queryKey: payrollKeys.employeeLoans(id ?? ''),
    queryFn: () => payrollService.getEmployeeLoans({ employeeId: id }),
    enabled: !!id,
  });

  if (isLoading || !employee) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-1/4"></div>
          <div className="h-64 bg-slate-200 rounded"></div>
        </div>
      </div>
    );
  }

  const totalLoanDeductions = activeLoans
    .filter((l) => l.status === 'active')
    .reduce((sum, l) => sum + Number(l.installment_amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="secondary" onClick={() => navigate('/hr/employees')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {employee.first_name} {employee.last_name}
            </h1>
            <p className="text-sm text-gray-600">
              {employee.employee_number} • {employee.departments?.name} •{' '}
              {employee.positions?.title}
            </p>
          </div>
        </div>
        <Badge
          color={
            employee.employment_status === 'active'
              ? 'green'
              : employee.employment_status === 'on_leave'
                ? 'yellow'
                : 'red'
          }
        >
          {employee.employment_status}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Current Salary</span>
            <DollarSign className="h-5 w-5 text-gray-400" />
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {employee.basic_salary != null
              ? formatCurrency(Number(employee.basic_salary))
              : 'Not Set'}
          </p>
          {employee.salary_currency && (
            <p className="text-xs text-gray-500 mt-1">{employee.salary_currency}</p>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Active Loans</span>
            <TrendingUp className="h-5 w-5 text-gray-400" />
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {activeLoans.filter((l) => l.status === 'active').length}
          </p>
          {totalLoanDeductions > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              {formatCurrency(totalLoanDeductions)} monthly
            </p>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Hire Date</span>
            <Calendar className="h-5 w-5 text-gray-400" />
          </div>
          <p className="text-lg font-bold text-gray-900">
            {employee.hire_date
              ? new Date(employee.hire_date).toLocaleDateString()
              : 'Not Set'}
          </p>
        </Card>
      </div>

      <Card>
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Salary Structure</h2>
            <Button size="sm" variant="secondary">
              <Edit className="h-4 w-4 mr-2" />
              Update Salary
            </Button>
          </div>
        </div>
        <div className="p-6">
          {salaryStructure ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-gray-600">Structure Name</span>
                  <p className="text-lg font-semibold text-gray-900 mt-1">
                    {salaryStructure.name}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Net Salary</span>
                  <p className="text-lg font-semibold text-gray-900 mt-1">
                    {salaryStructure.net_salary != null
                      ? formatCurrency(Number(salaryStructure.net_salary))
                      : '-'}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Total Earnings</span>
                  <p className="text-lg font-semibold text-gray-900 mt-1">
                    {salaryStructure.total_earnings != null
                      ? formatCurrency(Number(salaryStructure.total_earnings))
                      : '-'}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Total Deductions</span>
                  <p className="text-lg font-semibold text-gray-900 mt-1">
                    {salaryStructure.total_deductions != null
                      ? formatCurrency(Number(salaryStructure.total_deductions))
                      : '-'}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Effective Date</span>
                  <p className="text-lg font-semibold text-gray-900 mt-1">
                    {salaryStructure.effective_date
                      ? new Date(salaryStructure.effective_date).toLocaleDateString()
                      : '-'}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Status</span>
                  <p className="mt-1">
                    <Badge color={salaryStructure.is_current ? 'green' : 'gray'}>
                      {salaryStructure.is_current ? 'Active' : 'Inactive'}
                    </Badge>
                  </p>
                </div>
              </div>

              {employee.bank_name && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">
                    Bank Details
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm text-gray-600">Bank Name</span>
                      <p className="text-sm font-medium text-gray-900 mt-1">
                        {employee.bank_name}
                      </p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600">Account Number</span>
                      <p className="text-sm font-medium text-gray-900 mt-1">
                        {employee.bank_account_number || '-'}
                      </p>
                    </div>
                    {employee.bank_branch && (
                      <div className="col-span-2">
                        <span className="text-sm text-gray-600">Branch</span>
                        <p className="text-sm font-medium text-gray-900 mt-1">
                          {employee.bank_branch}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">No salary structure configured</p>
              <Button size="sm">
                <DollarSign className="h-4 w-4 mr-2" />
                Set Up Salary
              </Button>
            </div>
          )}
        </div>
      </Card>

      {activeLoans.length > 0 && (
        <Card>
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Active Loans</h2>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {activeLoans
                .filter((l) => l.status === 'active' || l.status === 'pending')
                .map((loan) => (
                  <div
                    key={loan.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{loan.loan_number}</p>
                      <p className="text-sm text-gray-600">
                        {(loan.loan_type ?? '')
                          .split('_')
                          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                          .join(' ')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">
                        {formatCurrency(Number(loan.remaining_amount ?? 0))}
                      </p>
                      <p className="text-sm text-gray-600">
                        {loan.paid_installments || 0}/{loan.installments} paid
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Contact Information</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-sm text-gray-600">Email</span>
              <p className="text-sm font-medium text-gray-900 mt-1">
                {employee.profiles?.email || '-'}
              </p>
            </div>
            <div>
              <span className="text-sm text-gray-600">Phone</span>
              <p className="text-sm font-medium text-gray-900 mt-1">
                {employee.phone || employee.mobile || '-'}
              </p>
            </div>
            {employee.address && (
              <div className="col-span-2">
                <span className="text-sm text-gray-600">Address</span>
                <p className="text-sm font-medium text-gray-900 mt-1">{employee.address}</p>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};

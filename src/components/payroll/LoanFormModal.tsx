import React, { useState, useEffect } from 'react';
import { TrendingUp } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { payrollService } from '../../lib/payrollService';
import { payrollKeys } from '../../lib/queryKeys';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SearchableSelect } from '../ui/SearchableSelect';
import { useCurrency } from '../../hooks/useCurrency';
import { useToast } from '../../hooks/useToast';
import type { Database } from '../../types/database.types';

type Employee = Database['public']['Tables']['employees']['Row'];

interface LoanFormModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LoanFormModal: React.FC<LoanFormModalProps> = ({ isOpen, onClose }) => {
  const { formatCurrency } = useCurrency();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    employee_id: '',
    loan_type: 'salary_advance',
    principal_amount: '',
    interest_rate: '0',
    installments_count: '12',
    start_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const [calculatedValues, setCalculatedValues] = useState({
    totalAmount: 0,
    installmentAmount: 0,
    endDate: '',
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, first_name, last_name, employee_number, employment_status')
        .eq('employment_status', 'active')
        .is('deleted_at', null)
        .order('first_name');

      if (error) throw error;
      return data as Employee[];
    },
  });

  const createLoanMutation = useMutation({
    mutationFn: (data: Parameters<typeof payrollService.createEmployeeLoan>[0]) => payrollService.createEmployeeLoan(data),
    onSuccess: (loan) => {
      queryClient.invalidateQueries({ queryKey: payrollKeys.all });
      toast.success(`Loan ${loan.loan_number ?? ''} created successfully`);
      onClose();
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create loan');
    },
  });

  useEffect(() => {
    calculateLoanDetails();
  }, [
    formData.principal_amount,
    formData.interest_rate,
    formData.installments_count,
    formData.start_date,
  ]);

  const calculateLoanDetails = () => {
    const principal = parseFloat(formData.principal_amount) || 0;
    const interestRate = parseFloat(formData.interest_rate) || 0;
    const installments = parseInt(formData.installments_count) || 1;

    const totalAmount = principal * (1 + interestRate / 100);
    const installmentAmount = totalAmount / installments;

    const startDate = new Date(formData.start_date);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + installments);

    setCalculatedValues({
      totalAmount,
      installmentAmount,
      endDate: endDate.toISOString().split('T')[0],
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.employee_id) {
      toast.error('Please select an employee');
      return;
    }

    if (!formData.principal_amount || parseFloat(formData.principal_amount) <= 0) {
      toast.error('Please enter a valid principal amount');
      return;
    }

    if (parseInt(formData.installments_count) < 1) {
      toast.error('Number of installments must be at least 1');
      return;
    }

    const principal = parseFloat(formData.principal_amount);
    const loanData = {
      tenant_id: '' as string,
      employee_id: formData.employee_id,
      loan_type: formData.loan_type,
      amount: principal,
      interest_rate: parseFloat(formData.interest_rate) || 0,
      total_amount: calculatedValues.totalAmount,
      installment_amount: calculatedValues.installmentAmount,
      installments: parseInt(formData.installments_count),
      paid_installments: 0,
      remaining_amount: calculatedValues.totalAmount,
      start_date: formData.start_date,
      end_date: calculatedValues.endDate,
      status: 'pending',
      notes: formData.notes || null,
    };

    createLoanMutation.mutate(loanData);
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Loan">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2">
            <SearchableSelect
              label="Employee"
              required
              options={employees.map((emp) => ({
                id: emp.id,
                name: `${emp.first_name} ${emp.last_name}${emp.employee_number ? ` (${emp.employee_number})` : ''}`,
              }))}
              value={formData.employee_id}
              onChange={(value) => handleChange('employee_id', value)}
              placeholder="Select employee"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Loan Type <span className="text-danger">*</span>
            </label>
            <select
              value={formData.loan_type}
              onChange={(e) => handleChange('loan_type', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              required
            >
              <option value="salary_advance">Salary Advance</option>
              <option value="personal_loan">Personal Loan</option>
              <option value="emergency_loan">Emergency Loan</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Principal Amount <span className="text-danger">*</span>
            </label>
            <Input
              type="number"
              step="0.001"
              min="0"
              value={formData.principal_amount}
              onChange={(e) => handleChange('principal_amount', e.target.value)}
              placeholder="0.000"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Interest Rate (%)
            </label>
            <Input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={formData.interest_rate}
              onChange={(e) => handleChange('interest_rate', e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Number of Installments <span className="text-danger">*</span>
            </label>
            <Input
              type="number"
              min="1"
              value={formData.installments_count}
              onChange={(e) => handleChange('installments_count', e.target.value)}
              placeholder="12"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Start Date <span className="text-danger">*</span>
            </label>
            <Input
              type="date"
              value={formData.start_date}
              onChange={(e) => handleChange('start_date', e.target.value)}
              required
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Additional notes or comments..."
            />
          </div>
        </div>

        {formData.principal_amount && parseFloat(formData.principal_amount) > 0 && (
          <div className="bg-info-muted border border-info/30 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-info mb-3 flex items-center">
              <TrendingUp className="h-4 w-4 mr-2" />
              Loan Summary
            </h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-info">Total Amount:</span>
                <div className="font-semibold text-info mt-1">
                  {formatCurrency(calculatedValues.totalAmount)}
                </div>
              </div>
              <div>
                <span className="text-info">Monthly Installment:</span>
                <div className="font-semibold text-info mt-1">
                  {formatCurrency(calculatedValues.installmentAmount)}
                </div>
              </div>
              <div>
                <span className="text-info">Start Date:</span>
                <div className="font-semibold text-info mt-1">
                  {new Date(formData.start_date).toLocaleDateString()}
                </div>
              </div>
              <div>
                <span className="text-info">Estimated End Date:</span>
                <div className="font-semibold text-info mt-1">
                  {calculatedValues.endDate
                    ? new Date(calculatedValues.endDate).toLocaleDateString()
                    : '-'}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end space-x-3 pt-6 border-t">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={createLoanMutation.isPending}>
            {createLoanMutation.isPending ? 'Creating...' : 'Create Loan'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

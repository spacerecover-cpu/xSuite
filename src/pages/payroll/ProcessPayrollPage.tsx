import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Users, DollarSign, Check } from 'lucide-react';
import { payrollService } from '../../lib/payrollService';
import { payrollKeys } from '../../lib/queryKeys';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/shared/PageHeader';
import { useToast } from '../../hooks/useToast';
import { format, addDays, startOfMonth, endOfMonth } from 'date-fns';

export default function ProcessPayrollPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [periodName, setPeriodName] = useState(`Payroll - ${format(new Date(), 'MMMM yyyy')}`);
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [paymentDate, setPaymentDate] = useState(format(addDays(endOfMonth(new Date()), 3), 'yyyy-MM-dd'));
  const [createdPeriodId, setCreatedPeriodId] = useState<string | null>(null);

  const createPeriodMutation = useMutation({
    mutationFn: (data: Parameters<typeof payrollService.createPayrollPeriod>[0]) => payrollService.createPayrollPeriod(data),
    onSuccess: (period) => {
      setCreatedPeriodId(period.id);
      setStep(2);
      queryClient.invalidateQueries({ queryKey: payrollKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create payroll period');
    },
  });

  const processPayrollMutation = useMutation({
    mutationFn: (periodId: string) => payrollService.processPayroll(periodId, { includePendingAdjustments: true }),
    onSuccess: (result) => {
      toast.success(
        `Payroll processed successfully! ${result.recordsCreated} employee records created.`
      );
      queryClient.invalidateQueries({ queryKey: payrollKeys.all });
      if (createdPeriodId) {
        navigate(`/payroll/periods/${createdPeriodId}`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to process payroll');
    },
  });

  const handleCreatePeriod = () => {
    createPeriodMutation.mutate({
      tenant_id: '' as string,
      period_name: periodName,
      period_type: 'monthly',
      start_date: startDate,
      end_date: endDate,
      payment_date: paymentDate,
      status: 'draft',
    });
  };

  const handleProcessPayroll = () => {
    if (createdPeriodId) {
      processPayrollMutation.mutate(createdPeriodId);
    }
  };

  return (
    <div className="p-8 max-w-[1200px] mx-auto">
      <PageHeader
        title="Process Payroll"
        description="Create and process payroll for employees"
        icon={DollarSign}
      />

      <div className="mb-8 flex items-center">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                step >= s
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {step > s ? <Check className="w-5 h-5" /> : s}
            </div>
            {s < 3 && (
              <div
                className={`w-32 h-1 mx-2 ${
                  step > s ? 'bg-primary' : 'bg-slate-200'
                }`}
              ></div>
            )}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
        {step === 1 && (
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Step 1: Create Payroll Period</h2>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Period Name
                </label>
                <input
                  type="text"
                  value={periodName}
                  onChange={(e) => setPeriodName(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="e.g., Payroll - March 2026"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Payment Date
                  </label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="pt-6 flex justify-end gap-3">
                <Button variant="secondary" onClick={() => navigate('/payroll')}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreatePeriod}
                  disabled={createPeriodMutation.isPending}
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  {createPeriodMutation.isPending ? 'Creating...' : 'Create Period'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Step 2: Process Payroll</h2>
            <div className="bg-info-muted border border-info/30 rounded-lg p-6 mb-6">
              <div className="flex items-center gap-3 mb-4">
                <Users className="w-6 h-6 text-info" />
                <div>
                  <h3 className="font-semibold text-info">Ready to Process</h3>
                  <p className="text-sm text-info">
                    This will calculate payroll for all active employees for the period {periodName}
                  </p>
                </div>
              </div>
              <p className="text-sm text-info">
                The system will:
              </p>
              <ul className="text-sm text-info list-disc list-inside mt-2 space-y-1">
                <li>Fetch attendance data for all employees</li>
                <li>Calculate base salary, overtime, and allowances</li>
                <li>Apply deductions (social security, loans, etc.)</li>
                <li>Include any pending adjustments</li>
                <li>Generate individual payroll records</li>
              </ul>
            </div>

            <div className="pt-6 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => navigate('/payroll')}>
                Cancel
              </Button>
              <Button
                onClick={handleProcessPayroll}
                disabled={processPayrollMutation.isPending}
              >
                <DollarSign className="w-4 h-4 mr-2" />
                {processPayrollMutation.isPending ? 'Processing...' : 'Process Payroll'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

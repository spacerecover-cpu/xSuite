import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Download, Search, DollarSign, Users, TrendingDown, TrendingUp, FileText } from 'lucide-react';
import { payrollService } from '../../lib/payrollService';
import { payrollKeys } from '../../lib/queryKeys';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { statusToBadgeVariant } from '../../lib/ui/variants';
import { StatsCard } from '../../components/ui/StatsCard';
import { useToast } from '../../hooks/useToast';
import { useCurrency } from '../../hooks/useCurrency';
import { format } from 'date-fns';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { generatePayslip } from '../../lib/pdf/pdfService';

type RecordRow = Awaited<ReturnType<typeof payrollService.getPayrollRecords>>[number];

const getEmployeeName = (record: RecordRow): string => {
  const employee = record.employee;
  if (!employee) return '';
  const first = employee.first_name ?? '';
  const last = employee.last_name ?? '';
  return `${first} ${last}`.trim();
};

const getEmployeeNumber = (record: RecordRow): string => record.employee?.employee_number ?? '';

const getDepartmentName = (_record: RecordRow): string => '';

export default function PayrollPeriodDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { formatCurrency } = useCurrency();
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showPayDialog, setShowPayDialog] = useState(false);

  const { data: period, isLoading: periodLoading } = useQuery({
    queryKey: payrollKeys.period(id!),
    queryFn: () => payrollService.getPayrollPeriod(id!),
    enabled: !!id,
  });

  const { data: records = [], isLoading: recordsLoading } = useQuery({
    queryKey: payrollKeys.records(id!),
    queryFn: () => payrollService.getPayrollRecords(id!),
    enabled: !!id,
  });

  const approveMutation = useMutation({
    mutationFn: () => payrollService.approvePayrollPeriod(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: payrollKeys.period(id!) });
      toast.success('Payroll period approved successfully');
      setShowApproveDialog(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to approve payroll period');
    },
  });

  const markAsPaidMutation = useMutation({
    mutationFn: () => payrollService.markPayrollPeriodAsPaid(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: payrollKeys.period(id!) });
      toast.success('Payroll period marked as paid');
      setShowPayDialog(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to mark payroll as paid');
    },
  });

  const handleExportBankFile = async () => {
    try {
      const bankFile = await payrollService.generateBankFile(id!, 'WPS');
      if (!bankFile) {
        toast.error('Failed to generate bank file');
        return;
      }
      const fileContent = payrollService.generateWPSFileContent(records);
      const blob = new Blob([fileContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safePeriodName = (period?.period_name ?? 'payroll').replace(/\s/g, '_');
      a.download = `${safePeriodName}_${bankFile.file_name || bankFile.id}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Bank file generated successfully');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate bank file');
    }
  };

  const handleDownloadPayslip = async (recordId: string) => {
    try {
      const result = await generatePayslip(recordId);
      if (result.success) {
        toast.success('Payslip downloaded successfully');
      } else {
        toast.error(result.error || 'Failed to download payslip');
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to download payslip');
    }
  };

  const handleDownloadAllPayslips = async () => {
    try {
      toast.info('Generating payslips...');
      for (const record of records) {
        await handleDownloadPayslip(record.id);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      toast.success('All payslips downloaded successfully');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to download payslips');
    }
  };

  const filteredRecords = records.filter((record) => {
    const query = searchTerm.toLowerCase();
    return (
      getEmployeeName(record).toLowerCase().includes(query) ||
      getEmployeeNumber(record).toLowerCase().includes(query) ||
      getDepartmentName(record).toLowerCase().includes(query)
    );
  });

  if (periodLoading || recordsLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-1/4"></div>
          <div className="h-64 bg-slate-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!period) {
    return (
      <div className="p-8">
        <div className="text-center">
          <p className="text-slate-600">Payroll period not found</p>
          <Button onClick={() => navigate('/payroll')} className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const canApprove = period.status === 'processing';
  const canMarkAsPaid = period.status === 'approved';

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/payroll')}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{period.period_name}</h1>
            <p className="text-sm text-slate-600">
              {format(new Date(period.start_date), 'MMM dd, yyyy')} -{' '}
              {format(new Date(period.end_date), 'MMM dd, yyyy')}
            </p>
          </div>
          <Badge variant={statusToBadgeVariant(period.status ?? '')}>{(period.status ?? '').toUpperCase()}</Badge>
        </div>
        <div className="flex items-center gap-3">
          {canApprove && (
            <Button onClick={() => setShowApproveDialog(true)} variant="primary">
              <Check className="w-4 h-4 mr-2" />
              Approve Payroll
            </Button>
          )}
          {canMarkAsPaid && (
            <Button onClick={() => setShowPayDialog(true)}>
              <Check className="w-4 h-4 mr-2" />
              Mark as Paid
            </Button>
          )}
          {(period.status === 'approved' || period.status === 'paid') && (
            <>
              <Button onClick={handleExportBankFile} variant="secondary">
                <Download className="w-4 h-4 mr-2" />
                Export Bank File
              </Button>
              <Button onClick={handleDownloadAllPayslips} variant="secondary">
                <FileText className="w-4 h-4 mr-2" />
                Download All Payslips
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <StatsCard
          title="Total Employees"
          value={period.employee_count?.toString() || '0'}
          icon={Users}
        />
        <StatsCard
          title="Gross Earnings"
          value={formatCurrency(period.total_gross || 0)}
          icon={TrendingUp}
        />
        <StatsCard
          title="Total Deductions"
          value={formatCurrency(period.total_deductions || 0)}
          icon={TrendingDown}
        />
        <StatsCard
          title="Net Payroll"
          value={formatCurrency(period.total_net || 0)}
          icon={DollarSign}
        />
      </div>

      {period.payment_date && (
        <div className="mb-6 bg-info-muted border border-info/30 rounded-xl p-4">
          <p className="text-sm text-info">
            <strong>Payment Date:</strong> {format(new Date(period.payment_date), 'MMMM dd, yyyy')}
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Employee Payroll Records</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search employees..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Employee
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Department
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Hours / Days
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Base Salary
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Gross
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Deductions
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Net Salary
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-500">
                    {searchTerm ? 'No employees found matching your search' : 'No payroll records found'}
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record) => (
                  <tr
                    key={record.id}
                    className="hover:bg-slate-50 cursor-pointer"
                    onClick={() =>
                      setExpandedRecordId(expandedRecordId === record.id ? null : record.id)
                    }
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-900">
                          {getEmployeeName(record)}
                        </span>
                        <span className="text-xs text-slate-500">{getEmployeeNumber(record)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700">{getDepartmentName(record)}</td>
                    <td className="px-6 py-4 text-sm text-slate-700">
                      {record.hours_worked ?? 0} / {record.working_days ?? 0}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-slate-900">
                      {formatCurrency(record.basic_salary || 0)}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium text-success">
                      {formatCurrency(record.total_earnings || 0)}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium text-danger">
                      {formatCurrency(record.total_deductions || 0)}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-slate-900">
                      {formatCurrency(record.net_salary || 0)}
                    </td>
                    <td className="px-6 py-4">
                      <Badge
                        variant={
                          record.status === 'paid'
                            ? 'success'
                            : record.status === 'approved'
                            ? 'success'
                            : 'secondary'
                        }
                      >
                        {record.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadPayslip(record.id);
                        }}
                      >
                        <FileText className="w-4 h-4 mr-1" />
                        Payslip
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showApproveDialog && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setShowApproveDialog(false)}
          onConfirm={() => approveMutation.mutate()}
          title="Approve Payroll Period"
          message={`Are you sure you want to approve the payroll for ${period.period_name}? This action will finalize all calculations.`}
          confirmText="Approve"
          variant="info"
        />
      )}

      {showPayDialog && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setShowPayDialog(false)}
          onConfirm={() => markAsPaidMutation.mutate()}
          title="Mark as Paid"
          message={`Are you sure you want to mark the payroll for ${period.period_name} as paid? This should only be done after payments have been processed.`}
          confirmText="Mark as Paid"
          variant="info"
        />
      )}
    </div>
  );
}

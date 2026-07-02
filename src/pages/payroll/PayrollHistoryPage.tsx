import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Calendar, DollarSign, Users, Eye } from 'lucide-react';
import { payrollService } from '../../lib/payrollService';
import { payrollKeys } from '../../lib/queryKeys';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { PageHeaderSlot } from '../../components/layout/PageHeaderSlot';
import { useCurrency } from '../../hooks/useCurrency';
import { format } from 'date-fns';

export default function PayrollHistoryPage() {
  const { formatCurrency } = useCurrency();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: periods, isLoading } = useQuery({
    queryKey: payrollKeys.periods({ year: selectedYear }),
    queryFn: () => payrollService.getPayrollPeriods({ year: selectedYear }),
  });

  const filteredPeriods = periods?.filter(p =>
    statusFilter === 'all' || p.status === statusFilter
  );

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="p-8 max-w-[1800px] mx-auto">
      <PageHeaderSlot
        title="Payroll History"
        actions={
          <Link to="/payroll/process">
            <Button>
              <Calendar className="w-4 h-4 mr-2" />
              Process New Payroll
            </Button>
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-700">Year:</label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {years.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-700">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="processing">Processing</option>
            <option value="approved">Approved</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : filteredPeriods && filteredPeriods.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Period</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Dates</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Employees</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Gross</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Deductions</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Net Payroll</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredPeriods.map((period) => (
                  <tr key={period.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-slate-900">{period.period_name}</div>
                      <div className="text-xs text-slate-500">{period.period_type}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-slate-600">
                        {format(new Date(period.start_date), 'MMM d, yyyy')}
                      </div>
                      <div className="text-xs text-slate-500">
                        to {format(new Date(period.end_date), 'MMM d, yyyy')}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1 text-sm text-slate-600">
                        <Users className="w-4 h-4" />
                        {period.employee_count}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-slate-900 tabular-nums">
                      {formatCurrency(period.total_gross ?? 0)}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {formatCurrency(period.total_deductions ?? 0)}
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-slate-900 tabular-nums">
                      {formatCurrency(period.total_net ?? 0)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                        period.status === 'paid'
                          ? 'bg-success-muted text-success'
                          : period.status === 'approved'
                          ? 'bg-info-muted text-info'
                          : period.status === 'processing'
                          ? 'bg-warning-muted text-warning'
                          : period.status === 'cancelled'
                          ? 'bg-danger-muted text-danger'
                          : 'bg-slate-100 text-slate-800'
                      }`}>
                        {period.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link to={`/payroll/periods/${period.id}`}>
                        <Button variant="secondary" size="sm">
                          <Eye className="w-4 h-4 mr-2" />
                          View
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <DollarSign className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No Payroll Periods Found</h3>
            <p className="text-slate-600 mb-6">
              {statusFilter !== 'all'
                ? `No periods with status "${statusFilter}" for ${selectedYear}`
                : `No payroll periods created for ${selectedYear}`}
            </p>
            <Link to="/payroll/process">
              <Button>
                <Calendar className="w-4 h-4 mr-2" />
                Create Payroll Period
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

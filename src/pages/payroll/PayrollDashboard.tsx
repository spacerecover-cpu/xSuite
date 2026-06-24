import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { DollarSign, Users, Calendar, CheckCircle, TrendingUp, AlertCircle, Plus, History, Settings as SettingsIcon } from 'lucide-react';
import { payrollService } from '../../lib/payrollService';
import { payrollKeys } from '../../lib/queryKeys';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/shared/StatCard';
import { useCurrency } from '../../hooks/useCurrency';
import { format } from 'date-fns';

export const PayrollDashboard = () => {
  const { formatCurrency } = useCurrency();

  const { data: stats, isLoading } = useQuery({
    queryKey: payrollKeys.dashboardStats(),
    queryFn: () => payrollService.getDashboardStats(),
  });

  const { data: currentPeriod } = useQuery({
    queryKey: payrollKeys.currentPeriod(),
    queryFn: () => payrollService.getCurrentPayrollPeriod(),
  });

  const { data: recentPeriods } = useQuery({
    queryKey: payrollKeys.periods({}),
    queryFn: () => payrollService.getPayrollPeriods({ year: new Date().getFullYear() }),
  });

  const { data: pendingAdjustments } = useQuery({
    queryKey: payrollKeys.pendingAdjustments(),
    queryFn: () => payrollService.getPendingAdjustments(),
  });

  const currentMonth = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div className="p-8 max-w-[1800px] mx-auto">
      <div className="mb-8 flex items-start justify-between">
        <div className="flex items-start gap-6">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg bg-primary shadow-primary/40">
            <DollarSign className="w-7 h-7 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 mb-2">Payroll Management</h1>
            <p className="text-slate-600 text-base">
              Process and manage employee compensation for {currentMonth}
            </p>
            {currentPeriod && (
              <div className="flex gap-4 mt-3">
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 rounded-full bg-success"></div>
                  <span className="text-slate-600">
                    Current Period: {format(new Date(currentPeriod.start_date), 'MMM d')} - {format(new Date(currentPeriod.end_date), 'MMM d, yyyy')}
                  </span>
                </div>
                {currentPeriod.payment_date && (
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 rounded-full bg-info"></div>
                    <span className="text-slate-600">Payment: {format(new Date(currentPeriod.payment_date), 'MMM d, yyyy')}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Link to="/payroll/history">
            <Button variant="secondary">
              <History className="w-4 h-4 mr-2" />
              History
            </Button>
          </Link>
          <Link to="/payroll/process">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Process Payroll
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Payroll"
          value={isLoading ? '...' : formatCurrency(stats?.totalPayroll || 0)}
          icon={DollarSign}
          sub={stats?.totalPayroll ? '+0%' : undefined}
          tone="primary"
        />

        <StatCard
          label="Active Employees"
          value={isLoading ? '...' : stats?.employeeCount.toString() || '0'}
          icon={Users}
          tone="info"
        />

        <StatCard
          label="Pending Approvals"
          value={isLoading ? '...' : stats?.pendingApprovals.toString() || '0'}
          icon={AlertCircle}
          tone="warning"
        />

        <StatCard
          label="Processed This Month"
          value={isLoading ? '...' : stats?.processedThisMonth.toString() || '0'}
          icon={CheckCircle}
          tone="success"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden lg:col-span-2">
          <div className="p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Link to="/payroll/process" className="block">
                <Button className="w-full justify-start h-auto py-4" variant="secondary">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-info-muted rounded-lg flex items-center justify-center flex-shrink-0">
                      <Calendar className="w-5 h-5 text-info" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-slate-900">Process Monthly Payroll</div>
                      <div className="text-xs text-slate-500 mt-1">Calculate and approve payroll for all employees</div>
                    </div>
                  </div>
                </Button>
              </Link>

              <Link to="/payroll/adjustments" className="block">
                <Button className="w-full justify-start h-auto py-4" variant="secondary">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-success-muted rounded-lg flex items-center justify-center flex-shrink-0">
                      <TrendingUp className="w-5 h-5 text-success" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-slate-900">Manage Adjustments</div>
                      <div className="text-xs text-slate-500 mt-1">
                        {pendingAdjustments && pendingAdjustments.length > 0
                          ? `${pendingAdjustments.length} pending approval`
                          : 'Add bonuses, deductions, and reimbursements'}
                      </div>
                    </div>
                  </div>
                </Button>
              </Link>

              <Link to="/payroll/loans" className="block">
                <Button className="w-full justify-start h-auto py-4" variant="secondary">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-warning-muted rounded-lg flex items-center justify-center flex-shrink-0">
                      <DollarSign className="w-5 h-5 text-warning" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-slate-900">Employee Loans</div>
                      <div className="text-xs text-slate-500 mt-1">Manage salary advances and loans</div>
                    </div>
                  </div>
                </Button>
              </Link>

              <Link to="/payroll/settings" className="block">
                <Button className="w-full justify-start h-auto py-4" variant="secondary">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <SettingsIcon className="w-5 h-5 text-slate-600" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-slate-900">Payroll Settings</div>
                      <div className="text-xs text-slate-500 mt-1">Configure working days and rates</div>
                    </div>
                  </div>
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Summary</h2>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm text-slate-600">Average Salary</span>
                  <span className="text-lg font-semibold text-slate-900">
                    {isLoading ? '...' : formatCurrency(stats?.avgSalary || 0)}
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: '65%' }}></div>
                </div>
              </div>

              {stats?.upcomingPaymentDate && (
                <div className="bg-info-muted border border-info/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-info text-sm font-medium mb-1">
                    <Calendar className="w-4 h-4" />
                    Upcoming Payment
                  </div>
                  <div className="text-info text-xs">
                    {format(new Date(stats.upcomingPaymentDate), 'EEEE, MMMM d, yyyy')}
                  </div>
                </div>
              )}

              {currentPeriod && (
                <div className={`border rounded-lg p-3 ${
                  currentPeriod.status === 'paid'
                    ? 'bg-success-muted border-success/30'
                    : currentPeriod.status === 'approved'
                    ? 'bg-info-muted border-info/30'
                    : 'bg-warning-muted border-warning/30'
                }`}>
                  <div className={`text-sm font-medium mb-1 capitalize ${
                    currentPeriod.status === 'paid' ? 'text-success' : currentPeriod.status === 'approved' ? 'text-info' : 'text-warning'
                  }`}>
                    Current Period Status
                  </div>
                  <div className={`text-xs capitalize ${
                    currentPeriod.status === 'paid' ? 'text-success' : currentPeriod.status === 'approved' ? 'text-info' : 'text-warning'
                  }`}>
                    {currentPeriod.status}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-slate-900">Recent Payroll Periods</h2>
            <Link to="/payroll/history">
              <Button variant="secondary" size="sm">View All</Button>
            </Link>
          </div>

          {recentPeriods && recentPeriods.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-y border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Period</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Dates</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Employees</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Total Payroll</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-600 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {recentPeriods.slice(0, 5).map((period) => (
                    <tr key={period.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">{period.period_name}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {format(new Date(period.start_date), 'MMM d')} - {format(new Date(period.end_date), 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{period.employee_count}</td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">{formatCurrency(period.total_net ?? 0)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                          period.status === 'paid'
                            ? 'bg-success-muted text-success'
                            : period.status === 'approved'
                            ? 'bg-info-muted text-info'
                            : period.status === 'processing'
                            ? 'bg-warning-muted text-warning'
                            : 'bg-slate-100 text-slate-800'
                        }`}>
                          {period.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link to={`/payroll/periods/${period.id}`}>
                          <Button variant="secondary" size="sm">View</Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 mb-4">No payroll periods yet</p>
              <Link to="/payroll/process">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Create First Payroll Period
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

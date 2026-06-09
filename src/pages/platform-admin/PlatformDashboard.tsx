import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Users, DollarSign, TrendingUp, Ticket, AlertTriangle } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getDashboardStats, getMRRTrend, getPlanDistribution, getAtRiskTenants } from '../../lib/platformAdminService';
import { platformAdminKeys } from '../../lib/queryKeys';
import { StatsCard } from '../../components/ui/StatsCard';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { chartAxis, chartCategorical, chartGrid } from '../../lib/chartTheme';

export const PlatformDashboard: React.FC = () => {
  const navigate = useNavigate();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: platformAdminKeys.dashboardStats(),
    queryFn: getDashboardStats,
    refetchInterval: 60000,
  });

  const { data: mrrTrend } = useQuery({
    queryKey: platformAdminKeys.mrrTrend(30),
    queryFn: () => getMRRTrend(30),
  });

  const { data: planDistribution } = useQuery({
    queryKey: platformAdminKeys.planDistribution(),
    queryFn: getPlanDistribution,
  });

  const { data: atRiskTenants } = useQuery({
    queryKey: platformAdminKeys.atRiskTenants(5),
    queryFn: () => getAtRiskTenants(5),
  });

  if (statsLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Platform Overview</h1>
        <p className="text-slate-600 mt-2">Monitor all tenants, revenue, and platform health</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div onClick={() => navigate('/platform-admin/tenants')} className="cursor-pointer">
          <StatsCard
            title="Total Tenants"
            value={String(stats?.totalTenants ?? 0)}
            icon={Users}
            color="blue"
          />
        </div>
        <StatsCard
          title="Active Tenants"
          value={String(stats?.activeTenants ?? 0)}
          icon={Users}
          color="green"
        />
        <StatsCard
          title="Monthly Recurring Revenue"
          value={formatCurrency(stats?.mrr || 0)}
          icon={DollarSign}
          color="green"
        />
        <StatsCard
          title="Annual Recurring Revenue"
          value={formatCurrency(stats?.arr || 0)}
          icon={TrendingUp}
          color="blue"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Total Users"
          value={String(stats?.totalUsers ?? 0)}
          icon={Users}
        />
        <StatsCard
          title="Active Users Today"
          value={String(stats?.activeUsersToday ?? 0)}
          icon={Users}
          color="green"
        />
        <StatsCard
          title="Trial Tenants"
          value={String(stats?.trialTenants ?? 0)}
          icon={Users}
          color="orange"
        />
        <div onClick={() => navigate('/platform-admin/tickets')} className="cursor-pointer">
          <StatsCard
            title="Open Support Tickets"
            value={String(stats?.openTickets ?? 0)}
            icon={Ticket}
            color="purple"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">MRR Trend (Last 30 Days)</h3>
          {mrrTrend && mrrTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={mrrTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                <XAxis
                  dataKey="date"
                  stroke={chartAxis}
                  fontSize={12}
                  tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                />
                <YAxis stroke={chartAxis} fontSize={12} tickFormatter={(value) => `$${value / 1000}k`} />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  labelFormatter={(label) => new Date(label).toLocaleDateString()}
                />
                <Line type="monotone" dataKey="mrr" stroke={chartCategorical[0]} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-300 flex items-center justify-center text-slate-500">
              No data available
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Active Subscriptions by Plan</h3>
          {planDistribution && planDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={planDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                <XAxis dataKey="plan" stroke={chartAxis} fontSize={12} />
                <YAxis stroke={chartAxis} fontSize={12} />
                <Tooltip />
                <Bar dataKey="count" fill={chartCategorical[0]} radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-300 flex items-center justify-center text-slate-500">
              No data available
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">At-Risk Tenants</h3>
              <p className="text-sm text-slate-600 mt-1">Tenants with high churn risk requiring attention</p>
            </div>
            <button
              onClick={() => navigate('/platform-admin/tenants?risk=high')}
              className="px-4 py-2 text-sm font-medium text-primary hover:bg-info-muted rounded-lg transition-colors"
            >
              View All
            </button>
          </div>
        </div>

        {atRiskTenants && atRiskTenants.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Tenant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Health Score
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Churn Risk
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Engagement
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Days Since Login
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {atRiskTenants.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-slate-900">{tenant.name}</p>
                        <p className="text-sm text-slate-600">{tenant.slug}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden max-w-24">
                          <div
                            className={`h-full ${
                              (tenant.health?.health_score || 0) >= 70
                                ? 'bg-success'
                                : (tenant.health?.health_score || 0) >= 50
                                ? 'bg-warning'
                                : 'bg-danger'
                            }`}
                            style={{ width: `${tenant.health?.health_score || 0}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-slate-700">
                          {tenant.health?.health_score || 0}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge
                        variant={
                          tenant.health?.churn_risk === 'critical'
                            ? 'danger'
                            : tenant.health?.churn_risk === 'high'
                            ? 'warning'
                            : 'default'
                        }
                      >
                        {tenant.health?.churn_risk || 'unknown'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={tenant.health?.engagement_level === 'inactive' ? 'danger' : 'default'}>
                        {tenant.health?.engagement_level || 'unknown'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-700">
                        {tenant.health?.days_since_last_login || 0} days
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => navigate(`/platform-admin/tenants/${tenant.id}`)}
                        className="text-sm font-medium text-primary hover:text-primary/90"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <AlertTriangle className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600">No at-risk tenants at this time</p>
          </div>
        )}
      </div>
    </div>
  );
};

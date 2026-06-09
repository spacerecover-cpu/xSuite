import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Filter, Users } from 'lucide-react';
import { getTenantsList, suspendTenant, reactivateTenant } from '../../lib/platformAdminService';
import { platformAdminKeys } from '../../lib/queryKeys';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../hooks/useToast';

export const TenantsListPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();

  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [planFilter, setPlanFilter] = useState(searchParams.get('plan') || '');
  const [riskFilter, setRiskFilter] = useState(searchParams.get('risk') || '');

  const filters = {
    status: statusFilter || undefined,
    plan: planFilter || undefined,
    search: search || undefined,
    churnRisk: riskFilter || undefined,
  };

  const { data: tenants, isLoading } = useQuery({
    queryKey: platformAdminKeys.tenantsList(filters),
    queryFn: () => getTenantsList(filters),
  });

  const suspendMutation = useMutation({
    mutationFn: suspendTenant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.tenantsList() });
      toast.success('Tenant suspended successfully');
    },
    onError: () => {
      toast.error('Failed to suspend tenant');
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: reactivateTenant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.tenantsList() });
      toast.success('Tenant reactivated successfully');
    },
    onError: () => {
      toast.error('Failed to reactivate tenant');
    },
  });

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);
    if (planFilter) params.set('plan', planFilter);
    if (riskFilter) params.set('risk', riskFilter);
    setSearchParams(params);
  };

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setPlanFilter('');
    setRiskFilter('');
    setSearchParams({});
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Tenants</h1>
          <p className="text-slate-600 mt-2">Manage all tenant accounts</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <Input
              placeholder="Search by company name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              leftIcon={<Search className="w-4 h-4" />}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="pending">Pending</option>
          </select>

          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
          >
            <option value="">All Plans</option>
            <option value="trial">Trial</option>
            <option value="starter">Starter</option>
            <option value="professional">Professional</option>
            <option value="enterprise">Enterprise</option>
          </select>

          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
          >
            <option value="">All Risk Levels</option>
            <option value="low">Low Risk</option>
            <option value="medium">Medium Risk</option>
            <option value="high">High Risk</option>
            <option value="critical">Critical Risk</option>
          </select>

          <div className="flex gap-2">
            <button
              onClick={handleSearch}
              className="px-6 py-2 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Filter className="w-5 h-5" />
            </button>
            {(search || statusFilter || planFilter || riskFilter) && (
              <button
                onClick={clearFilters}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : tenants && tenants.length > 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Company
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Plan
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Users
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Health Score
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Churn Risk
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {tenants.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-slate-900">{tenant.name}</p>
                        <p className="text-sm text-slate-600">{tenant.slug}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant="default">
                        {tenant.subscription?.plan_id || 'No Plan'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <Badge
                        variant={
                          tenant.subscription?.status === 'active'
                            ? 'success'
                            : tenant.subscription?.status === 'trialing'
                            ? 'warning'
                            : 'default'
                        }
                      >
                        {tenant.subscription?.status || tenant.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-700">{tenant.userCount || 0}</span>
                    </td>
                    <td className="px-6 py-4">
                      {tenant.health ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden max-w-20">
                            <div
                              className={`h-full ${
                                (tenant.health.health_score ?? 0) >= 70
                                  ? 'bg-success'
                                  : (tenant.health.health_score ?? 0) >= 50
                                  ? 'bg-warning'
                                  : 'bg-danger'
                              }`}
                              style={{ width: `${tenant.health.health_score ?? 0}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium text-slate-700">
                            {tenant.health.health_score ?? 0}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">N/A</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {tenant.health?.churn_risk ? (
                        <Badge
                          variant={
                            tenant.health.churn_risk === 'critical' || tenant.health.churn_risk === 'high'
                              ? 'danger'
                              : tenant.health.churn_risk === 'medium'
                              ? 'warning'
                              : 'success'
                          }
                        >
                          {tenant.health.churn_risk}
                        </Badge>
                      ) : (
                        <span className="text-sm text-slate-400">N/A</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => navigate(`/platform-admin/tenants/${tenant.id}`)}
                          className="text-sm font-medium text-primary hover:text-primary/90"
                        >
                          View
                        </button>
                        {tenant.status === 'active' ? (
                          <button
                            onClick={() => suspendMutation.mutate(tenant.id)}
                            disabled={suspendMutation.isPending}
                            className="text-sm font-medium text-danger hover:text-danger/90 disabled:opacity-50"
                          >
                            Suspend
                          </button>
                        ) : (
                          <button
                            onClick={() => reactivateMutation.mutate(tenant.id)}
                            disabled={reactivateMutation.isPending}
                            className="text-sm font-medium text-success hover:text-success/90 disabled:opacity-50"
                          >
                            Reactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <Users className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No tenants found</h3>
          <p className="text-slate-600">
            {search || statusFilter || planFilter || riskFilter
              ? 'Try adjusting your filters'
              : 'No tenants have been created yet'}
          </p>
        </div>
      )}
    </div>
  );
};

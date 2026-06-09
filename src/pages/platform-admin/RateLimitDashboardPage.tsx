import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Gauge, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Skeleton } from '../../components/ui/Skeleton';

interface TenantRateLimit {
  id: string;
  tenant_id: string;
  resource_type: string;
  max_requests: number;
  current_count: number;
  window_seconds: number;
  window_start: string;
  tenant_name?: string;
}

export const RateLimitDashboardPage: React.FC = () => {
  const { data: limits = [], isLoading } = useQuery({
    queryKey: ['platform-admin', 'rate-limits'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_rate_limits')
        .select('*, tenants(name)')
        .is('deleted_at', null)
        .order('current_count', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []).map((d: Record<string, unknown>) => ({
        ...d,
        tenant_name: (d.tenants as { name: string } | null)?.name ?? 'Unknown',
      })) as TenantRateLimit[];
    },
    refetchInterval: 30000,
  });

  const getUsagePercent = (current: number, max: number) => {
    if (max === 0) return 0;
    return Math.min(100, Math.round((current / max) * 100));
  };

  const getUsageColor = (percent: number) => {
    if (percent >= 90) return 'text-danger bg-danger-muted';
    if (percent >= 70) return 'text-warning bg-warning-muted';
    return 'text-success bg-success-muted';
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Gauge className="w-6 h-6 text-primary" />
          Rate Limit Dashboard
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Monitor API rate limit usage across tenants (refreshes every 30s)
        </p>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : limits.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-success/60" />
          <p className="text-slate-500">No rate limit activity recorded</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left font-medium text-slate-600">Tenant</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Resource</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Usage</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Window</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {limits.map(limit => {
                const percent = getUsagePercent(limit.current_count, limit.max_requests);
                const colorClass = getUsageColor(percent);
                return (
                  <tr key={limit.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{limit.tenant_name}</td>
                    <td className="px-4 py-3 font-mono text-xs">{limit.resource_type}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${percent >= 90 ? 'bg-danger' : percent >= 70 ? 'bg-warning' : 'bg-success'}`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500">
                          {limit.current_count}/{limit.max_requests}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {limit.window_seconds >= 86400 ? `${Math.round(limit.window_seconds / 86400)}d` : `${Math.round(limit.window_seconds / 3600)}h`}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${colorClass}`}>
                        {percent >= 90 ? (
                          <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Critical</span>
                        ) : percent >= 70 ? 'Warning' : 'Normal'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

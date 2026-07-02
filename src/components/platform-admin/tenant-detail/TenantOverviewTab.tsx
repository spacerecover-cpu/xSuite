import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mail, Building2, MapPin, CreditCard, Calendar, Activity, Users as UsersIcon, Briefcase, HardDrive, Hash } from 'lucide-react';
import { Card } from '../../ui/Card';
import { Badge } from '../../ui/Badge';
import { getHealthMetricsHistory } from '@/lib/platformAdminService';
import { platformAdminKeys } from '@/lib/queryKeys';
import { formatDistanceToNow } from 'date-fns';
import type { Database, Json } from '@/types/database.types';

type Tenant = Database['public']['Tables']['tenants']['Row'];
type TenantSubscription = Database['public']['Tables']['tenant_subscriptions']['Row'];
type TenantHealthMetric = Database['public']['Tables']['tenant_health_metrics']['Row'];

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'custom';

interface TenantOverviewTabProps {
  tenant: Tenant;
  subscription?: TenantSubscription;
  health?: TenantHealthMetric;
  userCount?: number;
  caseCount?: number;
  storageUsedGb?: number;
}

const readJsonNumber = (source: Json | null | undefined, key: string): number => {
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    const value = (source as { [k: string]: Json | undefined })[key];
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
};

const readJsonString = (source: Json | null | undefined, key: string): string | null => {
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    const value = (source as { [k: string]: Json | undefined })[key];
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return null;
};

export const TenantOverviewTab: React.FC<TenantOverviewTabProps> = ({
  tenant,
  subscription,
  health,
  userCount = 0,
  caseCount = 0,
  storageUsedGb = 0,
}) => {
  const { data: healthHistory = [] } = useQuery({
    queryKey: platformAdminKeys.tenantHealthHistory(tenant.id),
    queryFn: () => getHealthMetricsHistory(tenant.id, 30),
  });

  const getChurnRiskColor = (risk: string | null | undefined): BadgeVariant => {
    switch (risk) {
      case 'low': return 'success';
      case 'medium': return 'warning';
      case 'high': return 'danger';
      case 'critical': return 'danger';
      default: return 'default';
    }
  };

  const getEngagementColor = (level: string | null | undefined): BadgeVariant => {
    switch (level) {
      case 'very_high':
      case 'high': return 'success';
      case 'moderate': return 'info';
      case 'low': return 'warning';
      case 'inactive': return 'danger';
      default: return 'default';
    }
  };

  const userLimit = readJsonNumber(tenant.limits, 'users');
  const caseLimit = readJsonNumber(tenant.limits, 'cases');
  const storageLimit = readJsonNumber(tenant.limits, 'storage_gb');
  const storageUsed = storageUsedGb;

  const contactEmail = subscription?.billing_email ?? readJsonString(tenant.metadata, 'contact_email');
  const contactPhone = readJsonString(tenant.metadata, 'contact_phone');
  const contactAddress =
    readJsonString(subscription?.billing_address, 'line1') ??
    readJsonString(tenant.metadata, 'address');
  const planLabel = subscription?.paypal_plan_id ?? subscription?.plan_id ?? null;
  const mrrAmount = subscription?.last_payment_amount ?? 0;
  const lastRecordedAt = health?.recorded_at ?? health?.created_at ?? null;

  const userPercentage = userLimit > 0 ? (userCount / userLimit) * 100 : 0;
  const casePercentage = caseLimit > 0 ? (caseCount / caseLimit) * 100 : 0;
  const storagePercentage = storageLimit > 0 ? (storageUsed / storageLimit) * 100 : 0;

  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-danger';
    if (percentage >= 75) return 'bg-warning';
    return 'bg-primary';
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Contact Information</h3>
        <div className="space-y-3">
          {contactEmail && (
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-slate-400 mt-0.5" />
              <div>
                <p className="text-sm text-slate-500">Email</p>
                <p className="text-sm font-medium text-slate-900">{contactEmail}</p>
              </div>
            </div>
          )}
          {contactPhone && (
            <div className="flex items-start gap-3">
              <Building2 className="w-5 h-5 text-slate-400 mt-0.5" />
              <div>
                <p className="text-sm text-slate-500">Phone</p>
                <p className="text-sm font-medium text-slate-900">{contactPhone}</p>
              </div>
            </div>
          )}
          <div className="flex items-start gap-3">
            <Building2 className="w-5 h-5 text-slate-400 mt-0.5" />
            <div>
              <p className="text-sm text-slate-500">Tenant</p>
              <p className="text-sm font-medium text-slate-900">{tenant.name}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Hash className="w-5 h-5 text-slate-400 mt-0.5" />
            <div>
              <p className="text-sm text-slate-500">Tenant Code</p>
              <p className="text-sm font-mono font-semibold tabular-nums text-slate-900">
                {tenant.tenant_code ?? '—'}
              </p>
            </div>
          </div>
          {contactAddress && (
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-slate-400 mt-0.5" />
              <div>
                <p className="text-sm text-slate-500">Address</p>
                <p className="text-sm font-medium text-slate-900">{contactAddress}</p>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Subscription</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Plan</span>
            <Badge variant="info">
              {planLabel ? planLabel.toUpperCase() : 'None'}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Status</span>
            <Badge variant={subscription?.status === 'active' ? 'success' : 'warning'}>
              {subscription?.status || 'None'}
            </Badge>
          </div>
          {subscription && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Billing Cycle</span>
                <span className="text-sm font-medium text-slate-900 capitalize">
                  {subscription.billing_interval}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Calendar className="w-4 h-4 text-slate-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-slate-500">Next Renewal</p>
                  <p className="text-sm font-medium text-slate-900">
                    {subscription.next_billing_date
                      ? new Date(subscription.next_billing_date).toLocaleDateString()
                      : 'N/A'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CreditCard className="w-4 h-4 text-slate-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-slate-500">MRR</p>
                  <p className="text-sm font-medium text-slate-900">
                    ${mrrAmount}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Usage Statistics</h3>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <UsersIcon className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-600">Users</span>
              </div>
              <span className="text-sm font-medium text-slate-900">
                {userCount} / {userLimit}
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${getProgressColor(userPercentage)}`}
                style={{ width: `${Math.min(userPercentage, 100)}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-600">Cases</span>
              </div>
              <span className="text-sm font-medium text-slate-900">
                {caseCount} / {caseLimit}
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${getProgressColor(casePercentage)}`}
                style={{ width: `${Math.min(casePercentage, 100)}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-600">Storage</span>
              </div>
              <span className="text-sm font-medium text-slate-900">
                {storageUsed.toFixed(2)} GB / {storageLimit} GB
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${getProgressColor(storagePercentage)}`}
                style={{ width: `${Math.min(storagePercentage, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Health Score</h3>
        {health ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Activity className="w-5 h-5 text-slate-400" />
                <span className="text-4xl font-bold text-slate-900">{health.health_score ?? 0}</span>
                <span className="text-sm text-slate-500">/100</span>
              </div>
              <Badge variant={getChurnRiskColor(health.churn_risk)}>
                {health.churn_risk?.toUpperCase() ?? 'UNKNOWN'} Risk
              </Badge>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Engagement Level</span>
              <Badge variant={getEngagementColor(health.engagement_level)}>
                {health.engagement_level?.replace('_', ' ').toUpperCase() ?? 'UNKNOWN'}
              </Badge>
            </div>

            {healthHistory.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-200">
                <p className="text-xs text-slate-500 mb-2">30-Day Trend</p>
                <div className="flex items-end gap-1 h-16">
                  {healthHistory.map((metric, i) => {
                    const score = metric.health_score ?? 0;
                    const height = (score / 100) * 100;
                    const recordedAt = metric.recorded_at ?? metric.created_at;
                    return (
                      <div
                        key={i}
                        className="flex-1 bg-primary rounded-t"
                        style={{ height: `${height}%` }}
                        title={`${score} on ${new Date(recordedAt).toLocaleDateString()}`}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {lastRecordedAt && (
              <div className="text-xs text-slate-500 mt-2">
                Last updated {formatDistanceToNow(new Date(lastRecordedAt))} ago
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No health data available</p>
        )}
      </Card>
    </div>
  );
};

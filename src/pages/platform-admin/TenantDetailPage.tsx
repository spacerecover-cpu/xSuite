import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, AlertCircle, Clock, Activity } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { Badge } from '../../components/ui/Badge';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { TenantOverviewTab } from '../../components/platform-admin/tenant-detail/TenantOverviewTab';
import { TenantActivityTab } from '../../components/platform-admin/tenant-detail/TenantActivityTab';
import { TenantUsersTab } from '../../components/platform-admin/tenant-detail/TenantUsersTab';
import { TenantBillingTab } from '../../components/platform-admin/tenant-detail/TenantBillingTab';
import { TenantSupportTab } from '../../components/platform-admin/tenant-detail/TenantSupportTab';
import { TenantNotesTab } from '../../components/platform-admin/tenant-detail/TenantNotesTab';
import { getTenantDetails, suspendTenant, reactivateTenant } from '../../lib/platformAdminService';
import { platformAdminKeys } from '../../lib/queryKeys';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '../../hooks/useToast';

type TabType = 'overview' | 'activity' | 'users' | 'billing' | 'support' | 'notes';

const tabs: Array<{ id: TabType; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Activity' },
  { id: 'users', label: 'Users' },
  { id: 'billing', label: 'Billing' },
  { id: 'support', label: 'Support' },
  { id: 'notes', label: 'Internal Notes' },
];

export const TenantDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success: showSuccess, error: showError } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);
  const [showReactivateDialog, setShowReactivateDialog] = useState(false);

  const { data: tenant, isLoading } = useQuery({
    queryKey: platformAdminKeys.tenantDetail(id!),
    queryFn: () => getTenantDetails(id!),
    enabled: !!id,
  });

  const suspendMutation = useMutation({
    mutationFn: () => suspendTenant(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.tenantDetail(id!) });
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.tenantsList() });
      showSuccess('Tenant suspended successfully');
      setShowSuspendDialog(false);
    },
    onError: () => {
      showError('Failed to suspend tenant');
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: () => reactivateTenant(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.tenantDetail(id!) });
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.tenantsList() });
      showSuccess('Tenant reactivated successfully');
      setShowReactivateDialog(false);
    },
    onError: () => {
      showError('Failed to reactivate tenant');
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <p className="text-slate-500">Tenant not found</p>
        <Button onClick={() => navigate('/platform-admin/tenants')} className="mt-4">
          Back to Tenants
        </Button>
      </div>
    );
  }

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active': return 'success';
      case 'suspended': return 'danger';
      case 'pending_approval': return 'warning';
      default: return 'default';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/platform-admin/tenants')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{tenant.name}</h1>
            <div className="flex items-center gap-3 mt-2">
              <Badge variant={getStatusBadgeVariant(tenant.status)}>
                {tenant.status.replace('_', ' ').toUpperCase()}
              </Badge>
              {tenant.health && (
                <span className="text-sm text-slate-500 flex items-center gap-1">
                  <Activity className="w-4 h-4" />
                  Health Score: {tenant.health.health_score ?? 0}
                </span>
              )}
              <span className="text-sm text-slate-500 flex items-center gap-1">
                <Clock className="w-4 h-4" />
                Last active {formatDistanceToNow(new Date(tenant.updated_at))} ago
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {tenant.status === 'active' ? (
            <Button
              variant="ghost"
              onClick={() => setShowSuspendDialog(true)}
              className="border border-danger/40 text-danger hover:bg-danger-muted"
            >
              Suspend Tenant
            </Button>
          ) : tenant.status === 'suspended' ? (
            <Button
              variant="ghost"
              onClick={() => setShowReactivateDialog(true)}
              className="border border-success/40 text-success hover:bg-success-muted"
            >
              Reactivate Tenant
            </Button>
          ) : null}
        </div>
      </div>

      <div className="border-b border-slate-200">
        <nav className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="pb-8">
        {activeTab === 'overview' && (
          <TenantOverviewTab
            tenant={tenant}
            subscription={tenant.subscription}
            health={tenant.health}
            userCount={tenant.userCount}
            caseCount={tenant.caseCount}
          />
        )}
        {activeTab === 'activity' && <TenantActivityTab tenantId={tenant.id} />}
        {activeTab === 'users' && <TenantUsersTab tenantId={tenant.id} />}
        {activeTab === 'billing' && (
          <TenantBillingTab tenantId={tenant.id} subscription={tenant.subscription} />
        )}
        {activeTab === 'support' && <TenantSupportTab tenantId={tenant.id} />}
        {activeTab === 'notes' && <TenantNotesTab tenantId={tenant.id} />}
      </div>

      <ConfirmDialog
        isOpen={showSuspendDialog}
        onClose={() => setShowSuspendDialog(false)}
        onConfirm={() => suspendMutation.mutate()}
        title="Suspend Tenant"
        message={`Are you sure you want to suspend ${tenant.name}? This will immediately revoke access to the platform.`}
        confirmText="Suspend"
        variant="danger"
      />

      <ConfirmDialog
        isOpen={showReactivateDialog}
        onClose={() => setShowReactivateDialog(false)}
        onConfirm={() => reactivateMutation.mutate()}
        title="Reactivate Tenant"
        message={`Are you sure you want to reactivate ${tenant.name}? This will restore full access to the platform.`}
        confirmText="Reactivate"
        variant="info"
      />
    </div>
  );
};

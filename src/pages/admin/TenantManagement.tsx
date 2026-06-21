import { useState, useEffect } from 'react';
import { Building2, Users, FileText, DollarSign, AlertCircle, CheckCircle, XCircle, Pause } from 'lucide-react';
import { PageHeaderSlot } from '../../components/layout/PageHeaderSlot';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { DataTable } from '../../components/shared/DataTable';
import { tenantService } from '../../lib/tenantService';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import type { Database } from '../../types/database.types';
import type { Column } from '../../components/shared/DataTable';
import { logger } from '../../lib/logger';

type TenantWithPlan = Database['public']['Tables']['tenants']['Row'] & {
  plan?: Database['public']['Tables']['subscription_plans']['Row'];
};

interface TenantStats {
  cases: number;
  customers: number;
  users: number;
}

export const TenantManagement = () => {
  const [tenants, setTenants] = useState<TenantWithPlan[]>([]);
  const [tenantStats, setTenantStats] = useState<Record<string, TenantStats>>({});
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const confirm = useConfirm();

  const loadTenants = async () => {
    try {
      const data = await tenantService.listAllTenants();
      setTenants(data);

      const stats: Record<string, TenantStats> = {};
      for (const tenant of data) {
        stats[tenant.id] = await tenantService.getTenantStats(tenant.id);
      }
      setTenantStats(stats);
    } catch (error) {
      toast.error('Failed to load tenants');
      logger.error('TenantManagement.loadTenants failed', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTenants();
  }, []);

  const handleSuspend = async (tenantId: string) => {
    const ok = await confirm({
      title: 'Suspend Tenant',
      message: 'Are you sure you want to suspend this tenant? They will lose access immediately.',
      confirmLabel: 'Suspend',
      tone: 'danger',
    });
    if (!ok) {
      return;
    }

    try {
      await tenantService.suspendTenant(tenantId);
      toast.success('Tenant suspended successfully');
      loadTenants();
    } catch (error) {
      toast.error('Failed to suspend tenant');
      logger.error('TenantManagement.handleSuspend failed', error);
    }
  };

  const handleReactivate = async (tenantId: string) => {
    try {
      await tenantService.reactivateTenant(tenantId);
      toast.success('Tenant reactivated successfully');
      loadTenants();
    } catch (error) {
      toast.error('Failed to reactivate tenant');
      logger.error('TenantManagement.handleReactivate failed', error);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="success"><CheckCircle className="w-3 h-3 mr-1" />Active</Badge>;
      case 'trial':
        return <Badge variant="info"><AlertCircle className="w-3 h-3 mr-1" />Trial</Badge>;
      case 'suspended':
        return <Badge variant="warning"><Pause className="w-3 h-3 mr-1" />Suspended</Badge>;
      case 'cancelled':
        return <Badge variant="danger"><XCircle className="w-3 h-3 mr-1" />Cancelled</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const columns: Column<TenantWithPlan>[] = [
    {
      header: 'Tenant',
      key: 'name',
      render: (tenant) => (
        <div>
          <div className="font-medium text-gray-900">{tenant.name}</div>
          <div className="text-sm text-gray-500">{tenant.slug}</div>
        </div>
      ),
    },
    {
      header: 'Plan',
      key: 'plan',
      render: (tenant) => (
        <span className="font-medium">{tenant.plan?.name || 'N/A'}</span>
      ),
    },
    {
      header: 'Status',
      key: 'status',
      render: (tenant) => getStatusBadge(tenant.status),
    },
    {
      header: 'Users',
      key: 'users',
      render: (tenant) => (
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-400" />
          <span>{tenantStats[tenant.id]?.users || 0}</span>
        </div>
      ),
    },
    {
      header: 'Cases',
      key: 'cases',
      render: (tenant) => (
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-400" />
          <span>{tenantStats[tenant.id]?.cases || 0}</span>
        </div>
      ),
    },
    {
      header: 'Customers',
      key: 'customers',
      render: (tenant) => (
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-gray-400" />
          <span>{tenantStats[tenant.id]?.customers || 0}</span>
        </div>
      ),
    },
    {
      header: 'Created',
      key: 'created_at',
      render: (tenant) => (
        <span className="text-sm text-gray-500">
          {new Date(tenant.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      header: 'Actions',
      key: 'id',
      render: (tenant) => (
        <div className="flex gap-2">
          {tenant.status === 'suspended' ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleReactivate(tenant.id)}
            >
              Reactivate
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleSuspend(tenant.id)}
              disabled={tenant.slug === 'default'}
            >
              Suspend
            </Button>
          )}
        </div>
      ),
    },
  ];

  const totalTenants = tenants.length;
  const activeTenants = tenants.filter(t => t.status === 'active').length;
  const trialTenants = tenants.filter(t => t.status === 'trial').length;
  const totalRevenue = tenants
    .filter(t => t.status === 'active' && t.plan)
    .reduce((sum, t) => sum + (t.plan?.price_monthly || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeaderSlot title="Tenant Management" />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Tenants</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{totalTenants}</p>
            </div>
            <Building2 className="w-10 h-10 text-primary" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Active</p>
              <p className="text-3xl font-bold text-success mt-1">{activeTenants}</p>
            </div>
            <CheckCircle className="w-10 h-10 text-success" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Trial</p>
              <p className="text-3xl font-bold text-info mt-1">{trialTenants}</p>
            </div>
            <AlertCircle className="w-10 h-10 text-info" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">MRR</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                ${totalRevenue.toFixed(0)}
              </p>
            </div>
            <DollarSign className="w-10 h-10 text-success" />
          </div>
        </Card>
      </div>

      <Card>
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading...</div>
        ) : (
          <DataTable
            columns={columns}
            data={tenants}
          />
        )}
      </Card>
    </div>
  );
};

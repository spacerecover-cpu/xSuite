import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, FileText } from 'lucide-react';
import { Card } from '../../ui/Card';
import { Badge } from '../../ui/Badge';
import { Table } from '../../ui/Table';
import { Skeleton } from '../../ui/Skeleton';
import { getTenantBillingHistory } from '@/lib/platformAdminService';
import { platformAdminKeys } from '@/lib/queryKeys';
import type { Database } from '@/types/database.types';

type TenantSubscription = Database['public']['Tables']['tenant_subscriptions']['Row'];

interface TenantBillingTabProps {
  tenantId: string;
  subscription?: TenantSubscription;
}

export const TenantBillingTab: React.FC<TenantBillingTabProps> = ({ tenantId, subscription }) => {
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: platformAdminKeys.tenantBilling(tenantId),
    queryFn: () => getTenantBillingHistory(tenantId),
  });

  const getStatusBadgeVariant = (status: string | null): 'success' | 'warning' | 'danger' | 'default' => {
    switch (status) {
      case 'paid': return 'success';
      case 'pending': return 'warning';
      case 'failed': return 'danger';
      case 'refunded': return 'default';
      default: return 'default';
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {subscription && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Subscription Details</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-slate-500">Plan</p>
              <p className="text-sm font-medium text-slate-900 mt-1">
                {subscription.plan_id}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Status</p>
              <Badge variant={subscription.status === 'active' ? 'success' : 'warning'} className="mt-1">
                {subscription.status}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-slate-500">Last Payment</p>
              <p className="text-sm font-medium text-slate-900 mt-1">
                ${subscription.last_payment_amount ?? 0} / {subscription.billing_interval}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Next Billing</p>
              <p className="text-sm font-medium text-slate-900 mt-1">
                {subscription.next_billing_date
                  ? new Date(subscription.next_billing_date).toLocaleDateString()
                  : 'N/A'}
              </p>
            </div>
            {subscription.paypal_subscription_id && (
              <div className="col-span-2">
                <p className="text-sm text-slate-500">PayPal Subscription ID</p>
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-xs bg-slate-100 px-2 py-1 rounded">
                    {subscription.paypal_subscription_id}
                  </code>
                  <a
                    href={`https://www.paypal.com/billing/subscriptions/${subscription.paypal_subscription_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-primary/90"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      <Card>
        <div className="p-6 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">Payment History</h3>
        </div>
        {invoices.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">No invoices found</p>
          </div>
        ) : (
          <Table
            data={invoices}
            columns={[
              {
                key: 'invoice_number',
                header: 'Invoice #',
                render: (invoice) => <span className="font-medium">{invoice.invoice_number}</span>,
              },
              {
                key: 'invoice_date',
                header: 'Date',
                render: (invoice) => (
                  <span className="text-slate-600">
                    {invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleDateString() : '-'}
                  </span>
                ),
              },
              {
                key: 'total',
                header: 'Amount',
                render: (invoice) => <span className="font-medium">${invoice.total}</span>,
              },
              {
                key: 'status',
                header: 'Status',
                render: (invoice) => (
                  <Badge variant={getStatusBadgeVariant(invoice.status)}>
                    {invoice.status ?? '-'}
                  </Badge>
                ),
              },
              {
                key: 'actions',
                header: 'Actions',
                render: (invoice) =>
                  invoice.invoice_pdf_url ? (
                    <a
                      href={invoice.invoice_pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary/90 text-sm flex items-center gap-1"
                    >
                      Download
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : null,
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
};

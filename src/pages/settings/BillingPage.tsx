import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { PageHeaderSlot } from '../../components/layout/PageHeaderSlot';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../hooks/useToast';
import { billingKeys } from '../../lib/queryKeys';
import {
  getTenantSubscription,
  getBillingInvoices,
  getCurrentUsage,
  cancelPayPalSubscription,
  getSubscriptionStatusColor,
  getSubscriptionStatusLabel,
  formatPrice,
} from '../../lib/billingService';
import {
  CreditCard,
  Download,
  AlertTriangle,
  Sparkles,
  Users,
  Briefcase,
  HardDrive,
  Calendar,
} from 'lucide-react';
import { format } from 'date-fns';

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'custom';

function mapBadgeVariant(legacy: 'default' | 'success' | 'warning' | 'error'): BadgeVariant {
  if (legacy === 'error') return 'danger';
  return legacy;
}

export default function BillingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const tenantId = user?.user_metadata?.tenant_id;

  const { data: subscription, isLoading: subscriptionLoading } = useQuery({
    queryKey: billingKeys.subscription(tenantId),
    queryFn: () => getTenantSubscription(tenantId),
    enabled: !!tenantId,
  });

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: billingKeys.invoices(tenantId),
    queryFn: () => getBillingInvoices(tenantId, 10),
    enabled: !!tenantId,
  });

  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: billingKeys.usage(tenantId),
    queryFn: () => getCurrentUsage(tenantId),
    enabled: !!tenantId,
  });

  const cancelMutation = useMutation({
    mutationFn: (reason?: string) => cancelPayPalSubscription(tenantId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.subscription(tenantId) });
      toast.success('Subscription cancelled successfully');
      setShowCancelDialog(false);
    },
    onError: (error: Error) => {
      toast.error(`Failed to cancel subscription: ${error.message}`);
    },
  });

  useEffect(() => {
    const success = searchParams.get('success');
    const cancelled = searchParams.get('cancelled');

    if (success === 'true') {
      toast.success('Subscription activated successfully!');
      setSearchParams({});
    }

    if (cancelled === 'true') {
      toast.error('Subscription setup was cancelled');
      setSearchParams({});
    }
  }, [searchParams, setSearchParams, toast]);

  const isLoading = subscriptionLoading || invoicesLoading || usageLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading billing information...</div>
      </div>
    );
  }

  const plan = subscription?.subscription_plans;
  const status = subscription?.status || 'none';
  const isActive = status === 'active';
  const isPastDue = status === 'past_due';
  const isCancelled = status === 'cancelled';

  const getProgressColor = (percentage: number) => {
    if (percentage >= 100) return 'bg-danger';
    if (percentage >= 80) return 'bg-warning';
    return 'bg-primary';
  };

  const calculatePercentage = (current: number, limit: number | null) => {
    if (!limit) return 0;
    return Math.min((current / limit) * 100, 100);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeaderSlot title="Billing & Subscription" />

      {isPastDue && (
        <div className="bg-warning-muted border border-warning/30 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-warning">Payment Past Due</p>
            <p className="text-sm text-warning mt-1">
              Your payment is overdue. Please update your payment method to continue using xSuite.
            </p>
          </div>
        </div>
      )}

      {isCancelled && (
        <div className="bg-danger-muted border border-danger/30 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-danger">Subscription Cancelled</p>
            <p className="text-sm text-danger mt-1">
              Your subscription has been cancelled.
              {subscription?.cancelled_at &&
                ` You have access until ${format(new Date(subscription.cancelled_at), 'MMM d, yyyy')}.`}
            </p>
          </div>
        </div>
      )}

      <Card>
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-info-muted rounded-lg flex items-center justify-center">
                <CreditCard className="w-6 h-6 text-info" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Current Plan</h3>
                <Badge variant={mapBadgeVariant(getSubscriptionStatusColor(status))}>
                  {getSubscriptionStatusLabel(status)}
                </Badge>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => navigate('/settings/plans')}>
                Change Plan
              </Button>
              {isActive && !isCancelled && (
                <Button variant="secondary" onClick={() => setShowCancelDialog(true)}>
                  Cancel
                </Button>
              )}
            </div>
          </div>

          {plan ? (
            <div className="space-y-3">
              <div>
                <h4 className="text-2xl font-bold text-gray-900">{plan.name}</h4>
                <p className="text-gray-600 mt-1">{plan.description}</p>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-gray-900">
                  {subscription?.billing_interval === 'year'
                    ? formatPrice(Math.round((Number(plan.price_yearly) / 12) * 100))
                    : formatPrice(Math.round(Number(plan.price_monthly) * 100))}
                </span>
                <span className="text-gray-600">/month</span>
                {subscription?.billing_interval === 'year' && (
                  <span className="text-sm text-gray-500">
                    (Billed ${plan.price_yearly}/year)
                  </span>
                )}
              </div>
              {subscription?.current_period_end && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="w-4 h-4" />
                  <span>
                    {isCancelled ? 'Cancels on' : 'Renews on'}{' '}
                    {format(new Date(subscription.current_period_end), 'MMMM d, yyyy')}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-600 mb-4">No active subscription</p>
              <Button onClick={() => navigate('/settings/plans')}>View Plans</Button>
            </div>
          )}
        </div>
      </Card>

      {usage && (
        <Card>
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Current Usage</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <UsageCard
                icon={<Users className="w-5 h-5" />}
                label="Team Members"
                current={usage.users.current}
                limit={usage.users.limit}
                color={getProgressColor(calculatePercentage(usage.users.current, usage.users.limit))}
              />
              <UsageCard
                icon={<Briefcase className="w-5 h-5" />}
                label="Cases This Month"
                current={usage.cases.current}
                limit={usage.cases.limit}
                color={getProgressColor(calculatePercentage(usage.cases.current, usage.cases.limit))}
              />
              <UsageCard
                icon={<HardDrive className="w-5 h-5" />}
                label="Storage Used"
                current={usage.storage_gb.current}
                limit={usage.storage_gb.limit}
                suffix="GB"
                color={getProgressColor(
                  calculatePercentage(usage.storage_gb.current, usage.storage_gb.limit)
                )}
              />
              <UsageCard
                icon={<Briefcase className="w-5 h-5" />}
                label="Branches"
                current={usage.branches.current}
                limit={usage.branches.limit}
                color={getProgressColor(
                  calculatePercentage(usage.branches.current, usage.branches.limit)
                )}
              />
            </div>
          </div>
        </Card>
      )}

      {(!isActive || plan?.code === 'starter') && (
        <Card className="bg-info-muted border-info/30">
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-info-muted rounded-lg flex items-center justify-center ring-1 ring-info/30">
                <Sparkles className="w-6 h-6 text-info" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Upgrade for More</h3>
                <p className="text-gray-600 mb-4">
                  Get advanced reports, API access, and priority support with our Professional or
                  Enterprise plans.
                </p>
                <Button onClick={() => navigate('/settings/plans')}>View Plans</Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Billing History</h3>
          {invoices.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No invoices yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">
                      Invoice
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Date</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">
                      Amount
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">
                      Status
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 text-sm text-gray-900">
                        {invoice.invoice_number}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {invoice.invoice_date
                          ? format(new Date(invoice.invoice_date), 'MMM d, yyyy')
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900">
                        {formatPrice(Math.round(Number(invoice.total ?? 0) * 100))}
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant={
                            invoice.status === 'paid'
                              ? 'success'
                              : invoice.status === 'pending'
                              ? 'warning'
                              : 'danger'
                          }
                        >
                          {invoice.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {invoice.invoice_pdf_url && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (invoice.invoice_pdf_url) {
                                window.open(invoice.invoice_pdf_url, '_blank');
                              }
                            }}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <ConfirmDialog
        isOpen={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onConfirm={() => cancelMutation.mutate(undefined)}
        title="Cancel Subscription"
        message="Are you sure you want to cancel your subscription? You will continue to have access until the end of your billing period."
        confirmText="Cancel Subscription"
        variant="danger"
        isLoading={cancelMutation.isPending}
      />
    </div>
  );
}

interface UsageCardProps {
  icon: React.ReactNode;
  label: string;
  current: number;
  limit: number | null;
  suffix?: string;
  color: string;
}

function UsageCard({ icon, label, current, limit, suffix = '', color }: UsageCardProps) {
  const percentage = limit ? Math.min((current / limit) * 100, 100) : 0;
  const displayLimit = limit ? limit.toString() : 'Unlimited';

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-gray-600">{icon}</div>
        <span className="text-sm font-medium text-gray-700">{label}</span>
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-2xl font-bold text-gray-900">
          {current}
          {suffix}
        </span>
        <span className="text-sm text-gray-500">
          / {displayLimit}
          {suffix}
        </span>
      </div>
      {limit && (
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${percentage}%` }} />
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { PageHeaderSlot } from '../../components/layout/PageHeaderSlot';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../hooks/useToast';
import { billingKeys } from '../../lib/queryKeys';
import {
  getTenantSubscription,
  getSubscriptionPlans,
  createPayPalSubscription,
  calculateMonthlyPrice,
} from '../../lib/billingService';
import { Sparkles, Check, Loader2, ExternalLink, CheckCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

type BillingInterval = 'month' | 'year';

export default function PlansPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('month');
  const tenantId = user?.user_metadata?.tenant_id;

  const { data: subscription, isLoading: subscriptionLoading } = useQuery({
    queryKey: billingKeys.subscription(tenantId),
    queryFn: () => getTenantSubscription(tenantId),
    enabled: !!tenantId,
  });

  const { data: plans = [], isLoading: plansLoading } = useQuery({
    queryKey: billingKeys.plans(),
    queryFn: getSubscriptionPlans,
  });

  const createSubscriptionMutation = useMutation({
    mutationFn: ({ planId }: { planId: string }) =>
      createPayPalSubscription(tenantId, planId, billingInterval),
    onSuccess: (data) => {
      if (data.approvalUrl) {
        window.location.href = data.approvalUrl;
      } else {
        toast.error('No approval URL returned from PayPal');
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to create subscription: ${error.message}`);
    },
  });

  const currentPlanId = subscription?.plan_id;
  const isLoading = subscriptionLoading || plansLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading plans...</div>
      </div>
    );
  }

  const calculateSavings = (monthly: number, yearly: number) => {
    const yearlyTotal = monthly * 12;
    const savings = ((yearlyTotal - yearly) / yearlyTotal) * 100;
    return Math.round(savings);
  };

  const monthlyPrice = plans[0]?.price_monthly ? Number(plans[0].price_monthly) : 0;
  const yearlyPrice = plans[0]?.price_yearly ? Number(plans[0].price_yearly) : 0;
  const savingsPercentage = calculateSavings(monthlyPrice, yearlyPrice);

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <PageHeaderSlot title="Choose Your Plan" />

      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => setBillingInterval('month')}
          className={cn(
            'px-6 py-2 rounded-lg font-medium transition-colors',
            billingInterval === 'month'
              ? 'bg-primary text-primary-foreground'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          )}
        >
          Monthly
        </button>
        <button
          onClick={() => setBillingInterval('year')}
          className={cn(
            'px-6 py-2 rounded-lg font-medium transition-colors relative',
            billingInterval === 'year'
              ? 'bg-primary text-primary-foreground'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          )}
        >
          Yearly
          {savingsPercentage > 0 && (
            <span className="absolute -top-2 -right-2 bg-success text-success-foreground text-xs px-2 py-0.5 rounded-full">
              Save {savingsPercentage}%
            </span>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const isCurrentPlan = currentPlanId === plan.id;
          const isProfessional = plan.code === 'professional';
          const isEnterprise = plan.code === 'enterprise';
          const monthlyDisplayPrice = calculateMonthlyPrice(plan, billingInterval);
          const yearlyTotal = Number(plan.price_yearly);

          const features = plan.plan_features || [];
          const limitFeatures = new Map(features.map((f) => [f.feature_key, f]));
          const maxUsersLimit = limitFeatures.get('max_users')?.limit_value ?? null;
          const maxCasesLimit = limitFeatures.get('max_cases_per_month')?.limit_value ?? null;
          const storageGbLimit = limitFeatures.get('storage_gb')?.limit_value ?? null;
          const displayFeatures = features
            .filter((f) => !['max_users', 'max_cases_per_month', 'storage_gb'].includes(f.feature_key))
            .slice(0, 4);

          return (
            <Card
              key={plan.id}
              className={cn(
                'relative',
                isProfessional && 'border-primary shadow-lg scale-105 border-2'
              )}
            >
              {isProfessional && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground px-4 py-1">
                    <Sparkles className="w-3 h-3 mr-1" />
                    Most Popular
                  </Badge>
                </div>
              )}

              <div className="p-6 space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-2xl font-bold text-gray-900">{plan.name}</h3>
                    {isCurrentPlan && (
                      <Badge variant="success">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Current Plan
                      </Badge>
                    )}
                  </div>
                  <p className="text-gray-600">{plan.description}</p>
                </div>

                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-gray-900">
                      ${monthlyDisplayPrice.toFixed(0)}
                    </span>
                    <span className="text-gray-600">/month</span>
                  </div>
                  {billingInterval === 'year' && (
                    <p className="text-sm text-gray-500 mt-1">
                      Billed ${yearlyTotal.toFixed(0)}/year
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="text-sm font-medium text-gray-700">Key Features:</div>
                  {maxUsersLimit !== null && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Check className="w-4 h-4 text-success flex-shrink-0" />
                      <span>
                        {maxUsersLimit === 999999 ? 'Unlimited' : maxUsersLimit} team members
                      </span>
                    </div>
                  )}
                  {maxCasesLimit !== null && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Check className="w-4 h-4 text-success flex-shrink-0" />
                      <span>
                        {maxCasesLimit === 999999 ? 'Unlimited' : maxCasesLimit} cases/month
                      </span>
                    </div>
                  )}
                  {storageGbLimit !== null && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Check className="w-4 h-4 text-success flex-shrink-0" />
                      <span>
                        {storageGbLimit === 999999 ? 'Unlimited' : `${storageGbLimit}GB`} storage
                      </span>
                    </div>
                  )}
                  {displayFeatures.map((feature) => (
                    <div key={feature.id} className="flex items-center gap-2 text-sm text-gray-600">
                      <Check className="w-4 h-4 text-success flex-shrink-0" />
                      <span className={feature.is_highlighted ? 'font-medium' : ''}>
                        {feature.feature_name}
                      </span>
                    </div>
                  ))}
                </div>

                {isEnterprise ? (
                  <Button
                    className="w-full"
                    variant={isProfessional ? 'primary' : 'secondary'}
                    onClick={() =>
                      (window.location.href = 'mailto:sales@xsuite.space?subject=Enterprise Plan Inquiry')
                    }
                  >
                    Contact Sales
                    <ExternalLink className="w-4 h-4 ml-2" />
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    variant={isProfessional ? 'primary' : 'secondary'}
                    disabled={isCurrentPlan || createSubscriptionMutation.isPending}
                    onClick={() => createSubscriptionMutation.mutate({ planId: plan.id })}
                  >
                    {createSubscriptionMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Redirecting to PayPal...
                      </>
                    ) : isCurrentPlan ? (
                      'Current Plan'
                    ) : (
                      'Get Started'
                    )}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Frequently Asked Questions</h3>
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-gray-900 mb-1">Can I change plans later?</h4>
            <p className="text-sm text-gray-600">
              Yes, you can upgrade or downgrade your plan at any time from the billing settings.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-1">What payment methods do you accept?</h4>
            <p className="text-sm text-gray-600">
              We accept all major credit cards and PayPal through our secure payment processor.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-1">Is there a free trial?</h4>
            <p className="text-sm text-gray-600">
              Yes, all plans include a 14-day free trial. No credit card required.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-1">Need help choosing?</h4>
            <p className="text-sm text-gray-600">
              Contact our team at{' '}
              <a
                href="mailto:support@xsuite.space"
                className="text-primary hover:text-primary/90"
              >
                support@xsuite.space
              </a>{' '}
              and we'll help you select the right plan.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

import { supabase } from './supabaseClient';
import type { Database } from '../types/database.types';

type TenantSubscription = Database['public']['Tables']['tenant_subscriptions']['Row'];
type SubscriptionPlan = Database['public']['Tables']['subscription_plans']['Row'];
type PlanFeature = Database['public']['Tables']['plan_features']['Row'];
type BillingInvoice = Database['public']['Tables']['billing_invoices']['Row'];
type BillingInvoiceItem = Database['public']['Tables']['billing_invoice_items']['Row'];
type TenantPaymentMethod = Database['public']['Tables']['tenant_payment_methods']['Row'];
type BillingCoupon = Database['public']['Tables']['billing_coupons']['Row'];
type CouponRedemption = Database['public']['Tables']['coupon_redemptions']['Row'];

export interface SubscriptionWithPlan extends TenantSubscription {
  subscription_plans?: SubscriptionPlan;
}

export interface PlanWithFeatures extends SubscriptionPlan {
  plan_features?: PlanFeature[];
}

export interface InvoiceWithItems extends BillingInvoice {
  billing_invoice_items?: BillingInvoiceItem[];
}

export interface UsageMetrics {
  users: { current: number; limit: number | null };
  cases: { current: number; limit: number | null };
  storage_gb: { current: number; limit: number | null };
  branches: { current: number; limit: number | null };
}

export interface UsageCheckResult {
  allowed: boolean;
  current: number;
  limit: number | null;
  percentage: number;
}

export interface BillingStats {
  mrr: number;
  arr: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  churnedThisMonth: number;
  revenueThisMonth: number;
}

export type FeatureKey =
  | 'case_management'
  | 'basic_invoicing'
  | 'customer_portal'
  | 'advanced_reports'
  | 'api_access'
  | 'white_labeling'
  | 'sso'
  | 'custom_workflows'
  | 'multi_branch'
  | 'bulk_import'
  | 'dedicated_support'
  | 'inventory_management'
  | 'priority_support';

export async function getTenantSubscription(
  tenantId: string
): Promise<SubscriptionWithPlan | null> {
  const { data, error } = await supabase
    .from('tenant_subscriptions')
    .select(`
      *,
      subscription_plans (*)
    `)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getAllSubscriptionPlans(): Promise<PlanWithFeatures[]> {
  const { data, error } = await supabase
    .from('subscription_plans')
    .select(`
      *,
      plan_features (*)
    `)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getSubscriptionPlanById(id: string): Promise<PlanWithFeatures | null> {
  const { data, error } = await supabase
    .from('subscription_plans')
    .select(`
      *,
      plan_features (*)
    `)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createSubscriptionPlan(
  plan: Database['public']['Tables']['subscription_plans']['Insert']
): Promise<SubscriptionPlan> {
  const { data, error } = await supabase
    .from('subscription_plans')
    .insert(plan)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Failed to create plan');
  return data;
}

export async function updateSubscriptionPlan(
  id: string,
  updates: Database['public']['Tables']['subscription_plans']['Update']
): Promise<SubscriptionPlan> {
  const { data, error } = await supabase
    .from('subscription_plans')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Failed to update plan');
  return data;
}

export async function softDeleteSubscriptionPlan(id: string): Promise<void> {
  const { error } = await supabase
    .from('subscription_plans')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function createPlanFeature(
  feature: Database['public']['Tables']['plan_features']['Insert']
): Promise<PlanFeature> {
  const { data, error } = await supabase
    .from('plan_features')
    .insert(feature)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Failed to create feature');
  return data;
}

export async function updatePlanFeature(
  id: string,
  updates: Database['public']['Tables']['plan_features']['Update']
): Promise<PlanFeature> {
  const { data, error } = await supabase
    .from('plan_features')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Failed to update feature');
  return data;
}

export async function softDeletePlanFeature(id: string): Promise<void> {
  const { error } = await supabase
    .from('plan_features')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function getPlanSubscriberCount(planId: string): Promise<number> {
  const { count, error } = await supabase
    .from('tenant_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('plan_id', planId)
    .eq('status', 'active');

  if (error) throw error;
  return count || 0;
}

export async function getAllCoupons(): Promise<BillingCoupon[]> {
  const { data, error } = await supabase
    .from('billing_coupons')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createCoupon(
  coupon: Database['public']['Tables']['billing_coupons']['Insert']
): Promise<BillingCoupon> {
  const { data, error } = await supabase
    .from('billing_coupons')
    .insert(coupon)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Failed to create coupon');
  return data;
}

export async function updateCoupon(
  id: string,
  updates: Database['public']['Tables']['billing_coupons']['Update']
): Promise<BillingCoupon> {
  const { data, error } = await supabase
    .from('billing_coupons')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Failed to update coupon');
  return data;
}

export async function softDeleteCoupon(id: string): Promise<void> {
  const { error } = await supabase
    .from('billing_coupons')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function getCouponRedemptions(couponId: string): Promise<CouponRedemption[]> {
  const { data, error } = await supabase
    .from('coupon_redemptions')
    .select('*')
    .eq('coupon_id', couponId)
    .order('redeemed_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getSubscriptionPlans(): Promise<PlanWithFeatures[]> {
  const { data, error } = await supabase
    .from('subscription_plans')
    .select(`
      *,
      plan_features (*)
    `)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getPlanFeatures(planId: string): Promise<PlanFeature[]> {
  const { data, error } = await supabase
    .from('plan_features')
    .select('*')
    .eq('plan_id', planId)
    .is('deleted_at', null)
    .order('display_order');

  if (error) throw error;
  return data || [];
}

export async function createPayPalSubscription(
  tenantId: string,
  planId: string,
  billingInterval: 'month' | 'year' = 'month',
  returnUrl?: string,
  cancelUrl?: string
): Promise<{ subscriptionId: string; approvalUrl: string; status: string }> {
  const { data, error } = await supabase.functions.invoke('paypal-create-subscription', {
    body: {
      tenantId,
      planId,
      billingInterval,
      returnUrl: returnUrl || `${window.location.origin}/settings/billing?success=true`,
      cancelUrl: cancelUrl || `${window.location.origin}/settings/billing?cancelled=true`,
    },
  });

  if (error) throw error;
  if (!data) throw new Error('No data returned from PayPal subscription creation');
  return data;
}

export async function changePlan(
  tenantId: string,
  newPlanId: string,
  billingInterval?: 'month' | 'year'
): Promise<void> {
  const { error } = await supabase.functions.invoke('paypal-manage-subscription', {
    body: {
      action: 'change_plan',
      tenantId,
      newPlanId,
      billingInterval,
    },
  });

  if (error) throw error;
}

export async function cancelPayPalSubscription(
  tenantId: string,
  reason?: string
): Promise<void> {
  const { data, error } = await supabase.functions.invoke('paypal-cancel-subscription', {
    body: {
      tenantId,
      reason,
    },
  });

  if (error) throw error;
  if (!data?.success) {
    throw new Error(data?.error || 'Failed to cancel subscription');
  }
}

export async function cancelSubscription(
  tenantId: string,
  _cancelImmediately = false,
  reason?: string
): Promise<void> {
  return cancelPayPalSubscription(tenantId, reason);
}

export async function reactivateSubscription(tenantId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('paypal-manage-subscription', {
    body: {
      action: 'reactivate',
      tenantId,
    },
  });

  if (error) throw error;
}

export async function applyCoupon(tenantId: string, couponCode: string): Promise<void> {
  const couponValidation = await validateCoupon(couponCode);
  if (!couponValidation.valid || !couponValidation.coupon) {
    throw new Error(couponValidation.message || 'Invalid coupon code');
  }

  const subscription = await getTenantSubscription(tenantId);
  if (!subscription) {
    throw new Error('No active subscription found');
  }

  const { error } = await supabase.from('coupon_redemptions').insert({
    tenant_id: tenantId,
    coupon_id: couponValidation.coupon.id,
    subscription_id: subscription.id,
  });

  if (error) throw error;

  await supabase
    .from('billing_coupons')
    .update({ redemptions_count: (couponValidation.coupon.redemptions_count || 0) + 1 })
    .eq('id', couponValidation.coupon.id);
}

export async function getBillingInvoices(
  tenantId: string,
  limit = 10
): Promise<BillingInvoice[]> {
  const { data, error } = await supabase
    .from('billing_invoices')
    .select('*')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('invoice_date', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function getBillingInvoice(invoiceId: string): Promise<InvoiceWithItems | null> {
  const { data, error } = await supabase
    .from('billing_invoices')
    .select(`
      *,
      billing_invoice_items (*)
    `)
    .eq('id', invoiceId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function downloadInvoicePdf(invoiceId: string): Promise<void> {
  const { data, error } = await supabase
    .from('billing_invoices')
    .select('invoice_pdf_url')
    .eq('id', invoiceId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw error;
  if (data?.invoice_pdf_url) {
    window.open(data.invoice_pdf_url, '_blank');
  }
}

export async function getPaymentMethods(tenantId: string): Promise<TenantPaymentMethod[]> {
  const { data, error } = await supabase
    .from('tenant_payment_methods')
    .select('*')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('is_default', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getCurrentUsage(tenantId: string): Promise<UsageMetrics> {
  const subscription = await getTenantSubscription(tenantId);
  const plan = subscription?.subscription_plans;

  const features = plan ? await getPlanFeatures(plan.id) : [];
  const featureMap = new Map(features.map((f) => [f.feature_key, f]));

  const [usersResult, casesResult, branchesResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null),
    supabase
      .from('cases')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null),
    supabase
      .from('branches')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null),
  ]);

  const { data: storageData } = await supabase.rpc('get_tenant_storage_bytes', {
    p_tenant_id: tenantId,
  });

  const storageGb = (storageData || 0) / (1024 * 1024 * 1024);

  return {
    users: {
      current: usersResult.count || 0,
      limit: featureMap.get('max_users')?.limit_value || null,
    },
    cases: {
      current: casesResult.count || 0,
      limit: featureMap.get('max_cases_per_month')?.limit_value || null,
    },
    storage_gb: {
      current: parseFloat(storageGb.toFixed(2)),
      limit: featureMap.get('storage_gb')?.limit_value || null,
    },
    branches: {
      current: branchesResult.count || 0,
      limit: featureMap.get('multi_branch')?.limit_value || null,
    },
  };
}

export async function checkUsageLimit(
  tenantId: string,
  limitType: 'users' | 'cases' | 'storage_gb' | 'branches'
): Promise<UsageCheckResult> {
  const usage = await getCurrentUsage(tenantId);
  const metric = usage[limitType];

  const percentage = metric.limit ? (metric.current / metric.limit) * 100 : 0;

  return {
    allowed: metric.limit === null || metric.current < metric.limit,
    current: metric.current,
    limit: metric.limit,
    percentage,
  };
}

export async function recordUsageSnapshot(tenantId: string): Promise<void> {
  const usage = await getCurrentUsage(tenantId);
  const today = new Date().toISOString().split('T')[0];

  const { error } = await supabase.from('usage_snapshots').upsert(
    {
      tenant_id: tenantId,
      snapshot_date: today,
      snapshot_hour: null,
      total_users: usage.users.current,
      total_cases: usage.cases.current,
      storage_bytes: Math.round(usage.storage_gb.current * 1024 * 1024 * 1024),
    },
    { onConflict: 'tenant_id,snapshot_date,snapshot_hour' }
  );

  if (error) throw error;
}

export async function hasFeatureAccess(
  tenantId: string,
  featureKey: FeatureKey
): Promise<boolean> {
  const subscription = await getTenantSubscription(tenantId);
  if (!subscription) return false;

  const { data } = await supabase
    .from('plan_features')
    .select('is_enabled, limit_value')
    .eq('plan_id', subscription.plan_id)
    .eq('feature_key', featureKey)
    .is('deleted_at', null)
    .maybeSingle();

  return data?.is_enabled || false;
}

export async function getFeatureLimit(
  tenantId: string,
  featureKey: FeatureKey
): Promise<number | null> {
  const subscription = await getTenantSubscription(tenantId);
  if (!subscription) return 0;

  const { data } = await supabase
    .from('plan_features')
    .select('limit_value')
    .eq('plan_id', subscription.plan_id)
    .eq('feature_key', featureKey)
    .is('deleted_at', null)
    .maybeSingle();

  return data?.limit_value || null;
}

export async function validateCoupon(
  couponCode: string
): Promise<{ valid: boolean; coupon?: BillingCoupon; message?: string }> {
  const { data, error } = await supabase
    .from('billing_coupons')
    .select('*')
    .eq('code', couponCode.toUpperCase())
    .eq('is_active', true)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !data) {
    return { valid: false, message: 'Invalid coupon code' };
  }

  if (data.valid_until && new Date(data.valid_until) < new Date()) {
    return { valid: false, message: 'Coupon has expired' };
  }

  if (data.max_redemptions && (data.redemptions_count ?? 0) >= data.max_redemptions) {
    return { valid: false, message: 'Coupon has reached maximum redemptions' };
  }

  return { valid: true, coupon: data };
}

export async function getBillingStats(): Promise<BillingStats> {
  const { data: subscriptions } = await supabase
    .from('tenant_subscriptions')
    .select(`
      status,
      billing_interval,
      subscription_plans (price_monthly, price_yearly)
    `)
    .is('deleted_at', null);

  const { data: invoices } = await supabase
    .from('billing_invoices')
    .select('total, status, paid_at')
    .eq('status', 'paid')
    .is('deleted_at', null)
    .gte('paid_at', new Date(new Date().setDate(1)).toISOString());

  let mrr = 0;
  let activeCount = 0;
  let trialCount = 0;

  subscriptions?.forEach((sub: any) => {
    if (sub.status === 'active') {
      activeCount++;
      const plan = sub.subscription_plans;
      if (sub.billing_interval === 'year') {
        mrr += (plan?.price_yearly || 0) / 12;
      } else {
        mrr += plan?.price_monthly || 0;
      }
    } else if (sub.status === 'trialing') {
      trialCount++;
    }
  });

  const revenueThisMonth = invoices?.reduce((sum, inv) => sum + (inv.total || 0), 0) || 0;

  return {
    mrr,
    arr: mrr * 12,
    activeSubscriptions: activeCount,
    trialSubscriptions: trialCount,
    churnedThisMonth: 0,
    revenueThisMonth: revenueThisMonth / 100,
  };
}

export function formatPrice(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

export function formatPlanPrice(plan: SubscriptionPlan, interval: 'month' | 'year'): string {
  const price = interval === 'year' ? plan.price_yearly : plan.price_monthly;
  return formatPrice(Math.round(Number(price) * 100), plan.currency);
}

export function calculateMonthlyPrice(plan: SubscriptionPlan, interval: 'month' | 'year'): number {
  if (interval === 'year') {
    return Number(plan.price_yearly) / 12;
  }
  return Number(plan.price_monthly);
}

export function getSubscriptionStatusColor(
  status: string
): 'default' | 'success' | 'warning' | 'error' {
  switch (status) {
    case 'active':
      return 'success';
    case 'trialing':
      return 'default';
    case 'past_due':
    case 'incomplete':
      return 'warning';
    case 'cancelled':
    case 'suspended':
      return 'error';
    default:
      return 'default';
  }
}

export function getSubscriptionStatusLabel(status: string): string {
  switch (status) {
    case 'trialing':
      return 'Trial';
    case 'active':
      return 'Active';
    case 'past_due':
      return 'Past Due';
    case 'cancelled':
      return 'Cancelled';
    case 'paused':
      return 'Paused';
    case 'incomplete':
      return 'Incomplete';
    case 'suspended':
      return 'Suspended';
    default:
      return status;
  }
}

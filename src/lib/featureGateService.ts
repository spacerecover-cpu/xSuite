import { supabase } from './supabaseClient';
import { logger } from './logger';

// ============ TYPES ============

export type FeatureKey =
  | 'advanced_reports'
  | 'api_access'
  | 'white_labeling'
  | 'sso'
  | 'custom_workflows'
  | 'multi_branch'
  | 'bulk_import'
  | 'dedicated_support'
  | 'priority_email'
  | 'audit_logs'
  | 'integrations';

export type UsageLimitKey =
  | 'max_users'
  | 'max_cases_per_month'
  | 'max_storage_gb'
  | 'max_branches';

export interface FeatureAccess {
  allowed: boolean;
  requiredPlan: string | null;
  limit?: number | null;
}

export interface UsageLimit {
  allowed: boolean;
  current: number;
  limit: number | null;
  percentage: number;
  remaining: number | null;
}

// ============ CACHE ============

interface PlanCache {
  planId: string | null;
  planCode: string | null;
  features: Map<string, { enabled: boolean; limit: number | null }>;
  expiry: number;
}

let planCache: PlanCache | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============ PLAN HIERARCHY ============

const PLAN_HIERARCHY: Record<string, number> = {
  starter: 1,
  professional: 2,
  enterprise: 3,
};

const FEATURE_REQUIREMENTS: Record<FeatureKey, string> = {
  advanced_reports: 'professional',
  api_access: 'professional',
  bulk_import: 'professional',
  multi_branch: 'professional',
  priority_email: 'professional',
  audit_logs: 'professional',
  integrations: 'professional',
  white_labeling: 'enterprise',
  sso: 'enterprise',
  custom_workflows: 'enterprise',
  dedicated_support: 'enterprise',
};

// ============ CORE FUNCTIONS ============

export async function loadPlanCache(): Promise<void> {
  const tenantId = localStorage.getItem('tenant_id');
  if (!tenantId) {
    planCache = null;
    return;
  }

  if (planCache && Date.now() < planCache.expiry) {
    return;
  }

  try {
    const { data: subscription } = await supabase
      .from('tenant_subscriptions')
      .select(`
        plan_id,
        subscription_plans (
          id,
          code
        )
      `)
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .maybeSingle();

    if (!subscription) {
      planCache = {
        planId: null,
        planCode: 'starter',
        features: new Map(),
        expiry: Date.now() + CACHE_TTL,
      };
      return;
    }

    const { data: features } = await supabase
      .from('plan_features')
      .select('feature_key, is_enabled, limit_value')
      .eq('plan_id', subscription.plan_id);

    const featureMap = new Map<string, { enabled: boolean; limit: number | null }>();
    features?.forEach((f) => {
      featureMap.set(f.feature_key, {
        enabled: f.is_enabled ?? false,
        limit: f.limit_value,
      });
    });

    planCache = {
      planId: subscription.plan_id,
      planCode: (subscription.subscription_plans as any)?.code || 'starter',
      features: featureMap,
      expiry: Date.now() + CACHE_TTL,
    };
  } catch (error) {
    logger.error('Failed to load plan cache:', error);
    planCache = null;
  }
}

export function clearPlanCache(): void {
  planCache = null;
}

export async function getCurrentPlanCode(): Promise<string> {
  await loadPlanCache();
  return planCache?.planCode || 'starter';
}

// ============ FEATURE ACCESS ============

export async function hasFeature(featureKey: FeatureKey): Promise<boolean> {
  await loadPlanCache();

  if (!planCache) return false;

  const featureConfig = planCache.features.get(featureKey);
  if (featureConfig !== undefined) {
    return featureConfig.enabled;
  }

  const requiredPlan = FEATURE_REQUIREMENTS[featureKey];
  if (!requiredPlan) return true;

  const currentLevel = PLAN_HIERARCHY[planCache.planCode ?? 'starter'] || 0;
  const requiredLevel = PLAN_HIERARCHY[requiredPlan] || 0;

  return currentLevel >= requiredLevel;
}

export async function checkFeatureAccess(featureKey: FeatureKey): Promise<FeatureAccess> {
  await loadPlanCache();

  const allowed = await hasFeature(featureKey);
  const requiredPlan = FEATURE_REQUIREMENTS[featureKey] || null;

  const featureConfig = planCache?.features.get(featureKey);

  return {
    allowed,
    requiredPlan: allowed ? null : requiredPlan,
    limit: featureConfig?.limit,
  };
}

export async function getFeatureLimit(featureKey: string): Promise<number | null> {
  await loadPlanCache();
  const featureConfig = planCache?.features.get(featureKey);
  return featureConfig?.limit ?? null;
}

// ============ USAGE LIMITS ============

export async function checkUsageLimit(limitKey: UsageLimitKey): Promise<UsageLimit> {
  const tenantId = localStorage.getItem('tenant_id');
  if (!tenantId) {
    return { allowed: true, current: 0, limit: null, percentage: 0, remaining: null };
  }

  await loadPlanCache();

  let current = 0;
  let limit: number | null = null;

  switch (limitKey) {
    case 'max_users': {
      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('is_active', true);
      current = count || 0;
      limit = planCache?.features.get('max_users')?.limit ?? null;
      break;
    }

    case 'max_cases_per_month': {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { count } = await supabase
        .from('cases')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('created_at', startOfMonth.toISOString());
      current = count || 0;
      limit = planCache?.features.get('max_cases_per_month')?.limit ?? null;
      break;
    }

    case 'max_storage_gb': {
      const { data: storageBytes } = await supabase.rpc('get_tenant_storage_bytes', {
        p_tenant_id: tenantId,
      });
      current = Math.round((storageBytes || 0) / (1024 * 1024 * 1024) * 100) / 100;
      limit = planCache?.features.get('storage_gb')?.limit ?? null;
      break;
    }

    case 'max_branches': {
      const { count } = await supabase
        .from('branches')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .is('deleted_at', null);
      current = count || 0;

      const branchLimit = planCache?.features.get('multi_branch');
      limit = branchLimit?.limit || null;
      break;
    }
  }

  const percentage = limit ? Math.round((current / limit) * 100) : 0;
  const remaining = limit ? Math.max(0, limit - current) : null;

  return {
    allowed: limit === null || current < limit,
    current,
    limit,
    percentage,
    remaining,
  };
}

export async function canPerformAction(
  limitKey: UsageLimitKey,
  additionalCount: number = 1
): Promise<{ allowed: boolean; message?: string }> {
  const usage = await checkUsageLimit(limitKey);

  if (usage.limit === null) {
    return { allowed: true };
  }

  if (usage.current + additionalCount > usage.limit) {
    const limitNames: Record<UsageLimitKey, string> = {
      max_users: 'team members',
      max_cases_per_month: 'cases this month',
      max_storage_gb: 'storage',
      max_branches: 'branches',
    };

    return {
      allowed: false,
      message: `You've reached your plan's limit of ${usage.limit} ${limitNames[limitKey]}. Please upgrade to add more.`,
    };
  }

  if (usage.percentage >= 80 && usage.percentage < 100) {
    return {
      allowed: true,
      message: `You're using ${usage.percentage}% of your ${limitKey.replace('max_', '').replace('_', ' ')} limit.`,
    };
  }

  return { allowed: true };
}

// ============ BULK CHECKS ============

export async function checkMultipleFeatures(
  featureKeys: FeatureKey[]
): Promise<Record<FeatureKey, boolean>> {
  await loadPlanCache();

  const result: Record<string, boolean> = {};
  for (const key of featureKeys) {
    result[key] = await hasFeature(key);
  }
  return result as Record<FeatureKey, boolean>;
}

export async function getAllUsageLimits(): Promise<Record<UsageLimitKey, UsageLimit>> {
  const limits: UsageLimitKey[] = [
    'max_users',
    'max_cases_per_month',
    'max_storage_gb',
    'max_branches',
  ];

  const result: Record<string, UsageLimit> = {};
  for (const key of limits) {
    result[key] = await checkUsageLimit(key);
  }
  return result as Record<UsageLimitKey, UsageLimit>;
}

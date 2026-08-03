import { describe, it, expect, vi, beforeEach } from 'vitest';

const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { from, rpc } }));
vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

import { checkUsageLimit, clearPlanCache, getCurrentPlanCode, hasFeature } from './featureGateService';

/** Thenable count query builder that records whether the soft-delete filter was applied. */
function makeCountQuery(count: number) {
  const calls: { deletedAtFiltered: boolean } = { deletedAtFiltered: false };
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    is: vi.fn((col: string, val: unknown) => {
      if (col === 'deleted_at' && val === null) calls.deletedAtFiltered = true;
      return builder;
    }),
    then: (resolve: (v: { count: number; error: null }) => void) =>
      resolve({ count, error: null }),
  };
  return { builder, calls };
}

beforeEach(() => {
  from.mockReset();
  rpc.mockReset();
  clearPlanCache();
  localStorage.setItem('tenant_id', 'tenant-1');
});

/** Subscription lookup ends in maybeSingle(); plan_features is a plain thenable. */
function makeSubQuery(result: unknown) {
  const q: Record<string, unknown> = {
    select: vi.fn(() => q),
    eq: vi.fn(() => q),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  };
  return q;
}

function makeFeaturesQuery(result: unknown) {
  const q: Record<string, unknown> = {
    select: vi.fn(() => q),
    eq: vi.fn(() => q),
    then: (resolve: (v: unknown) => void) => resolve(result),
  };
  return q;
}

const ENTERPRISE_SUB = {
  data: { plan_id: 'p1', subscription_plans: { id: 'p1', code: 'enterprise' } },
  error: null,
};

describe('loadPlanCache does not cache a failed read', () => {
  it('retries instead of caching a fabricated starter plan when the subscription read fails', async () => {
    from.mockReturnValueOnce(makeSubQuery({ data: null, error: { message: 'permission denied' } }));
    expect(await getCurrentPlanCode()).toBe('starter');

    // The failure must NOT have been cached for the TTL — the next call re-queries
    // and sees the tenant's real plan.
    from
      .mockReturnValueOnce(makeSubQuery(ENTERPRISE_SUB))
      .mockReturnValueOnce(makeFeaturesQuery({ data: [], error: null }));

    expect(await getCurrentPlanCode()).toBe('enterprise');
  });

  it('retries instead of caching an empty feature map when the plan_features read fails', async () => {
    from
      .mockReturnValueOnce(makeSubQuery(ENTERPRISE_SUB))
      .mockReturnValueOnce(makeFeaturesQuery({ data: null, error: { message: 'boom' } }));

    expect(await hasFeature('sso')).toBe(false);

    from
      .mockReturnValueOnce(makeSubQuery(ENTERPRISE_SUB))
      .mockReturnValueOnce(
        makeFeaturesQuery({ data: [{ feature_key: 'sso', is_enabled: true, limit_value: null }], error: null })
      );

    expect(await hasFeature('sso')).toBe(true);
  });
});

describe('checkUsageLimit soft-delete filtering', () => {
  it('excludes soft-deleted cases from the monthly quota count', async () => {
    // First from() = tenant_subscriptions (loadPlanCache); return no subscription.
    const subQuery: Record<string, unknown> = {
      select: vi.fn(() => subQuery),
      eq: vi.fn(() => subQuery),
      maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
    };
    const cases = makeCountQuery(40);
    from.mockReturnValueOnce(subQuery).mockReturnValueOnce(cases.builder);

    await checkUsageLimit('max_cases_per_month');

    expect(from).toHaveBeenCalledWith('cases');
    expect(cases.calls.deletedAtFiltered).toBe(true);
  });

  it('excludes soft-deleted expenses from the monthly quota count', async () => {
    const subQuery: Record<string, unknown> = {
      select: vi.fn(() => subQuery),
      eq: vi.fn(() => subQuery),
      maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
    };
    const expenses = makeCountQuery(10);
    from.mockReturnValueOnce(subQuery).mockReturnValueOnce(expenses.builder);

    await checkUsageLimit('max_expenses_per_month');

    expect(from).toHaveBeenCalledWith('expenses');
    expect(expenses.calls.deletedAtFiltered).toBe(true);
  });
});

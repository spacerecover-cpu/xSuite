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

import { checkUsageLimit, clearPlanCache } from './featureGateService';

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

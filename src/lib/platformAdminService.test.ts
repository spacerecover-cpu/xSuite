import { describe, it, expect, vi, beforeEach } from 'vitest';

// calculateHealthScore / recordHealthMetrics aggregate payments.amount across a
// 30-day window; mock the client (env-throwing on import) and feed mixed-currency
// rows so the assertions prove base-currency summation, never the raw native sum.
const { from, insert } = vi.hoisted(() => ({ from: vi.fn(), insert: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { from } }));
vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import {
  calculateHealthScore,
  recordHealthMetrics,
  getTenantDetails,
  getDashboardStats,
} from './platformAdminService';

/**
 * Thenable, count-aware query builder. select/eq/gte/in/is are chainable; awaiting
 * it yields {data, count}. A head/count query resolves {count}; a row query resolves
 * the provided rows.
 */
function makeQuery(result: { data?: Array<Record<string, unknown>>; count?: number }) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    in: vi.fn(() => builder),
    is: vi.fn(() => builder),
    then: (resolve: (v: { data: unknown; count: number | null; error: null }) => void) =>
      resolve({ data: result.data ?? null, count: result.count ?? null, error: null }),
  };
  return builder;
}

const MIXED_PAYMENTS = [
  { amount: 100, amount_base: 38, status: 'completed', payment_date: '2020-01-01' },
  { amount: 50, amount_base: 50, status: 'completed', payment_date: '2020-01-01' },
];

beforeEach(() => {
  from.mockReset();
  insert.mockReset();
});

/** Route every `from(table)` to a table-appropriate builder; capture the payments builder. */
function wireFrom(paymentsRows: Array<Record<string, unknown>>) {
  const paymentsQuery = makeQuery({ data: paymentsRows });
  from.mockImplementation((table: string) => {
    switch (table) {
      case 'payments':
        return paymentsQuery;
      case 'profiles':
        return makeQuery({ data: [], count: 0 });
      case 'user_activity_sessions':
        return makeQuery({ data: [] });
      case 'cases':
      case 'support_tickets':
        return makeQuery({ count: 0 });
      case 'tenant_health_metrics':
        return { insert } as unknown as Record<string, unknown>;
      default:
        return makeQuery({ data: [], count: 0 });
    }
  });
  return paymentsQuery;
}

describe('calculateHealthScore (D — payments revenue must be base currency)', () => {
  it('sums amount_base across mixed-currency payments, never the raw native amount', async () => {
    const paymentsQuery = wireFrom(MIXED_PAYMENTS);

    // base total 88 (38 + 50) is non-zero, so the revenue penalty is NOT applied.
    // A raw native sum would be 150 — also non-zero — so the score is identical
    // either way; the proof is the .select carrying the base column.
    await calculateHealthScore('tenant-1');

    expect(paymentsQuery.select).toHaveBeenCalledWith(expect.stringContaining('amount_base'));
  });
});

describe('recordHealthMetrics (D — revenue_last_30d persisted must be base currency)', () => {
  it('persists the base-currency sum (88), never the raw native sum (150)', async () => {
    const paymentsQuery = wireFrom(MIXED_PAYMENTS);

    await recordHealthMetrics('tenant-1');

    expect(paymentsQuery.select).toHaveBeenCalledWith(expect.stringContaining('amount_base'));
    expect(insert).toHaveBeenCalledTimes(1);
    const persisted = insert.mock.calls[0][0] as { revenue_last_30d: number };
    expect(persisted.revenue_last_30d).toBe(88);
  });
});

/**
 * Regression for bugs 60/61/62 — tenant-scoping leaks. Platform admins bypass the
 * RESTRICTIVE tenant-isolation RLS (tenant_id = get_current_tenant_id() OR
 * is_platform_admin()), so every per-tenant aggregate query MUST carry an explicit
 * .eq('tenant_id', tenantId). Before the fix the cases / payments /
 * user_activity_sessions queries omitted it and returned platform-wide totals,
 * inflating caseCount, health score, and persisted health metrics for every tenant.
 */
function makeScopedQuery(result: {
  data?: Array<Record<string, unknown>>;
  count?: number;
  single?: Record<string, unknown> | null;
}) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    in: vi.fn(() => builder),
    is: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(() =>
      Promise.resolve({ data: result.single ?? null, count: result.count ?? null, error: null }),
    ),
    then: (resolve: (v: { data: unknown; count: number | null; error: null }) => void) =>
      resolve({ data: result.data ?? null, count: result.count ?? null, error: null }),
  };
  return builder;
}

/** Route every from(table) to a builder and capture each builder keyed by table name. */
function wireCapturing() {
  const byTable: Record<string, Array<Record<string, unknown>>> = {};
  from.mockImplementation((table: string) => {
    let query: Record<string, unknown>;
    switch (table) {
      case 'tenants':
        query = makeScopedQuery({ single: { id: 'tenant-1', name: 'A' } });
        break;
      case 'profiles':
        query = makeScopedQuery({ data: [], count: 0 });
        break;
      case 'payments':
      case 'user_activity_sessions':
        query = makeScopedQuery({ data: [] });
        break;
      case 'tenant_health_metrics':
        query = Object.assign(makeScopedQuery({ single: null }), { insert });
        break;
      default:
        // cases, support_tickets, tenant_subscriptions — head/count or maybeSingle
        query = makeScopedQuery({ count: 0, single: null });
    }
    (byTable[table] ||= []).push(query);
    return query;
  });
  return byTable;
}

function expectAllScoped(builders: Array<Record<string, unknown>> | undefined, tenantId: string) {
  expect(builders && builders.length).toBeTruthy();
  for (const q of builders ?? []) {
    expect(q.eq).toHaveBeenCalledWith('tenant_id', tenantId);
  }
}

/**
 * Regression for bug 13 — MRR/ARR billing_interval value mismatch. tenant_subscriptions.
 * billing_interval is CHECK-constrained to 'month'|'year' (never 'monthly'/'annual'), so the
 * old literals matched zero rows and mrr/arr collapsed to $0. The mrr query must filter on
 * 'month' and the annual query on 'year' to sum any revenue at all.
 */
function makeIntervalAwareSubscriptionQuery() {
  let billingInterval: string | undefined;
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn((col: string, val: string) => {
      if (col === 'billing_interval') billingInterval = val;
      return builder;
    }),
    gte: vi.fn(() => builder),
    in: vi.fn(() => builder),
    is: vi.fn(() => builder),
    then: (resolve: (v: { data: unknown; count: number | null; error: null }) => void) => {
      let data: Array<Record<string, unknown>>;
      if (billingInterval === 'month') {
        data = [{ subscription_plans: { price_monthly: 100 } }];
      } else if (billingInterval === 'year') {
        data = [{ subscription_plans: { price_yearly: 1200 } }];
      } else if (billingInterval !== undefined) {
        data = []; // non-canonical literal (e.g. 'monthly'/'annual') matches nothing, like the DB
      } else {
        data = [{ status: 'active' }, { status: 'active' }, { status: 'trialing' }];
      }
      resolve({ data, count: null, error: null });
    },
  };
  return builder;
}

describe('getDashboardStats (bug 13 — billing_interval must be month/year, not monthly/annual)', () => {
  it('sums monthly + annualized revenue instead of collapsing MRR/ARR to $0', async () => {
    from.mockImplementation((table: string) => {
      if (table === 'tenant_subscriptions') return makeIntervalAwareSubscriptionQuery();
      return makeQuery({ data: [], count: 0 });
    });

    const stats = await getDashboardStats();

    // price_monthly 100 + price_yearly 1200/12 (100) = mrr 200; arr = 200 * 12 = 2400.
    expect(stats.mrr).toBe(200);
    expect(stats.arr).toBe(2400);
  });
});

describe('tenant scoping (bugs 60/61/62 — platform admin bypasses RLS)', () => {
  it('getTenantDetails scopes the cases count to the tenant', async () => {
    const byTable = wireCapturing();
    await getTenantDetails('tenant-1');
    expectAllScoped(byTable['cases'], 'tenant-1');
  });

  it('calculateHealthScore scopes cases, payments and activity sessions to the tenant', async () => {
    const byTable = wireCapturing();
    await calculateHealthScore('tenant-1');
    expectAllScoped(byTable['cases'], 'tenant-1');
    expectAllScoped(byTable['payments'], 'tenant-1');
    expectAllScoped(byTable['user_activity_sessions'], 'tenant-1');
  });

  it('recordHealthMetrics scopes every cases and payments query to the tenant', async () => {
    const byTable = wireCapturing();
    await recordHealthMetrics('tenant-1');
    expectAllScoped(byTable['cases'], 'tenant-1');
    expectAllScoped(byTable['payments'], 'tenant-1');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

// calculateHealthScore / recordHealthMetrics aggregate payments.amount across a
// 30-day window; mock the client (env-throwing on import) and feed mixed-currency
// rows so the assertions prove base-currency summation, never the raw native sum.
const { from, insert } = vi.hoisted(() => ({ from: vi.fn(), insert: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { from } }));
vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { calculateHealthScore, recordHealthMetrics } from './platformAdminService';

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

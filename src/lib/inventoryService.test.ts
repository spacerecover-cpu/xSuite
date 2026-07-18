import { describe, it, expect, vi, beforeEach } from 'vitest';

// inventoryService imports supabaseClient (env-throwing on import) + the sanitizer;
// mock both so the module loads. fetchAllInventoryItemsForLabels drives the real
// getInventoryItemsPage against a paged supabase-`from` mock (bare intra-module
// function calls can't be spied via the namespace — see payrollService's object).
const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('./supabaseClient', () => ({
  supabase: { from },
  getTenantId: () => 'tenant-1',
}));
vi.mock('./postgrestSanitizer', () => ({ sanitizeFilterValue: (v: string) => v }));

import { fetchAllInventoryItemsForLabels, MAX_BULK_LABEL_ITEMS } from './inventoryService';

/** A stock/inventory list query whose terminal `.range()` resolves one page.
 *  Rows carry no `model`, so enrichItemsWithStockCount short-circuits (no 2nd query). */
function makePagedQuery(rows: Array<Record<string, unknown>>, count: number) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    is: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    or: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    range: vi.fn(() => Promise.resolve({ data: rows, count, error: null })),
  };
  return builder;
}

beforeEach(() => from.mockReset());

describe('fetchAllInventoryItemsForLabels', () => {
  it('pages through all matching items until total', async () => {
    from
      .mockReturnValueOnce(makePagedQuery(new Array(200).fill({ id: 'x' }), 350))
      .mockReturnValueOnce(makePagedQuery(new Array(150).fill({ id: 'y' }), 350));
    const { items, truncated } = await fetchAllInventoryItemsForLabels({});
    expect(items).toHaveLength(350);
    expect(truncated).toBe(false);
    expect(from).toHaveBeenCalledTimes(2);
  });

  it('stops at MAX_BULK_LABEL_ITEMS and marks the set truncated', async () => {
    // total (10000) far exceeds the cap; every page is full so the loop only stops
    // once items reach the cap.
    from.mockImplementation(() => makePagedQuery(new Array(200).fill({ id: 'z' }), 10000));
    const { items, truncated } = await fetchAllInventoryItemsForLabels({});
    expect(items).toHaveLength(MAX_BULK_LABEL_ITEMS);
    expect(truncated).toBe(true);
    expect(from).toHaveBeenCalledTimes(MAX_BULK_LABEL_ITEMS / 200);
  });
});

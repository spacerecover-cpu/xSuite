import { describe, it, expect, vi, beforeEach } from 'vitest';

const fromMock = vi.fn();
vi.mock('./supabaseClient', () => ({ supabase: { from: (...a: unknown[]) => fromMock(...a) } }));

import { getChecklists, getChecklist, getChecklistItems } from './employeeOnboardingService';

/** Chainable, thenable builder that records every method call made against it. */
function recordingBuilder(result: { data: unknown; error: unknown }) {
  const calls: { method: string; args: unknown[] }[] = [];
  const b: Record<string, unknown> = { calls };
  for (const m of ['select', 'eq', 'is', 'order', 'insert', 'update']) {
    b[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return b;
    };
  }
  b.maybeSingle = () => Promise.resolve(result);
  b.then = (onFulfilled: (r: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled);
  return b as Record<string, unknown> & { calls: typeof calls };
}

describe('getChecklistItems ordering', () => {
  beforeEach(() => fromMock.mockReset());

  it('orders by the real sort_order column (not the non-existent order_index)', async () => {
    const b = recordingBuilder({ data: [], error: null });
    fromMock.mockReturnValue(b);
    await getChecklistItems('cl-1');
    const orderCalls = b.calls.filter((c) => c.method === 'order');
    expect(orderCalls).toHaveLength(1);
    expect(orderCalls[0].args[0]).toBe('sort_order');
    expect(b.calls.some((c) => c.method === 'order' && c.args[0] === 'order_index')).toBe(false);
  });
});

describe('soft-delete filtering on checklist reads', () => {
  beforeEach(() => fromMock.mockReset());

  it('getChecklists filters deleted checklists and deleted embedded items', async () => {
    const b = recordingBuilder({ data: [], error: null });
    fromMock.mockReturnValue(b);
    await getChecklists();
    const isCols = b.calls.filter((c) => c.method === 'is').map((c) => c.args[0]);
    expect(isCols).toContain('deleted_at');
    expect(isCols).toContain('onboarding_checklist_items.deleted_at');
  });

  it('getChecklist filters deleted checklist and deleted embedded items', async () => {
    const b = recordingBuilder({ data: null, error: null });
    fromMock.mockReturnValue(b);
    await getChecklist('cl-1');
    const isCols = b.calls.filter((c) => c.method === 'is').map((c) => c.args[0]);
    expect(isCols).toContain('deleted_at');
    expect(isCols).toContain('onboarding_checklist_items.deleted_at');
  });
});

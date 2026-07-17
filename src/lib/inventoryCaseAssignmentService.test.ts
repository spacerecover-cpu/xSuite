import { describe, it, expect, vi, beforeEach } from 'vitest';

// The service imports supabaseClient at module load (env-throwing in the test
// runner); mock it and feed builders per table/RPC. These tests lock the
// mark-as-defective disposition writes.
const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { from, rpc } }));
vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { markAssignmentAsDefective } from './inventoryCaseAssignmentService';

/** Thenable builder: chainable ops return self; maybeSingle/await resolve `result`. */
function makeBuilder(result: { data: unknown; error: unknown }, captured?: (payload: unknown) => void) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    in: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    order: vi.fn(() => builder),
    update: vi.fn((payload: unknown) => {
      captured?.(payload);
      return builder;
    }),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (v: unknown) => void) => resolve(result),
  };
  return builder;
}

const assignmentRow = {
  id: 'ASSIGN1',
  item_id: 'ITEM1',
  case_id: 'CASE1',
  assigned_at: '2026-07-01T00:00:00Z',
  assigned_by: null,
  returned_at: '2026-07-02T00:00:00Z',
  purpose: null,
  notes: '[defective] heads failed',
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-02T00:00:00Z',
  tenant_id: 'T1',
  deleted_at: null,
};

describe('markAssignmentAsDefective', () => {
  beforeEach(() => {
    from.mockReset();
    rpc.mockReset();
  });

  it('writes BOTH the Defective status AND the Damaged condition to the released item', async () => {
    rpc.mockResolvedValue({ data: { item_id: 'ITEM1' }, error: null });

    let updatePayload: unknown = null;
    from.mockImplementation((table: string) => {
      if (table === 'master_inventory_status_types')
        return makeBuilder({ data: { id: 'STATUS_DEF' }, error: null });
      if (table === 'master_inventory_condition_types')
        return makeBuilder({ data: { id: 'COND_DAMAGED' }, error: null });
      if (table === 'inventory_items')
        return makeBuilder({ data: null, error: null }, (p) => { updatePayload = p; });
      if (table === 'inventory_case_assignments')
        return makeBuilder({ data: assignmentRow, error: null });
      // profiles never queried (assigned_by is null)
      return makeBuilder({ data: [], error: null });
    });

    await markAssignmentAsDefective('ASSIGN1', 'heads failed');

    // The modal promises the condition is set to "Damaged" — it must be written.
    expect(updatePayload).toEqual(
      expect.objectContaining({ status_id: 'STATUS_DEF', condition_id: 'COND_DAMAGED' }),
    );
    // The Damaged condition must actually be resolved from the catalog.
    expect(from).toHaveBeenCalledWith('master_inventory_condition_types');
  });
});

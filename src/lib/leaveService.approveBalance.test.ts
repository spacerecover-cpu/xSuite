import { describe, it, expect, vi, beforeEach } from 'vitest';

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { from, rpc: vi.fn() } }));
vi.mock('./tenantToday', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./tenantToday')>()),
  currentTenantToday: () => Promise.resolve('2026-03-05'),
}));

import { leaveService } from './leaveService';

type Result = { data: unknown; error: unknown };

// Chainable stub: every builder method returns itself; the chain resolves to
// `result` both via maybeSingle() and via a bare await (adjustLeaveBalanceUsage
// awaits the update chain directly).
function builder(result: Result) {
  const b: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'is', 'order', 'update']) {
    b[method] = vi.fn(() => b);
  }
  b.maybeSingle = vi.fn(() => Promise.resolve(result));
  b.then = (resolve: (v: Result) => unknown) => Promise.resolve(result).then(resolve);
  return b;
}

beforeEach(() => from.mockReset());

const pendingRequest = {
  employee_id: 'e1',
  leave_type_id: 'lt1',
  days: 10,
  start_date: '2026-03-01',
  status: 'pending',
};

describe('leaveService.approveLeaveRequest balance guard', () => {
  it('refuses to approve a request that exceeds the remaining balance', async () => {
    const requestBuilder = builder({ data: pendingRequest, error: null });
    const balanceBuilder = builder({ data: { id: 'lb1', total_days: 10, used_days: 8 }, error: null });
    from.mockImplementation((table: string) =>
      table === 'leave_requests' ? requestBuilder : balanceBuilder,
    );

    await expect(leaveService.approveLeaveRequest('req-1', 'user-1')).rejects.toThrow(
      /Insufficient leave balance/,
    );
    // The request must stay pending — no status write was attempted.
    expect(requestBuilder.update).not.toHaveBeenCalled();
  });

  it('approves and consumes balance when the remaining days cover the request', async () => {
    const requestBuilder = builder({ data: { ...pendingRequest, days: 2, id: 'req-2' }, error: null });
    const balanceBuilder = builder({ data: { id: 'lb1', total_days: 10, used_days: 8 }, error: null });
    from.mockImplementation((table: string) =>
      table === 'leave_requests' ? requestBuilder : balanceBuilder,
    );

    await leaveService.approveLeaveRequest('req-2', 'user-1');

    expect(requestBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved', reviewed_by: 'user-1' }),
    );
    expect(balanceBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ used_days: 10, remaining_days: 0 }),
    );
  });

  it('leaves an unallocated leave type unmetered', async () => {
    const requestBuilder = builder({ data: pendingRequest, error: null });
    const balanceBuilder = builder({ data: null, error: null });
    from.mockImplementation((table: string) =>
      table === 'leave_requests' ? requestBuilder : balanceBuilder,
    );

    await leaveService.approveLeaveRequest('req-3', 'user-1');

    expect(requestBuilder.update).toHaveBeenCalled();
    expect(balanceBuilder.update).not.toHaveBeenCalled();
  });
});

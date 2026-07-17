import { describe, it, expect, vi, beforeEach } from 'vitest';
const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { rpc, from } }));
import { leaveService } from './leaveService';

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
});

describe('leaveService.upsertLeaveBalance', () => {
  it('uses the full unique-constraint conflict target and stamps tenant_id', async () => {
    rpc.mockResolvedValue({ data: 'ten-1', error: null });
    const upsert = vi.fn(() => ({
      select: () => ({
        maybeSingle: () => Promise.resolve({ data: { id: 'lb1' }, error: null }),
      }),
    }));
    from.mockReturnValue({ upsert });

    await leaveService.upsertLeaveBalance({
      employee_id: 'e1',
      leave_type_id: 'lt1',
      year: 2026,
      total_days: 30,
    } as never);

    expect(from).toHaveBeenCalledWith('leave_balances');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: 'ten-1', employee_id: 'e1' }),
      { onConflict: 'tenant_id,employee_id,leave_type_id,year' },
    );
  });

  it('honors a tenant_id already present on the payload', async () => {
    const upsert = vi.fn(() => ({
      select: () => ({
        maybeSingle: () => Promise.resolve({ data: { id: 'lb2' }, error: null }),
      }),
    }));
    from.mockReturnValue({ upsert });

    await leaveService.upsertLeaveBalance({
      tenant_id: 'ten-explicit',
      employee_id: 'e2',
      leave_type_id: 'lt2',
      year: 2026,
    } as never);

    expect(rpc).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: 'ten-explicit' }),
      { onConflict: 'tenant_id,employee_id,leave_type_id,year' },
    );
  });
});

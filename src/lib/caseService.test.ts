import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { rpc, from } }));
vi.mock('./logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('./rateLimiter', () => ({
  checkRateLimit: () => ({ allowed: true }),
  RATE_LIMITS: { CASE_DELETION: {} },
}));

import { duplicateCase, getNextCaseNumber, deleteCaseService } from './caseService';

function mockCasesInsert(newCase: Record<string, unknown>) {
  const chain: Record<string, unknown> = {};
  chain.insert = vi.fn(() => chain);
  chain.select = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: newCase, error: null }));
  return chain;
}

const devicesStub = () => ({ insert: vi.fn(() => Promise.resolve({ error: null })) });

// getIntakeStatusForCreation() resolves the active intake statuses; the
// creation paths stamp the LAST one (Device Received) onto the new case.
function mockIntakeStatuses() {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() =>
    Promise.resolve({
      data: [
        { id: 'st-registered', name: 'Registered' },
        { id: 'st-received', name: 'Device Received' },
      ],
      error: null,
    }),
  );
  return chain;
}

function routeTables(casesChain: Record<string, unknown>) {
  return (table: string) => {
    if (table === 'cases') return casesChain;
    if (table === 'master_case_statuses') return mockIntakeStatuses();
    return devicesStub();
  };
}

describe('duplicateCase — case number sourcing', () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
  });

  it('reserves the next number from the canonical `case` scope (not the legacy `cases` wrapper)', async () => {
    rpc.mockResolvedValue({ data: 'C-0020', error: null });
    const casesChain = mockCasesInsert({ id: 'new-1', case_number: 'C-0020' });
    from.mockImplementation(routeTables(casesChain));

    const result = await duplicateCase(
      { customer_id: 'c1', priority: 'high', title: 'X' },
      [],
      { id: 'u1', tenantId: 't1' },
    );

    expect(rpc).toHaveBeenCalledWith('get_next_number', { p_scope: 'case' });
    expect(rpc).not.toHaveBeenCalledWith('get_next_case_number');
    expect(casesChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        case_number: 'C-0020',
        tenant_id: 't1',
        status: 'Device Received',
        status_id: 'st-received',
      }),
    );
    expect(result.case_number).toBe('C-0020');
  });

  it('reuses a pre-reserved case number when one is passed (no extra RPC)', async () => {
    const casesChain = mockCasesInsert({ id: 'new-2', case_number: 'C-0099' });
    from.mockImplementation(routeTables(casesChain));

    await duplicateCase({ customer_id: 'c1' }, [], { id: 'u1', tenantId: 't1' }, 'C-0099');

    expect(rpc).not.toHaveBeenCalled();
    expect(casesChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ case_number: 'C-0099' }),
    );
  });

  it('getNextCaseNumber() reads from get_next_number(case)', async () => {
    rpc.mockResolvedValue({ data: 'C-0021', error: null });
    await expect(getNextCaseNumber()).resolves.toBe('C-0021');
    expect(rpc).toHaveBeenCalledWith('get_next_number', { p_scope: 'case' });
  });
});

describe('duplicateCase — orphan rollback on device insert failure', () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
  });

  it('soft-deletes the just-created case when the devices insert fails', async () => {
    const casesChain: Record<string, unknown> = {};
    casesChain.insert = vi.fn(() => casesChain);
    casesChain.select = vi.fn(() => casesChain);
    casesChain.maybeSingle = vi.fn(() =>
      Promise.resolve({ data: { id: 'new-9', case_number: 'C-0030' }, error: null }),
    );
    const rollbackUpdate = vi.fn(() => ({ eq: rollbackEq }));
    const rollbackEq = vi.fn(() => Promise.resolve({ error: null }));
    casesChain.update = rollbackUpdate;

    const failingDevices = { insert: vi.fn(() => Promise.resolve({ error: { message: 'boom' } })) };

    from.mockImplementation((table: string) => {
      if (table === 'cases') return casesChain;
      if (table === 'master_case_statuses') return mockIntakeStatuses();
      return failingDevices;
    });

    await expect(
      duplicateCase({ customer_id: 'c1' }, [{ id: 'd1', model: 'X' }], { id: 'u1', tenantId: 't1' }, 'C-0030'),
    ).rejects.toThrow(/Failed to duplicate devices/);

    expect(rollbackUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) }),
    );
    expect(rollbackEq).toHaveBeenCalledWith('id', 'new-9');
  });
});

describe('deleteCaseService — void RPC contract', () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
  });

  it('resolves with the case number when delete_case_permanently returns void (null data)', async () => {
    const casesSelect: Record<string, unknown> = {};
    casesSelect.select = vi.fn(() => casesSelect);
    casesSelect.eq = vi.fn(() => casesSelect);
    casesSelect.maybeSingle = vi.fn(() =>
      Promise.resolve({ data: { case_number: 'C-0042', subject: 'RAID job' }, error: null }),
    );
    from.mockImplementation((table: string) => (table === 'cases' ? casesSelect : {}));
    rpc.mockResolvedValue({ data: null, error: null });

    const result = await deleteCaseService('case-1');

    expect(rpc).toHaveBeenCalledWith('delete_case_permanently', { p_case_id: 'case-1' });
    expect(result.success).toBe(true);
    expect(result.case_number).toBe('C-0042');
    expect(result.case_title).toBe('RAID job');
  });

  it('still throws when the RPC reports an error', async () => {
    const casesSelect: Record<string, unknown> = {};
    casesSelect.select = vi.fn(() => casesSelect);
    casesSelect.eq = vi.fn(() => casesSelect);
    casesSelect.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    from.mockImplementation(() => casesSelect);
    rpc.mockResolvedValue({ data: null, error: { message: 'RLS denied' } });

    await expect(deleteCaseService('case-1')).rejects.toThrow(/RLS denied/);
  });
});

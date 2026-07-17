import { describe, it, expect, vi, beforeEach } from 'vitest';

// initiateCustodyTransfer inserts the transfer row, then writes the
// CUSTODY_TRANSFER_INITIATED ledger event in a separate round-trip. If the
// ledger write fails AFTER the transfer row is committed, the function must not
// re-throw — re-throwing invites the operator to retry and insert a second
// pending transfer into the client-append-only table. Mock supabase and force
// the ledger RPC to fail.
const { from, rpc, getUser } = vi.hoisted(() => ({
  from: vi.fn(), rpc: vi.fn(), getUser: vi.fn(),
}));
vi.mock('./supabaseClient', () => ({ supabase: { from, rpc, auth: { getUser } } }));
vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { initiateCustodyTransfer } from './chainOfCustodyService';

/** transfers insert builder: insert/select chain; maybeSingle yields the row. */
function makeTransferInsert(row: Record<string, unknown>) {
  const builder: Record<string, unknown> = {
    insert: vi.fn(() => builder),
    select: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve({ data: row, error: null })),
  };
  return builder;
}

beforeEach(() => {
  from.mockReset();
  rpc.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
});

describe('initiateCustodyTransfer (ledger failure must not invite a duplicate transfer)', () => {
  const baseParams = {
    caseId: 'case-1',
    transferReason: 'shipment',
    fromCustodianName: 'Alice',
    toCustodianId: 'cust-2',
    toCustodianName: 'Bob',
  };

  it('resolves with the committed transfer even when the ledger RPC fails', async () => {
    from.mockReturnValue(makeTransferInsert({ id: 'transfer-1', case_id: 'case-1' }));
    // log_chain_of_custody RPC rejects (transient failure after the insert committed).
    rpc.mockResolvedValue({ data: null, error: { message: 'ledger write failed' } });

    const result = await initiateCustodyTransfer(baseParams);

    expect(result.id).toBe('transfer-1');
    // Exactly one transfer row was inserted — no throw means no retry/duplicate.
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('still writes the ledger event on the happy path', async () => {
    from.mockReturnValue(makeTransferInsert({ id: 'transfer-2', case_id: 'case-1' }));
    rpc.mockResolvedValue({ data: 'coc-1', error: null });

    await initiateCustodyTransfer(baseParams);

    expect(rpc).toHaveBeenCalledWith(
      'log_chain_of_custody',
      expect.objectContaining({ p_action: 'CUSTODY_TRANSFER_INITIATED' }),
    );
  });
});

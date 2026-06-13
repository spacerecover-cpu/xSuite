import { describe, it, expect, vi, beforeEach } from 'vitest';
const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { rpc, from } }));
vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
import { issueCreditNote, applyCreditNote, voidCreditNote } from './creditNoteService';

beforeEach(() => { rpc.mockReset(); from.mockReset(); });

describe('creditNoteService', () => {
  it('issueCreditNote calls issue_credit_note and returns the row', async () => {
    rpc.mockResolvedValue({ data: { id: 'cn1', credit_note_number: 'CRED-0001' }, error: null });
    const out = await issueCreditNote(
      { invoice_id: 'i1', credit_type: 'adjustment', currency: 'OMR', total_amount: 10, tax_amount: 0, reason_code: 'discount' },
      [],
    );
    expect(rpc).toHaveBeenCalledWith('issue_credit_note', { p_cn: expect.objectContaining({ invoice_id: 'i1' }), p_items: [] });
    expect(out.credit_note_number).toBe('CRED-0001');
  });

  it('applyCreditNote forwards allocations', async () => {
    rpc.mockResolvedValue({ data: { id: 'cn1', applied_amount: 10 }, error: null });
    await applyCreditNote('cn1', [{ invoice_id: 'i1', amount: 10 }]);
    expect(rpc).toHaveBeenCalledWith('apply_credit_note', { p_credit_note_id: 'cn1', p_allocations: [{ invoice_id: 'i1', amount: 10 }] });
  });

  it('voidCreditNote requires a reason and throws on RPC error', async () => {
    await expect(voidCreditNote('cn1', '   ')).rejects.toThrow(/reason/i);
    rpc.mockResolvedValue({ data: null, error: { message: 'refunded credit cannot be voided' } });
    await expect(voidCreditNote('cn1', 'mistake')).rejects.toThrow('refunded credit cannot be voided');
  });
});

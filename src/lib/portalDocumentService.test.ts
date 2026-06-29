import { describe, it, expect, vi, beforeEach } from 'vitest';
const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { from, rpc } }));
vi.mock('./logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('./portalVisibility', () => ({
  fetchPortalVisibility: vi.fn(async () => [{ case_id: 'c1', visible_fields: ['show_documents'], custom_message: null }]),
  getCaseIdsWithFlag: vi.fn(() => ['c1']),
}));
vi.mock('./documentInstanceService', () => ({ getDocumentPdfSignedUrl: vi.fn(async () => 'https://signed/x.pdf') }));

import { fetchPortalDocuments, portalSignOffDocument } from './portalDocumentService';

beforeEach(() => vi.clearAllMocks());

function listChain(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'in', 'eq', 'is', 'order']) c[m] = vi.fn(() => c);
  c.then = (r: (v: unknown) => unknown) => r({ data: rows, error: null });
  return c;
}

describe('portalDocumentService', () => {
  it('returns [] when customerId is empty (no query)', async () => {
    expect(await fetchPortalDocuments('')).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });
  it('lists delivered/signed_off documents for show_documents cases', async () => {
    from.mockReturnValue(listChain([{ id: 'd1', status: 'delivered' }]));
    const rows = await fetchPortalDocuments('cust1');
    expect(from).toHaveBeenCalledWith('document_instances');
    expect(rows).toEqual([{ id: 'd1', status: 'delivered' }]);
  });
  it('signs off via the RPC and returns the signature id', async () => {
    rpc.mockResolvedValue({ data: { ok: true, signature_id: 'sig-9' }, error: null });
    const id = await portalSignOffDocument('di-1', { method: 'typed', typedValue: 'Jane' });
    expect(rpc).toHaveBeenCalledWith('portal_sign_off_document', expect.objectContaining({ p_instance_id: 'di-1', p_method: 'typed', p_typed_value: 'Jane' }));
    expect(id).toBe('sig-9');
  });
});

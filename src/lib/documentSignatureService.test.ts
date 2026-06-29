import { describe, it, expect, vi, beforeEach } from 'vitest';

const { from, getUser } = vi.hoisted(() => ({ from: vi.fn(), getUser: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { from, auth: { getUser } } }));
vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('./fileStorageService', () => ({
  uploadSignature: vi.fn(async () => ({ success: true, filePath: 'company-assets/signatures/sig.png' })),
}));
vi.mock('./pdf/contentHash', () => ({ sha256Hex: vi.fn(async () => 'deadbeef') }));

import { captureStaffSignature } from './documentSignatureService';

function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ['insert', 'select', 'eq', 'is', 'order']) c[m] = vi.fn(() => c);
  c.maybeSingle = vi.fn(() => Promise.resolve(result));
  c.then = (r: (v: unknown) => unknown) => r(result);
  return c;
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
});

describe('captureStaffSignature', () => {
  it('uploads a drawn image, hashes it, and inserts a staff signature row', async () => {
    let inserted: Record<string, unknown> | null = null;
    from.mockImplementation((table: string) => {
      if (table === 'profiles') return chain({ data: { tenant_id: 't1' }, error: null });
      if (table === 'document_signatures') {
        const c = chain({ data: { id: 'sig-1' }, error: null });
        c.insert = vi.fn((payload: Record<string, unknown>) => { inserted = payload; return c; });
        return c;
      }
      return chain({ data: null, error: null });
    });

    const id = await captureStaffSignature({
      instanceId: 'di-1', slot: 'approver', method: 'drawn',
      signerName: 'Tech A', signerRole: 'Approver', imageBlob: new Blob(['x']),
    });

    expect(id).toBe('sig-1');
    expect(inserted).toMatchObject({
      document_instance_id: 'di-1', slot: 'approver', method: 'drawn',
      signer_user_id: 'u1', signer_name: 'Tech A', tenant_id: 't1',
      signature_image_path: 'company-assets/signatures/sig.png', signature_sha256: 'deadbeef',
    });
  });

  it('inserts a typed signature with typed_value and no upload', async () => {
    const { uploadSignature } = await import('./fileStorageService');
    let inserted: Record<string, unknown> | null = null;
    from.mockImplementation((table: string) => {
      if (table === 'profiles') return chain({ data: { tenant_id: 't1' }, error: null });
      const c = chain({ data: { id: 'sig-2' }, error: null });
      c.insert = vi.fn((p: Record<string, unknown>) => { inserted = p; return c; });
      return c;
    });
    const id = await captureStaffSignature({ instanceId: 'di-1', slot: 'approver', method: 'typed', signerName: 'Tech A', typedValue: 'Tech A' });
    expect(id).toBe('sig-2');
    expect(uploadSignature).not.toHaveBeenCalled();
    expect(inserted).toMatchObject({ method: 'typed', typed_value: 'Tech A', signature_image_path: null });
  });
});

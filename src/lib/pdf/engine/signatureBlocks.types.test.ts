import { describe, it, expect } from 'vitest';
import type { EngineDocData, SignatureBlockData } from './types';

describe('SignatureBlockData / EngineDocData.signatureBlocks', () => {
  it('accepts a populated signatureBlocks array on EngineDocData', () => {
    const block: SignatureBlockData = {
      slot: 'approver', name: 'Tech A', role: 'Approver',
      method: 'drawn', imageDataUrl: 'data:image/png;base64,AAA', signedAt: '2026-06-29T00:00:00Z',
    };
    const data: Partial<EngineDocData> = { signatureBlocks: [block] };
    expect(data.signatureBlocks?.[0].slot).toBe('approver');
    expect(data.signatureBlocks?.[0].method).toBe('drawn');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { assertSpy, fromMock, rpcMock } = vi.hoisted(() => ({
  assertSpy: vi.fn(async () => undefined),
  fromMock: vi.fn(),
  rpcMock: vi.fn(async () => ({ data: 'COMP-0042', error: null })),
}));
vi.mock('./regimes/partyTaxValidation', () => ({ assertPartyTaxNumberValid: assertSpy }));
vi.mock('./supabaseClient', () => ({ supabase: { from: fromMock, rpc: rpcMock } }));

import { createCompany, updateCompany } from './companyService';

const insertChain = () => {
  const chain: Record<string, unknown> = {};
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.select = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => ({ data: { id: 'co-1', name: 'X' }, error: null }));
  return chain;
};

beforeEach(() => {
  assertSpy.mockClear();
  fromMock.mockReset();
  fromMock.mockImplementation(() => insertChain());
});

describe('companyService tax-number chokepoint', () => {
  it('createCompany validates the tax number BEFORE inserting and aborts on failure', async () => {
    assertSpy.mockRejectedValueOnce(new Error('GSTIN check character is invalid — please re-check the number.'));
    await expect(createCompany({
      name: 'Bad GSTIN Co', country_id: 'in-1', subdivision_id: 'sub-ka', tax_number: '29ABCDE1234F1Z5',
    })).rejects.toThrow(/check character/);
    expect(fromMock).not.toHaveBeenCalled();
  });
  it('createCompany passes country/subdivision/tax_number to the validator', async () => {
    await createCompany({ name: 'Good Co', country_id: 'in-1', subdivision_id: 'sub-ka', tax_number: '29AAACX0000X1ZW' });
    expect(assertSpy).toHaveBeenCalledWith({
      countryId: 'in-1', subdivisionId: 'sub-ka', taxNumber: '29AAACX0000X1ZW',
    });
  });
  it('updateCompany validates when the patch carries a tax_number (context from the patch or the row)', async () => {
    const readChain = insertChain();
    (readChain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'co-1', country_id: 'in-1', subdivision_id: 'sub-mh' }, error: null,
    });
    fromMock.mockImplementationOnce(() => readChain);   // 1st from(): context read
    await updateCompany('co-1', { tax_number: '29AAACX0000X1ZW' });
    expect(assertSpy).toHaveBeenCalledWith({
      countryId: 'in-1', subdivisionId: 'sub-mh', taxNumber: '29AAACX0000X1ZW',
    });
  });
});

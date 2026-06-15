import { describe, it, expect, vi, beforeEach } from 'vitest';

const captured: { insert?: Record<string, unknown>; update?: Record<string, unknown>; table?: string } = {};

vi.mock('../../supabaseClient', () => {
  const makeChain = (table: string) => {
    const chain: Record<string, unknown> = {};
    chain.insert = vi.fn((p: Record<string, unknown>) => { captured.insert = p; captured.table = table; return chain; });
    chain.update = vi.fn((p: Record<string, unknown>) => { captured.update = p; captured.table = table; return chain; });
    chain.eq = vi.fn(() => chain);
    chain.is = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.select = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: { id: 'e-1', name: 'Acme OMN', is_primary: true }, error: null }));
    chain.then = undefined;
    return chain;
  };
  return { supabase: { from: vi.fn((t: string) => makeChain(t)) } };
});
vi.mock('../../logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { createLegalEntity, updateLegalEntity, softDeleteLegalEntity } from './legalEntitiesService';

describe('legalEntitiesService writes', () => {
  beforeEach(() => { captured.insert = undefined; captured.update = undefined; captured.table = undefined; });

  it('createLegalEntity writes to legal_entities and coerces blank uuid FKs to null', async () => {
    await createLegalEntity({
      tenant_id: 't-1', name: 'Acme OMN', country_id: 'c-omn',
      currency_code: 'OMR', tax_system: 'VAT', subdivision_id: '',
    });
    expect(captured.table).toBe('legal_entities');
    expect(captured.insert?.name).toBe('Acme OMN');
    expect(captured.insert?.subdivision_id).toBeNull(); // blank uuid → null, not a 400
  });

  it('createLegalEntity never writes a USD/empty currency (fail-loud, D2)', async () => {
    await expect(createLegalEntity({
      tenant_id: 't-1', name: 'X', country_id: 'c', currency_code: '', tax_system: 'NONE',
    })).rejects.toThrow(/currency/i);
  });

  it('softDeleteLegalEntity sets deleted_at and never issues a hard delete', async () => {
    await softDeleteLegalEntity('e-1');
    expect(captured.update).toBeDefined();
    expect(captured.update).toHaveProperty('deleted_at');
  });

  it('updateLegalEntity strips tenant_id from the patch (tenant is immutable)', async () => {
    await updateLegalEntity('e-1', { name: 'New', tenant_id: 'hacked' } as never);
    expect(captured.update).not.toHaveProperty('tenant_id');
    expect(captured.update?.name).toBe('New');
  });
});

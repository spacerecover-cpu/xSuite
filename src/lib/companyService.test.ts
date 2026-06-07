import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the exact payloads handed to supabase so we can assert the generated
// `company_name` column is NEVER part of a write. company_name is GENERATED
// ALWAYS AS (name); Postgres rejects any write to it, which is the root cause of
// the "Add Company" 400 (and the edit-company 400s that #155 missed because it
// only patched the insert). These tests are the regression lock for the whole
// class: every company write must flow through createCompany / updateCompany.

const captured: { insert?: Record<string, unknown>; update?: Record<string, unknown> } = {};

vi.mock('./supabaseClient', () => {
  const makeChain = (table: string) => {
    const chain: Record<string, unknown> = {};
    chain.insert = vi.fn((payload: Record<string, unknown>) => {
      if (table === 'companies') captured.insert = payload;
      return chain;
    });
    chain.update = vi.fn((payload: Record<string, unknown>) => {
      if (table === 'companies') captured.update = payload;
      return chain;
    });
    chain.eq = vi.fn(() => chain);
    chain.select = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(() =>
      Promise.resolve({ data: { id: 'co-1', name: 'Acme', company_name: 'Acme' }, error: null }),
    );
    return chain;
  };
  return {
    supabase: {
      from: vi.fn((table: string) => makeChain(table)),
      rpc: vi.fn(() => Promise.resolve({ data: 'COMP-0001', error: null })),
    },
  };
});

vi.mock('./logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { createCompany, updateCompany } from './companyService';

describe('companyService — never writes the generated company_name column', () => {
  beforeEach(() => {
    captured.insert = undefined;
    captured.update = undefined;
  });

  it('createCompany strips company_name from the insert payload', async () => {
    await createCompany({ name: 'Acme', company_name: 'Acme', industry_id: '' });

    expect(captured.insert).toBeDefined();
    expect(captured.insert).not.toHaveProperty('company_name');
    expect(captured.insert?.name).toBe('Acme');
    // blank uuid FK coerced to null (would otherwise be a uuid-syntax 400)
    expect(captured.insert?.industry_id).toBeNull();
  });

  it('updateCompany strips company_name even when a caller passes it', async () => {
    await updateCompany('co-1', { name: 'Acme 2', company_name: 'Acme 2', country_id: '' });

    expect(captured.update).toBeDefined();
    expect(captured.update).not.toHaveProperty('company_name');
    expect(captured.update?.name).toBe('Acme 2');
    expect(captured.update?.country_id).toBeNull();
  });

  it('updateCompany requires an id', async () => {
    await expect(updateCompany('', { name: 'x' })).rejects.toThrow('Company id is required');
  });
});

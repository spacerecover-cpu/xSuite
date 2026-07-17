import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the exact payloads handed to supabase so we can assert the generated
// `company_name` column is NEVER part of a write. company_name is GENERATED
// ALWAYS AS (name); Postgres rejects any write to it, which is the root cause of
// the "Add Company" 400 (and the edit-company 400s that #155 missed because it
// only patched the insert). These tests are the regression lock for the whole
// class: every company write must flow through createCompany / updateCompany.

const captured: { insert?: Record<string, unknown>; update?: Record<string, unknown> } = {};
// Ordered log of writes against customer_company_relationships, so a test can
// assert the existing primary is demoted BEFORE the new primary is inserted.
const relOps: Array<{ op: 'insert' | 'update'; payload: Record<string, unknown> }> = [];
// Mutable stand-in for "the primary company this customer already holds".
const relState: { existingPrimary: Record<string, unknown> | null } = { existingPrimary: null };

vi.mock('./supabaseClient', () => {
  const makeChain = (table: string) => {
    const chain: Record<string, unknown> = {};
    chain.insert = vi.fn((payload: Record<string, unknown>) => {
      if (table === 'companies') captured.insert = payload;
      if (table === 'customer_company_relationships') relOps.push({ op: 'insert', payload });
      return chain;
    });
    chain.update = vi.fn((payload: Record<string, unknown>) => {
      if (table === 'companies') captured.update = payload;
      if (table === 'customer_company_relationships') relOps.push({ op: 'update', payload });
      return chain;
    });
    chain.eq = vi.fn(() => chain);
    chain.is = vi.fn(() => chain);
    chain.select = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(() => {
      if (table === 'customer_company_relationships') {
        return Promise.resolve({ data: relState.existingPrimary, error: null });
      }
      return Promise.resolve({ data: { id: 'co-1', name: 'Acme', company_name: 'Acme' }, error: null });
    });
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
    relOps.length = 0;
    relState.existingPrimary = null;
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

  it('createCompany demotes the contact\'s existing primary before linking the new one', async () => {
    // The picked contact already holds a primary company; a raw is_primary:true
    // insert would trip uq_customer_primary_company (23505) and be swallowed,
    // silently dropping the user's choice.
    relState.existingPrimary = { id: 'rel-old' };

    await createCompany({ name: 'Acme', company_name: 'Acme' }, 'cust-9');

    const demote = relOps.find((o) => o.op === 'update');
    const link = relOps.find((o) => o.op === 'insert');
    expect(demote).toBeDefined();
    expect(demote?.payload.is_primary).toBe(false);
    expect(link).toBeDefined();
    expect(link?.payload).toMatchObject({ customer_id: 'cust-9', is_primary: true });
    // demote must happen before the insert
    expect(relOps.indexOf(demote!)).toBeLessThan(relOps.indexOf(link!));
  });
});

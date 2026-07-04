import { describe, it, expect, vi, beforeEach } from 'vitest';

const rows: Record<string, unknown[]> = {};
const calls: { method: string; args: unknown[] }[] = [];

vi.mock('./supabaseClient', () => {
  const chain = (table: string) => {
    const result = { data: rows[table] ?? [], error: null };
    const self: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order']) {
      self[m] = vi.fn((...args: unknown[]) => {
        calls.push({ method: m, args });
        return self;
      });
    }
    (self as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve(result);
    return self;
  };
  return { supabase: { from: vi.fn((t: string) => chain(t)) } };
});

import { listSubdivisions } from './geoSubdivisionService';

beforeEach(() => {
  calls.length = 0;
  rows['geo_subdivisions'] = [
    { id: 's2', code: 'MU', name: 'Muscat', subdivision_type: 'governorate' },
    { id: 's1', code: 'DA', name: 'Dhofar', subdivision_type: 'governorate' },
  ];
});

describe('listSubdivisions', () => {
  it('filters by country_id and is_active, orders by sort_order, and maps rows to {id, code, name, subdivision_type}', async () => {
    const result = await listSubdivisions('om-uuid');

    expect(result).toEqual([
      { id: 's2', code: 'MU', name: 'Muscat', subdivision_type: 'governorate' },
      { id: 's1', code: 'DA', name: 'Dhofar', subdivision_type: 'governorate' },
    ]);

    const eqCalls = calls.filter((c) => c.method === 'eq');
    expect(eqCalls).toContainEqual({ method: 'eq', args: ['country_id', 'om-uuid'] });
    expect(eqCalls).toContainEqual({ method: 'eq', args: ['is_active', true] });

    const orderCall = calls.find((c) => c.method === 'order');
    expect(orderCall?.args[0]).toBe('sort_order');
  });

  it('returns an empty array when no rows are found', async () => {
    rows['geo_subdivisions'] = [];
    expect(await listSubdivisions('ae-uuid')).toEqual([]);
  });
});

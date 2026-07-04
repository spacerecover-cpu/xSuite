import { describe, it, expect, vi, beforeEach } from 'vitest';

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { from } }));

import { listUnitCodes, clearUnitCodesCache } from './unitCodesService';

/** Chainable master_unit_codes builder: select/eq/is/order chain; awaiting yields {data}. */
function makeUnitCodesQuery(rows: Array<Record<string, unknown>>) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    order: vi.fn(() => builder),
    then: (resolve: (v: { data: unknown; error: null }) => void) =>
      resolve({ data: rows, error: null }),
  };
  return builder;
}

const seedRows = [
  { code: 'C62', uqc_code: 'PCE', labels_i18n: { en: 'Piece', ar: 'قطعة' }, scheme: 'UNECE' },
  { code: 'HUR', uqc_code: 'HUR', labels_i18n: { en: 'Hour' }, scheme: 'UNECE' },
];

beforeEach(() => {
  from.mockReset();
  clearUnitCodesCache();
});

describe('listUnitCodes', () => {
  it('maps rows to {code, uqc_code, label, scheme}, resolving label from labels_i18n.en', async () => {
    const query = makeUnitCodesQuery(seedRows);
    from.mockImplementation(() => query);

    const result = await listUnitCodes();

    expect(result).toEqual([
      { code: 'C62', uqc_code: 'PCE', label: 'Piece', scheme: 'UNECE' },
      { code: 'HUR', uqc_code: 'HUR', label: 'Hour', scheme: 'UNECE' },
    ]);
  });

  it('filters on is_active=true and deleted_at IS NULL', async () => {
    const query = makeUnitCodesQuery(seedRows);
    from.mockImplementation(() => query);

    await listUnitCodes();

    expect(query.eq).toHaveBeenCalledWith('is_active', true);
    expect(query.is).toHaveBeenCalledWith('deleted_at', null);
  });

  it('caches the result — a second call does not invoke supabase.from again', async () => {
    const query = makeUnitCodesQuery(seedRows);
    from.mockImplementation(() => query);

    await listUnitCodes();
    await listUnitCodes();

    expect(from).toHaveBeenCalledTimes(1);
  });

  it('clearUnitCodesCache resets the cache, forcing a re-fetch', async () => {
    const query = makeUnitCodesQuery(seedRows);
    from.mockImplementation(() => query);

    await listUnitCodes();
    clearUnitCodesCache();
    await listUnitCodes();

    expect(from).toHaveBeenCalledTimes(2);
  });
});

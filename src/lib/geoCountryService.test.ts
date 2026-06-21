import { describe, it, expect, vi, beforeEach } from 'vitest';
const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { from } }));
import { geoCountryService } from './geoCountryService';

// Build a Supabase-style query builder whose terminal `.order(...)` resolves to
// the given { data, error }. Records the column projection + filters applied.
function builder(result: { data: unknown; error: unknown }) {
  const calls: { select?: string; eq: Array<[string, unknown]>; is: Array<[string, unknown]> } = {
    eq: [],
    is: [],
  };
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn((cols: string) => {
    calls.select = cols;
    return chain;
  });
  chain.eq = vi.fn((col: string, val: unknown) => {
    calls.eq.push([col, val]);
    return chain;
  });
  chain.is = vi.fn((col: string, val: unknown) => {
    calls.is.push([col, val]);
    return chain;
  });
  chain.order = vi.fn(() => Promise.resolve(result));
  return { chain, calls };
}

beforeEach(() => {
  from.mockReset();
});

describe('geoCountryService.listOnboardableCountries', () => {
  it('queries is_active=true + deleted_at IS NULL and filters out null/short-currency rows', async () => {
    const { chain, calls } = builder({
      data: [
        { id: '1', code: 'OM', currency_code: 'OMR', is_active: true },
        { id: '2', code: 'XX', currency_code: null, is_active: true },
      ],
      error: null,
    });
    from.mockReturnValue(chain);

    const out = await geoCountryService.listOnboardableCountries();

    expect(from).toHaveBeenCalledWith('geo_countries');
    expect(calls.eq).toContainEqual(['is_active', true]);
    expect(calls.is).toContainEqual(['deleted_at', null]);
    // currency-bearing only (reuses filterOnboardableCountries)
    expect(out.map((c) => c.code)).toEqual(['OM']);
  });

  it('selects the columns the Location + Jurisdiction steps need', async () => {
    const { chain, calls } = builder({ data: [], error: null });
    from.mockReturnValue(chain);

    await geoCountryService.listOnboardableCountries();

    const cols = calls.select ?? '';
    for (const needed of [
      'language_code',
      'tax_system',
      'tax_label',
      'tax_number_label',
      'tax_number_format',
      'fiscal_year_start',
      'timezone',
      'currency_code',
    ]) {
      expect(cols).toContain(needed);
    }
  });

  it('throws fail-loud when the query errors (never returns a silent empty list)', async () => {
    const { chain } = builder({ data: null, error: { message: 'boom' } });
    from.mockReturnValue(chain);

    await expect(geoCountryService.listOnboardableCountries()).rejects.toThrow('boom');
  });
});

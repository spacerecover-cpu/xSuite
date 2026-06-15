import { describe, it, expect, vi, beforeEach } from 'vitest';

const eqFn = vi.fn();
const builder = { select: () => builder, eq: eqFn };
vi.mock('./supabaseClient', () => ({ supabase: { from: () => builder } }));

import { fetchActiveLanguages } from './languageService';

describe('fetchActiveLanguages (A1-hydrate — geo_languages → LanguageRow[])', () => {
  beforeEach(() => eqFn.mockReset());

  it('maps active geo_languages rows to LanguageRow[]', async () => {
    eqFn.mockResolvedValueOnce({ data: [{ code: 'he', is_rtl: true }, { code: 'en', is_rtl: false }], error: null });
    expect(await fetchActiveLanguages()).toEqual([{ code: 'he', is_rtl: true }, { code: 'en', is_rtl: false }]);
  });

  it('returns [] on error so the {en,ar} bootstrap is kept', async () => {
    eqFn.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    expect(await fetchActiveLanguages()).toEqual([]);
  });

  it('returns [] when there are no active rows', async () => {
    eqFn.mockResolvedValueOnce({ data: [], error: null });
    expect(await fetchActiveLanguages()).toEqual([]);
  });
});

// PostgREST smoke test for the PUBLIC (anon) signup country list — the exact
// query geoCountryService.listOnboardableCountries() issues. supabase-js does
// NOT type-check filter column names, so only a real REST round trip catches a
// missing column (the Phase-0 geo_countries.deleted_at 42703 incident).
// Self-skips when the env is absent (same policy as registry-trigger-parity).
import { describe, it, expect } from 'vitest';

const url = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const live = url && anonKey ? describe : describe.skip;

const ONBOARDABLE_COLUMNS =
  'id,code,name,currency_code,currency_symbol,is_active,language_code,tax_system,tax_label,tax_number_label,tax_number_format,fiscal_year_start,timezone';

live('signup country list (anon PostgREST)', () => {
  it('returns 200 with at least one onboardable country for the wizard query', async () => {
    const endpoint =
      `${url}/rest/v1/geo_countries?select=${ONBOARDABLE_COLUMNS}` +
      `&is_active=eq.true&deleted_at=is.null&order=name&limit=50`;
    const res = await fetch(endpoint, {
      headers: { apikey: anonKey as string, Authorization: `Bearer ${anonKey}` },
    });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect((body as Array<{ currency_code: string | null }>).some((c) => !!c.currency_code)).toBe(true);
  });
});

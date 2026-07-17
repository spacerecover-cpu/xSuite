// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// getOrCreateCompanySettings caches the company_settings row in a module global.
// The cache MUST be keyed by the active tenant so a sign-out + sign-in as a
// different tenant on the same tab does not return the previous tenant's
// company identity (name/address/tax number) from the warm cache.
const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { from } }));
vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { getOrCreateCompanySettings, invalidateCompanySettingsCache } from './companySettingsService';

/** Thenable company_settings builder: awaiting yields {data} = the single row. */
function makeQuery(row: Record<string, unknown> | null) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve({ data: row, error: null })),
  };
  return builder;
}

beforeEach(() => {
  from.mockReset();
  localStorage.clear();
  invalidateCompanySettingsCache();
});

describe('getOrCreateCompanySettings tenant-keyed cache', () => {
  it('does not return tenant A row after switching to tenant B on the same tab', async () => {
    localStorage.setItem('tenant_id', 'tenant-A');
    from.mockReturnValueOnce(makeQuery({ id: 'a', basic_info: { company_name: 'Alpha Labs' } }));
    const a = await getOrCreateCompanySettings();
    expect(a.basic_info.company_name).toBe('Alpha Labs');

    // Simulate sign-out + sign-in as a different tenant (no page reload).
    localStorage.setItem('tenant_id', 'tenant-B');
    from.mockReturnValueOnce(makeQuery({ id: 'b', basic_info: { company_name: 'Bravo Labs' } }));
    const b = await getOrCreateCompanySettings();

    expect(b.basic_info.company_name).toBe('Bravo Labs');
    expect(from).toHaveBeenCalledTimes(2);
  });

  it('serves the warm cache within the same tenant without re-querying', async () => {
    localStorage.setItem('tenant_id', 'tenant-A');
    from.mockReturnValueOnce(makeQuery({ id: 'a', basic_info: { company_name: 'Alpha Labs' } }));
    await getOrCreateCompanySettings();
    const again = await getOrCreateCompanySettings();

    expect(again.basic_info.company_name).toBe('Alpha Labs');
    expect(from).toHaveBeenCalledTimes(1);
  });
});

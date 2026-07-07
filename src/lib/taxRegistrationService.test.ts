// src/lib/taxRegistrationService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fromMock = vi.fn();
vi.mock('./supabaseClient', () => ({
  supabase: { from: (...a: unknown[]) => fromMock(...a) },
  resolveTenantId: vi.fn().mockResolvedValue('t-1'),
}));

const getOrCreateCompanySettings = vi.fn();
const updateCompanySettings = vi.fn().mockResolvedValue({});
const invalidateCompanySettingsCache = vi.fn();
vi.mock('./companySettingsService', () => ({
  getOrCreateCompanySettings: (...a: unknown[]) => getOrCreateCompanySettings(...a),
  updateCompanySettings: (...a: unknown[]) => updateCompanySettings(...a),
  invalidateCompanySettingsCache: (...a: unknown[]) => invalidateCompanySettingsCache(...a),
}));

vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
import { logger } from './logger';

import {
  getActiveTaxRegistration, createTaxRegistration, endTaxRegistration,
  getDeclaredRegistrationStatus, setDeclaredRegistrationStatus,
  getBranchStateMismatches,
} from './taxRegistrationService';

function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ['select', 'insert', 'update', 'eq', 'is', 'lte', 'or', 'order', 'maybeSingle']) {
    c[m] = vi.fn().mockImplementation(() => c);
  }
  c.maybeSingle.mockResolvedValue(result);
  c.order.mockResolvedValue(result);
  return c;
}

beforeEach(() => {
  fromMock.mockReset();
  getOrCreateCompanySettings.mockReset();
  updateCompanySettings.mockClear();
  invalidateCompanySettingsCache.mockClear();
});

describe('getActiveTaxRegistration', () => {
  it('returns the primary active registration effective on the date', async () => {
    const rows = [
      { id: 'r2', is_primary: false, registered_from: '2026-06-01', registered_to: null },
      { id: 'r1', is_primary: true, registered_from: '2026-07-01', registered_to: null },
    ];
    const c = chain({ data: rows, error: null });
    fromMock.mockReturnValue(c);
    const row = await getActiveTaxRegistration('2026-07-05');
    expect(fromMock).toHaveBeenCalledWith('legal_entity_tax_registrations');
    expect(c.is).toHaveBeenCalledWith('deleted_at', null);
    expect(c.lte).toHaveBeenCalledWith('registered_from', '2026-07-05');
    expect(c.or).toHaveBeenCalledWith('registered_to.is.null,registered_to.gte.2026-07-05');
    expect(row?.id).toBe('r1');
  });

  it('returns null when no registration is active', async () => {
    const c = chain({ data: [], error: null });
    fromMock.mockReturnValue(c);
    expect(await getActiveTaxRegistration('2026-07-05')).toBe(null);
  });
});

describe('createTaxRegistration', () => {
  it('inserts a standard primary registration stamped with the resolved tenant_id (maybeSingle, never single)', async () => {
    const c = chain({ data: { id: 'new' }, error: null });
    fromMock.mockReturnValue(c);
    const row = await createTaxRegistration({
      legal_entity_id: 'le-1', country_id: 'c-in', subdivision_id: 's-ka',
      tax_number: '29ABCDE1234F1Z5', registered_from: '2026-07-05',
    });
    expect(c.insert).toHaveBeenCalledWith({
      legal_entity_id: 'le-1', country_id: 'c-in', subdivision_id: 's-ka',
      tax_number: '29ABCDE1234F1Z5', registered_from: '2026-07-05',
      tenant_id: 't-1', scheme: 'standard', is_primary: true,
    });
    expect(c.maybeSingle).toHaveBeenCalled();
    expect(row.id).toBe('new');
  });
});

describe('endTaxRegistration', () => {
  it('sets registered_to (business end date — NOT deleted_at)', async () => {
    const c = chain({ data: null, error: null });
    c.eq.mockResolvedValue({ data: null, error: null });
    fromMock.mockReturnValue(c);
    await endTaxRegistration('r1', '2026-07-05');
    expect(c.update).toHaveBeenCalledWith({ registered_to: '2026-07-05' });
    expect(c.eq).toHaveBeenCalledWith('id', 'r1');
  });
});

describe('declared registration status (company_settings.metadata.tax_registration_status)', () => {
  it('reads a declared status and rejects corrupt values', async () => {
    getOrCreateCompanySettings.mockResolvedValueOnce({ id: 'cs', metadata: { tax_registration_status: 'unregistered' } });
    expect(await getDeclaredRegistrationStatus()).toBe('unregistered');
    getOrCreateCompanySettings.mockResolvedValueOnce({ id: 'cs', metadata: { tax_registration_status: 'maybe' } });
    expect(await getDeclaredRegistrationStatus()).toBeUndefined();
    getOrCreateCompanySettings.mockResolvedValueOnce({ id: 'cs', metadata: null });
    expect(await getDeclaredRegistrationStatus()).toBeUndefined();
  });

  it('writes the status while preserving sibling metadata keys, then invalidates the cache', async () => {
    getOrCreateCompanySettings.mockResolvedValueOnce({ id: 'cs', metadata: { table_columns: { cases: {} } } });
    await setDeclaredRegistrationStatus('registered');
    expect(updateCompanySettings).toHaveBeenCalledWith({
      metadata: { table_columns: { cases: {} }, tax_registration_status: 'registered' },
    });
    expect(invalidateCompanySettingsCache).toHaveBeenCalled();
  });
});

describe('getBranchStateMismatches', () => {
  it('returns mismatched branches and fires the non-throwing dev assertion', async () => {
    const regChain = chain({
      data: [{ id: 'r1', is_primary: true, subdivision_id: 's-ka', registered_from: '2026-04-01', registered_to: null }],
      error: null,
    });
    const branchChain = chain({ data: null, error: null });
    branchChain.is.mockResolvedValue({
      data: [
        { id: 'b1', name: 'HQ', subdivision_id: 's-ka', is_active: true },
        { id: 'b2', name: 'Mumbai Desk', subdivision_id: 's-mh', is_active: true },
      ],
      error: null,
    });
    fromMock.mockImplementation((table: string) =>
      table === 'legal_entity_tax_registrations' ? regChain : branchChain);
    const out = await getBranchStateMismatches();
    expect(out).toEqual([{ branchId: 'b2', branchName: 'Mumbai Desk', branchSubdivisionId: 's-mh' }]);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Mumbai Desk'));
  });

  it('returns [] with no registration and never queries branches', async () => {
    const regChain = chain({ data: [], error: null });
    fromMock.mockReturnValue(regChain);
    expect(await getBranchStateMismatches()).toEqual([]);
    expect(fromMock).not.toHaveBeenCalledWith('branches');
  });
});

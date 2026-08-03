import { describe, it, expect, vi, beforeEach } from 'vitest';

const { from, resolveTenantId } = vi.hoisted(() => ({
  from: vi.fn(),
  resolveTenantId: vi.fn(async () => 'tenant-1'),
}));
vi.mock('./supabaseClient', () => ({ supabase: { from }, resolveTenantId }));
vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('./companySettingsService', () => ({ getOrCreateCompanySettings: vi.fn(async () => null) }));
vi.mock('./tenantConfigService', () => ({ getTenantConfig: vi.fn(async () => ({ currency: null })) }));

import { buildTemplateContext } from './templateContextService';

/** Chainable builder whose maybeSingle() resolves the supplied row. */
function makeQuery(row: Record<string, unknown> | null) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve({ data: row, error: null })),
  };
  return builder;
}

beforeEach(() => {
  from.mockReset();
  resolveTenantId.mockResolvedValue('tenant-1');
});

/**
 * Regression — the primary-device lookup feeds document and outbound WhatsApp merge
 * fields. Without .is('deleted_at', null) a device removed from the case in error is
 * still picked as the primary device, so its model/serial assert the lab holds
 * hardware it does not.
 */
describe('buildTemplateContext primary-device lookup', () => {
  it('excludes soft-deleted devices from the case_devices query', async () => {
    let deviceQuery: Record<string, unknown> | undefined;
    from.mockImplementation((table: string) => {
      if (table === 'case_devices') {
        return (deviceQuery = makeQuery({ model: 'ST2000DM008', serial_number: 'ZDZ1' }));
      }
      return makeQuery(null);
    });

    await buildTemplateContext({ caseId: 'case-1' });

    expect(deviceQuery!.is).toHaveBeenCalledWith('deleted_at', null);
    expect(deviceQuery!.eq).toHaveBeenCalledWith('case_id', 'case-1');
    expect(deviceQuery!.eq).toHaveBeenCalledWith('is_primary', true);
  });
});

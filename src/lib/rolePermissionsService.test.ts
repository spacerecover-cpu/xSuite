import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rolePermissionsService } from './rolePermissionsService';

// Controllable tenant + RPC so we can prove the cache is scoped per tenant.
let tenantId: string | null = 'tenant-A';
const rpc = vi.fn(async (_name: string) => ({
  data: [{ module_id: 'm1', module_slug: 'cases', module_name: 'Cases' }],
  error: null,
}));
const upsert = vi.fn(async (_rows?: unknown, _opts?: unknown) => ({ error: null }));

vi.mock('./supabaseClient', () => ({
  supabase: {
    rpc: (name: string) => rpc(name),
    // master_modules query used by getAllModules() (warms the cache timestamp).
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            order: async () => ({ data: [{ id: 'm1', slug: 'cases', name: 'Cases', category: 'core', is_active: true }], error: null }),
          }),
        }),
      }),
      upsert: (rows: any, opts: any) => upsert(rows, opts),
    }),
  },
  getTenantId: () => tenantId,
  resolveTenantId: async () => tenantId,
}));
vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const accessibleRpcCalls = () => rpc.mock.calls.filter((c) => c[0] === 'get_accessible_modules').length;

describe('rolePermissionsService cache isolation', () => {
  beforeEach(async () => {
    rolePermissionsService.clearCache();
    rpc.mockClear();
    // Warm the module cache so the permissions-cache TTL is considered fresh
    // (the TTL is gated on the shared cacheTimestamp set by getAllModules).
    await rolePermissionsService.getAllModules();
  });

  it('does not serve one tenant\'s cached role permissions to another tenant (H6)', async () => {
    tenantId = 'tenant-A';
    await rolePermissionsService.getRolePermissions('technician');

    tenantId = 'tenant-B';
    await rolePermissionsService.getRolePermissions('technician');

    // A role-only cache key would hit on the 2nd call and reuse tenant-A's
    // accessible modules; a tenant-scoped key must fetch again for tenant-B.
    expect(accessibleRpcCalls()).toBe(2);
  });

  it('reuses the cache within the same tenant + role', async () => {
    tenantId = 'tenant-A';
    await rolePermissionsService.getRolePermissions('technician');
    await rolePermissionsService.getRolePermissions('technician');
    expect(accessibleRpcCalls()).toBe(1);
  });

  it('clearCache() forces a refetch', async () => {
    tenantId = 'tenant-A';
    await rolePermissionsService.getRolePermissions('technician');
    rolePermissionsService.clearCache();
    await rolePermissionsService.getAllModules(); // re-warm timestamp
    await rolePermissionsService.getRolePermissions('technician');
    expect(accessibleRpcCalls()).toBe(2);
  });
});

describe('updateRolePermissions tenant stamping (T12)', () => {
  beforeEach(() => {
    upsert.mockClear();
    tenantId = 'tenant-A';
  });

  it('stamps tenant_id on every upserted row and conflicts on the full unique key', async () => {
    const result = await rolePermissionsService.updateRolePermissions('technician', [
      { moduleId: 'm1', canAccess: true },
      { moduleId: 'm2', canAccess: false },
    ]);

    expect(result.success).toBe(true);
    expect(upsert).toHaveBeenCalledTimes(1);

    const [rows, opts] = upsert.mock.calls[0] as [any[], any];
    // The table's only unique key is UNIQUE (tenant_id, role, module_id);
    // conflicting on 'role,module_id' would be rejected by Postgres (42P10).
    expect(opts.onConflict).toBe('tenant_id,role,module_id');
    // tenant_id is NOT NULL with no default and no stamping trigger, so every
    // row must carry the current tenant id or the INSERT fails.
    expect(rows).toHaveLength(2);
    rows.forEach((row) => {
      expect(row.tenant_id).toBe('tenant-A');
      expect(row.role).toBe('technician');
    });
  });
});

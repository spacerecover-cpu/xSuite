import { describe, it, expect, vi } from 'vitest';

// sessionScope.ts imports supabaseClient at module top-level (the rpc pass-throughs),
// which throws "Missing Supabase environment variables" in the headless node project.
// resolveBusinessUnitVisibility is pure and never touches supabase, but the import
// chain forces the mock — same convention as legalEntitiesService.test.ts.
vi.mock('../../supabaseClient', () => ({ supabase: { rpc: vi.fn() } }));
vi.mock('../../logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { resolveBusinessUnitVisibility } from './sessionScope';

// Mirrors the SQL ADDITIONAL-RESTRICTIVE 5-clause template (design §2A.7):
//   is_platform_admin() OR NOT business_unit_scoping_enabled()
//   OR current_bu IS NULL OR row_bu IS NULL OR row_bu = current_bu
// Phase 1 ships this FLAG-OFF everywhere → every clause but the last is a no-op
// that returns visible. The collapse leaves all row_bu NULL anyway. This test is
// the dormancy lock: if scoping is ever flipped on by accident, the "flag off"
// case below stays the source of truth and these assertions guard the shape.

describe('business-unit visibility — DORMANT (flag off) today', () => {
  it('flag OFF → every row visible regardless of bu (pure no-op, the Phase-1 reality)', () => {
    expect(resolveBusinessUnitVisibility({ scopingEnabled: false, currentBu: null, rowBu: null })).toBe(true);
    expect(resolveBusinessUnitVisibility({ scopingEnabled: false, currentBu: 'bu-x', rowBu: 'bu-y' })).toBe(true);
  });
  it('platform admin → always visible even if scoping were on', () => {
    expect(resolveBusinessUnitVisibility({ scopingEnabled: true, currentBu: 'bu-x', rowBu: 'bu-y', isPlatformAdmin: true })).toBe(true);
  });
  it('tenant-wide user (currentBu NULL) → sees all units even if scoping on', () => {
    expect(resolveBusinessUnitVisibility({ scopingEnabled: true, currentBu: null, rowBu: 'bu-y' })).toBe(true);
  });
  it('unscoped/pre-rollout row (rowBu NULL) → visible to all even if scoping on (the collapse keeps every row here)', () => {
    expect(resolveBusinessUnitVisibility({ scopingEnabled: true, currentBu: 'bu-x', rowBu: null })).toBe(true);
  });
  it('FUTURE (Phase 4): scoping on + both set + mismatch → narrowed out (proves the logic is correct, not active)', () => {
    expect(resolveBusinessUnitVisibility({ scopingEnabled: true, currentBu: 'bu-x', rowBu: 'bu-y' })).toBe(false);
    expect(resolveBusinessUnitVisibility({ scopingEnabled: true, currentBu: 'bu-x', rowBu: 'bu-x' })).toBe(true);
  });
});

import { supabase } from '../../supabaseClient';
import { logger } from '../../logger';

// ─────────────────────────────────────────────────────────────────────────────
// Session-context helpers for the DORMANT 6-level hierarchy.
//
// The DB owns the real helpers (migration 2): get_current_business_unit_id(),
// get_current_region_id(), business_unit_scoping_enabled() — profiles-primary +
// JWT fallback, mirroring get_current_tenant_id(). These TS wrappers exist so the
// app has a typed seam, but BUSINESS-UNIT ISOLATION IS OFF in Phase 1: every
// *_business_unit_isolation policy is created flag-off and is a pure no-op until
// Phase 4 WS-A flips tenants.feature_flags->>'business_unit_isolation' per a named
// multi-site customer. Do NOT use these to gate any query in Phase 1.
// ─────────────────────────────────────────────────────────────────────────────

/** Thin pass-throughs to the DB session helpers (meaningful only under an auth session). */
export async function getCurrentBusinessUnitId(): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_current_business_unit_id');
  if (error) { logger.error('get_current_business_unit_id rpc failed:', error); throw error; }
  return (data as string | null) ?? null;
}

export async function getCurrentRegionId(): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_current_region_id');
  if (error) { logger.error('get_current_region_id rpc failed:', error); throw error; }
  return (data as string | null) ?? null;
}

export interface BuVisibilityCtx {
  scopingEnabled: boolean;
  currentBu: string | null;
  rowBu: string | null;
  isPlatformAdmin?: boolean;
}

/**
 * Pure mirror of the SQL ADDITIONAL-RESTRICTIVE 5-clause BU predicate (§2A.7).
 * Returns true = row visible. With scopingEnabled=false (the Phase-1 default for
 * every tenant) this is a constant `true` — a provable no-op. The narrowing
 * branch is correct but DORMANT; it activates only when scoping is flipped on.
 */
export function resolveBusinessUnitVisibility(ctx: BuVisibilityCtx): boolean {
  if (ctx.isPlatformAdmin) return true;
  if (!ctx.scopingEnabled) return true;   // flag off ⇒ no-op (the Phase-1 reality)
  if (ctx.currentBu === null) return true; // tenant-wide user sees all units
  if (ctx.rowBu === null) return true;     // unscoped/pre-rollout rows visible to all
  return ctx.rowBu === ctx.currentBu;      // the (future) actual narrowing
}

# Tenant Feature Management

Per-tenant enable/disable of UI features (case tabs, navigation, dashboard widgets,
workflow-stage pipeline, customer portal, automation) controlled by tenant admins
from **Settings → Features & Modules**.

This is a **workflow/visibility** layer, NOT a security boundary. Tenant isolation
(RESTRICTIVE RLS) and role permissions remain authoritative. It is also distinct from
**subscription/plan entitlements** (`src/lib/featureGateService.ts` + `useFeature` in
`src/hooks/useFeatureGate.ts`), which gate by what a tenant has *paid for*.

## How it works

- **Registry** (`src/lib/features/registry.ts`) — the single source of truth: every
  toggleable feature with its `key`, `label`, `category`, `defaultEnabled`, `dependsOn`,
  and surface binding (`caseTabId` / `stagePhase` / `routes`). Add a feature = add one entry.
- **Resolver** (`src/lib/features/resolveFeatures.ts`) — pure `override ?? default`, with
  core-forced-on and a dependency cascade. Unknown keys resolve **enabled** (never hide a
  surface for an unrecognised key).
- **Storage** — `tenants.feature_flags jsonb` holds only the *overrides*. Empty `{}` ⇒ every
  feature at its registry default (on) ⇒ existing tenants are unaffected (backward compatible).
- **Runtime** — flags load with the existing tenant config (`tenantConfigService` → 5-min cache
  → `TenantConfigContext`). Consume via `useTenantFeature(key)` / `useTenantFeatures()`.
- **Mutation** — `src/lib/tenantFeaturesService.ts` `updateTenantFeatureFlags(tenantId, flags)`
  then `refreshConfig()` (mirrors the theme system).

## Migration — APPLIED (`20260607193758_add_tenants_feature_flags`)

The migration below is **applied to the live DB**, so the feature runs end-to-end (Settings
saves persist; reads resolve overrides). The only owed step is regenerating
`database.types.ts` — the Supabase CLI is unavailable in-container and the ~16k-line MCP regen
was deferred to avoid a context blowout. Until the regen, the code reads `feature_flags` and
calls `tenant_feature_enabled` through small temporary casts in `tenantConfigService.ts`,
`tenantFeaturesService.ts`, and `PortalAuthContext.tsx`.

The applied SQL was:

```sql
-- 1) Per-tenant feature overrides (override-only; default '{}' = all registry defaults)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2) Server-side check for the one real access surface (Customer Portal).
--    Defaults to TRUE when a key is absent (backward compatible).
CREATE OR REPLACE FUNCTION tenant_feature_enabled(p_tenant_id uuid, p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((feature_flags ->> p_key)::boolean, true)
  FROM tenants
  WHERE id = p_tenant_id;
$$;
```

### After applying
1. Regenerate types: `mcp__supabase__generate_typescript_types` → `src/types/database.types.ts`.
2. Update `supabase/migrations.manifest.md`.
3. Remove the temporary casts (search for `feature_flags` in `tenantConfigService.ts` and
   `tenantFeaturesService.ts`) and use the typed column.
4. Verify `schema-drift` is clean and run the end-to-end checks in the plan's Verification section.

No `DROP`/`DELETE`; additive and reversible.

// Pure assembly of the DISPLAY config cascade from the tenant snapshot + tenant
// overrides. This is the snapshot side of the snapshot-vs-live split (§4.3): it
// carries DISPLAY/formatting config only — it NEVER carries the tax rate or FX rate
// used to COMPUTE a committed value (those resolve live + effective-dated at commit
// and freeze onto the document row — owned by the statutory area, not here).
//
// Phase 3 (Localization Center): the legacy accounting_locales fold was removed.
// tenants.country_config_overrides — written via the Localization Center's merge RPC —
// is now the SOLE tenant-override source; resolved_country_config is the country layer
// beneath it. Explicit overrides win, exactly as before (when the fold's keys were
// also present in the snapshot, which a backfill guaranteed before removal).
import type { ConfigLayers, ConfigBag } from './resolveCountryConfig';

export interface TenantConfigRow {
  resolved_country_config?: unknown;
  country_config_overrides?: unknown;
}

function asBag(v: unknown): ConfigBag {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as ConfigBag) : {};
}

export function buildConfigLayers(tenant: TenantConfigRow): ConfigLayers {
  return {
    country: asBag(tenant.resolved_country_config), // the DISPLAY snapshot (country altitude)
    tenant: asBag(tenant.country_config_overrides),  // explicit tenant choices (most specific)
    // region / legalEntity / businessUnit are transparent in Phase 1 (auto-collapse).
  };
}

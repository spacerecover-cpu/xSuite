// Pure assembly of the DISPLAY config cascade from the tenant snapshot + tenant
// overrides + the folded default accounting_locale. This is the snapshot side of
// the snapshot-vs-live split (§4.3): it carries DISPLAY/formatting config only —
// it NEVER carries the tax rate or FX rate used to COMPUTE a committed value
// (those resolve live + effective-dated at commit and freeze onto the document
// row — owned by the statutory area, not here).
//
// accounting_locales folds in at the TENANT-override altitude as a synthetic
// override map (not a parallel chain), so there is ONE cascade across all 42
// consumer sites. Explicit country_config_overrides win over the folded locale.
import type { ConfigLayers, ConfigBag } from './resolveCountryConfig';

export interface TenantConfigRow {
  resolved_country_config?: unknown;
  country_config_overrides?: unknown;
}

export interface AccountingLocaleRow {
  currency_code?: string | null;
  currency_symbol?: string | null;
  decimal_places?: number | null;
  currency_position?: string | null;
  decimal_separator?: string | null;
  thousands_separator?: string | null;
  date_format?: string | null;
  locale_code?: string | null;
}

function asBag(v: unknown): ConfigBag {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as ConfigBag) : {};
}

/** Project the default accounting_locale row into config-key space (tenant altitude). */
function localeToBag(locale: AccountingLocaleRow | null): ConfigBag {
  if (!locale) return {};
  const bag: ConfigBag = {};
  if (locale.currency_code) bag['currency.code'] = locale.currency_code;
  if (locale.date_format) bag['datetime.date_format'] = locale.date_format;
  if (locale.locale_code) bag['locale.code'] = locale.locale_code;
  return bag;
}

export function buildConfigLayers(
  tenant: TenantConfigRow,
  defaultLocale: AccountingLocaleRow | null,
): ConfigLayers {
  const snapshot = asBag(tenant.resolved_country_config); // the DISPLAY snapshot (country altitude)
  const overrides = asBag(tenant.country_config_overrides); // explicit tenant choices
  const folded = localeToBag(defaultLocale); // accounting_locale at tenant altitude

  return {
    country: snapshot,
    // tenant layer = folded accounting_locale, then explicit overrides win.
    tenant: { ...folded, ...overrides },
    // region / legalEntity / businessUnit are transparent in Phase 1 (auto-collapse).
  };
}

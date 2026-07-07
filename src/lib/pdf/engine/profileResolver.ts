// Render-time compliance-input resolver (Localization Phase 2, WP-2 Task 5). Assembles
// everything a document adapter needs to obey regime rules for the CURRENT tenant:
// primary legal entity's country facts + the resolved DocumentComplianceProfile +
// seller tax-registration status. Consumed by the pdfmake engine paths -- plain TS,
// NOT React's useRegimeConfig() (AD-6): `regime.documents` is read straight off
// tenants.resolved_country_config jsonb (the live column populated by the Phase 0/1
// _apply_country_config mapper), for zero coupling to the React-only TenantConfig shape.
import { supabase } from '../../supabaseClient';
import { getResolvedCountryFacts } from '../countryFactsService';
import type { ResolvedCountryFacts } from './countryConfig';
import { registerAllRegimePlugins } from '../../regimes/register';
import { resolveDocumentProfile } from '../../regimes/registry';
import type { DocumentComplianceProfile } from '../../regimes/types';
import { tenantToday } from '../../tenantToday';

export interface ComplianceRenderInputs {
  facts: ResolvedCountryFacts | null;
  profile: DocumentComplianceProfile;
  sellerRegistered: boolean;
  sellerTaxNumber: string | null;
}

let cache: { at: number; value: ComplianceRenderInputs } | null = null;
const CACHE_TTL_MS = 60_000; // one render/generation batch; cleared explicitly on tenant switch

export function clearComplianceRenderCache(): void {
  cache = null;
}

/** Resolves `key`, falling back to 'generic_invoice' when no plugin is registered
 *  for it (e.g. a country pack not yet shipped) -- a render path must never crash
 *  on an unresolvable profile key. */
function resolveProfileOrFallback(key: string): DocumentComplianceProfile {
  try {
    return resolveDocumentProfile(key);
  } catch {
    return resolveDocumentProfile('generic_invoice');
  }
}

/** Honest-degrade dev assertion (spec §4-S4, moved here from L2 so it never fires
 *  before in_gst_invoice exists): a registered seller whose country DECLARED a
 *  non-generic documents profile that silently fell back to generic_invoice means
 *  the declared plugin is not registered — a misconfiguration, not a valid render.
 *  Throws in dev/test; warns in prod (never crashes a customer's document). */
export function assertProfileResolved(
  declaredKey: string, resolved: DocumentComplianceProfile, sellerRegistered: boolean,
): void {
  const fellBack = declaredKey !== 'generic_invoice' && resolved.key === 'generic_invoice';
  if (fellBack && sellerRegistered) {
    const msg =
      `Compliance profile "${declaredKey}" is declared for this registered tenant but ` +
      `resolved to "generic_invoice" — its regime plugin is not registered.`;
    if (import.meta.env.MODE !== 'production') throw new Error(msg);
    console.error(`[profileResolver] ${msg}`);
  }
}

/** Resolve the render-time compliance inputs for the CURRENT tenant (RLS-scoped):
 *  primary legal entity -> country facts; the `regime.documents` key from
 *  tenants.resolved_country_config -> a registered DocumentComplianceProfile; seller
 *  registration from legal_entity_tax_registrations (active-dated row), falling back
 *  to legal_entities.tax_identifier. Fail-soft on facts (null = no country layer,
 *  matching countryFactsService) and on profile (generic_invoice) -- never fabricates,
 *  never throws on missing/unresolvable config. Cached ~60s; clear on tenant switch. */
export async function resolveComplianceRenderInputs(): Promise<ComplianceRenderInputs> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

  registerAllRegimePlugins();

  const { data: entities } = await supabase
    .from('legal_entities')
    .select('id, tenant_id, country_id, tax_identifier, is_primary')
    .is('deleted_at', null);

  const primary = (entities ?? []).find((e) => e.is_primary) ?? (entities ?? [])[0] ?? null;

  if (!primary) {
    const value: ComplianceRenderInputs = {
      facts: null,
      profile: resolveProfileOrFallback('generic_invoice'),
      sellerRegistered: false,
      sellerTaxNumber: null,
    };
    cache = { at: Date.now(), value };
    return value;
  }

  const { data: tenantData } = await supabase
    .from('tenants')
    .select('id, timezone, resolved_country_config')
    .eq('id', primary.tenant_id)
    .maybeSingle();
  const tenant = tenantData as Record<string, unknown> | null;

  const resolvedConfig = (tenant?.resolved_country_config as Record<string, unknown> | null) ?? {};
  const profileKey =
    typeof resolvedConfig['regime.documents'] === 'string' && resolvedConfig['regime.documents']
      ? (resolvedConfig['regime.documents'] as string)
      : 'generic_invoice';

  const today = tenantToday((tenant?.timezone as string | undefined) ?? 'UTC');
  const { data: registrations } = await supabase
    .from('legal_entity_tax_registrations')
    .select('id, tax_number')
    .eq('legal_entity_id', primary.id)
    .is('deleted_at', null)
    .lte('registered_from', today)
    .or(`registered_to.is.null,registered_to.gte.${today}`);

  const activeRegistration = (registrations ?? [])[0] ?? null;
  const sellerTaxNumber = activeRegistration?.tax_number ?? primary.tax_identifier ?? null;

  const value: ComplianceRenderInputs = {
    facts: await getResolvedCountryFacts(primary.country_id),
    profile: resolveProfileOrFallback(profileKey),
    sellerRegistered: sellerTaxNumber != null,
    sellerTaxNumber,
  };
  assertProfileResolved(profileKey, value.profile, value.sellerRegistered);
  cache = { at: Date.now(), value };
  return value;
}

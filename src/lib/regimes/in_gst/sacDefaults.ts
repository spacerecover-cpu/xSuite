// India SAC line-item defaults. DECIDED (spec §4-S4): SAC codes are tenant-level
// line-item defaults stored in company_settings.metadata at IN provisioning — never
// rows on the global catalog_* tables (which are shared across all tenants). 998319
// = "Other information technology services n.e.c." (data recovery); 998713 =
// "Maintenance and repair of computers and peripheral equipment" (physical media).
import { supabase } from '../../supabaseClient';

export const INDIA_SAC_DEFAULTS = {
  default: '998319',
  selectable: ['998319', '998713'] as const,
} as const;

export function buildIndiaSacMetadataPatch(): Record<string, unknown> {
  return {
    in_gst: {
      sac_defaults: {
        default: INDIA_SAC_DEFAULTS.default,
        selectable: [...INDIA_SAC_DEFAULTS.selectable],
      },
    },
  };
}

export function resolveLineItemSac(
  metadata: Record<string, unknown> | null | undefined,
  override: string | null | undefined,
): string {
  if (override && override.trim()) return override.trim();
  const inGst = (metadata?.in_gst as Record<string, unknown> | undefined) ?? undefined;
  const sac = (inGst?.sac_defaults as { default?: string } | undefined) ?? undefined;
  return sac?.default ?? INDIA_SAC_DEFAULTS.default;
}

/** Seed the SAC defaults into the tenant's company_settings.metadata (idempotent
 *  merge — never clobbers sibling metadata keys). Called by IN provisioning (L2)
 *  and, in this WP, applied to the S2 IN test tenant during verification. */
export async function seedIndiaSacDefaults(tenantId: string): Promise<void> {
  const { data: row, error: readErr } = await supabase
    .from('company_settings')
    .select('id, metadata')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();
  if (readErr) throw readErr;
  const metadata = { ...((row?.metadata as Record<string, unknown> | null) ?? {}), ...buildIndiaSacMetadataPatch() };
  const { error: writeErr } = await supabase
    .from('company_settings')
    .update({ metadata })
    .eq('tenant_id', tenantId)
    .is('deleted_at', null);
  if (writeErr) throw writeErr;
}

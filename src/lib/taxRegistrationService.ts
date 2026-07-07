// src/lib/taxRegistrationService.ts
// Seller tax registration state — SINGLE-registration UX (India v1; the
// multi-state GSTIN manager is a named Phase-4 deferral). The tenant-visible
// registration status is EXPLICIT (spec D6): 'registered' is evidenced by an
// active legal_entity_tax_registrations row; 'unregistered' is a declared flag
// in company_settings.metadata.tax_registration_status. Absence of BOTH is a
// silent fallback and fails a dev assertion (regimes/in_gst/registrationStatus).
// registered_to is the BUSINESS end date (a lapsed registration stays visible
// for historical documents); deleted_at is data removal — never conflate them.
import { supabase, resolveTenantId } from './supabaseClient';
import type { Database, Json } from '../types/database.types';
import {
  getOrCreateCompanySettings,
  updateCompanySettings,
  invalidateCompanySettingsCache,
} from './companySettingsService';
import type { LegalEntityTaxRegistrationRow } from './regimes/types';
import {
  regimeRequiresExplicitRegistrationStatus,
  filterActiveRegistrations,
  resolveGstRegistrationStatus,
  assertNoSilentUnregisteredFallback,
} from './regimes/in_gst/registrationStatus';
import { findBranchStateMismatches, type BranchStateMismatch } from './regimes/in_gst/branchStateCheck';
import { logger } from './logger';

export type { BranchStateMismatch } from './regimes/in_gst/branchStateCheck';

export type DbTaxRegistrationRow =
  Database['public']['Tables']['legal_entity_tax_registrations']['Row'];

export type DeclaredRegistrationStatus = 'registered' | 'unregistered';

const REGISTRATION_STATUS_KEY = 'tax_registration_status';

export async function getPrimaryLegalEntity(): Promise<{ id: string; country_id: string } | null> {
  const { data, error } = await supabase
    .from('legal_entities')
    .select('id, country_id')
    .eq('is_primary', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getActiveTaxRegistration(onDate: string): Promise<DbTaxRegistrationRow | null> {
  const { data, error } = await supabase
    .from('legal_entity_tax_registrations')
    .select('*')
    .is('deleted_at', null)
    .lte('registered_from', onDate)
    .or(`registered_to.is.null,registered_to.gte.${onDate}`)
    .order('registered_from', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as DbTaxRegistrationRow[];
  return rows.find((r) => r.is_primary) ?? rows[0] ?? null;
}

export async function createTaxRegistration(input: {
  legal_entity_id: string;
  country_id: string;
  subdivision_id: string | null;
  tax_number: string;
  registered_from: string;
}): Promise<DbTaxRegistrationRow> {
  const tenantId = await resolveTenantId();
  const { data, error } = await supabase
    .from('legal_entity_tax_registrations')
    .insert({ ...input, tenant_id: tenantId, scheme: 'standard', is_primary: true })
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Failed to create tax registration');
  return data as DbTaxRegistrationRow;
}

export async function endTaxRegistration(id: string, registeredTo: string): Promise<void> {
  const { error } = await supabase
    .from('legal_entity_tax_registrations')
    .update({ registered_to: registeredTo })
    .eq('id', id);
  if (error) throw error;
}

export async function getDeclaredRegistrationStatus(): Promise<DeclaredRegistrationStatus | undefined> {
  const settings = await getOrCreateCompanySettings();
  const metadata = (settings.metadata ?? {}) as Record<string, unknown>;
  const value = metadata[REGISTRATION_STATUS_KEY];
  return value === 'registered' || value === 'unregistered' ? value : undefined;
}

export async function setDeclaredRegistrationStatus(status: DeclaredRegistrationStatus): Promise<void> {
  const settings = await getOrCreateCompanySettings();
  const metadata = {
    ...((settings.metadata ?? {}) as Record<string, unknown>),
    [REGISTRATION_STATUS_KEY]: status,
  };
  await updateCompanySettings({ metadata: metadata as Json });
  invalidateCompanySettingsCache();
}

/** D6 choke-point guard: called by computeDocumentTotals with the pack-resolved
 *  regime.tax key and the seller registrations it already fetched. No-op for
 *  non-GST regimes; lazily reads the declared status only when there is no
 *  active registration (getOrCreateCompanySettings is cached ~5 min). */
export async function assertGstRegistrationExplicit(
  regimeTaxKey: string,
  registrations: LegalEntityTaxRegistrationRow[],
  onDate: string,
): Promise<void> {
  if (!regimeRequiresExplicitRegistrationStatus(regimeTaxKey)) return;
  const active = filterActiveRegistrations(registrations, onDate);
  const declaredStatus = active.length > 0 ? undefined : await getDeclaredRegistrationStatus();
  assertNoSilentUnregisteredFallback(
    resolveGstRegistrationStatus({ regimeTaxKey, activeRegistrations: active, declaredStatus }),
  );
}

/** Branch-state vs GSTIN-state check. Non-throwing dev assertion: the mismatch
 *  is reported via logger.error AND returned so the Settings banner (which is
 *  the surface telling the user how to fix it) always renders. */
export async function getBranchStateMismatches(): Promise<BranchStateMismatch[]> {
  const today = new Date().toISOString().slice(0, 10);
  const registration = await getActiveTaxRegistration(today);
  if (!registration || !registration.subdivision_id) return [];
  const { data, error } = await supabase
    .from('branches')
    .select('id, name, subdivision_id, is_active')
    .is('deleted_at', null);
  if (error) throw error;
  const mismatches = findBranchStateMismatches(data ?? [], registration.subdivision_id);
  if (mismatches.length > 0) {
    logger.error(
      `[dev-assert] ${mismatches.length} active branch(es) are in a different state than the GSTIN registration ` +
      `(${mismatches.map((m) => m.branchName).join(', ')}). Multi-state GSTIN management is not yet available; ` +
      'these branches must not issue GST documents under this registration.',
    );
  }
  return mismatches;
}

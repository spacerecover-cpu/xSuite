import {
  getOrCreateCompanySettings,
  updateCompanySettings,
  invalidateCompanySettingsCache,
} from './companySettingsService';
import type { Json } from '../types/database.types';

/**
 * Tenant status→lifecycle-type overrides, layered over master_case_statuses
 * rows by resolveStatusTypes (caseLifecycle.ts). Lives in
 * company_settings.metadata.case_status_types = { status_name: type } so
 * imported legacy vocabularies classify without polluting the global master.
 */
export async function getTenantCaseStatusTypes(): Promise<Record<string, string> | undefined> {
  const settings = await getOrCreateCompanySettings();
  const metadata = (settings.metadata ?? {}) as Record<string, unknown>;
  const raw = metadata.case_status_types;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, string>;
  }
  return undefined;
}

/** Replace the tenant's status→type override map (Settings → Case Lifecycle). */
export async function setTenantCaseStatusTypes(map: Record<string, string>): Promise<void> {
  const settings = await getOrCreateCompanySettings();
  const metadata = {
    ...((settings.metadata ?? {}) as Record<string, unknown>),
    case_status_types: map,
  };
  await updateCompanySettings({ metadata: metadata as Json });
  invalidateCompanySettingsCache();
}

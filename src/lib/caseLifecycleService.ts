import { getOrCreateCompanySettings } from './companySettingsService';

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

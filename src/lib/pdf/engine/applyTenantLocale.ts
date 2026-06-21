import { applyTenantLanguage } from './applyTenantLanguage';
import type { CompanySettingsData } from '../types';
import type { DocumentTemplateConfig, LocaleConfig } from '../templateConfig';

/** Compose applyTenantLanguage (language/RTL) with the resolved locale slice
 *  (date format + grouping + decimals). Non-mutating. `resolvedLocale` is read
 *  from the tenant/country config by the caller (pdfService) so this stays pure.
 *  Absent resolvedLocale -> identical to applyTenantLanguage (back-compat). */
export function applyTenantLocale(
  config: DocumentTemplateConfig,
  companySettings: CompanySettingsData,
  resolvedLocale: LocaleConfig | undefined,
): DocumentTemplateConfig {
  const withLanguage = applyTenantLanguage(config, companySettings);
  if (!resolvedLocale) return withLanguage;
  return { ...withLanguage, locale: { ...withLanguage.locale, ...resolvedLocale } };
}

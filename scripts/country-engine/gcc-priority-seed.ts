// HAND-VERIFIED reference seed — GCC-6 + priority anchor countries ONLY.
//
// WHY THIS FILE EXISTS (and why it is NOT ~195 countries):
//   The Country Engine's full promise is ~195 countries populated from
//   maintained datasets (CLDR / ISO 4217 / libphonenumber-js /
//   i18n-postal-address). Adding those libraries + sourcing/validating the full
//   dataset is an OWNER DECISION (deps + license + refresh-owner) — see the PR
//   blockers. Until that is approved, this file hand-authors the countries we
//   can verify BY HAND: the six GCC states (our launch markets) and the priority
//   anchor markets that are already configured live. Every value below is
//   hand-checkable against public references (ISO 4217 minor units, CLDR
//   weekData, ITU national dialing formats, libaddressinput layouts).
//
//   FAIL-LOUD: there is deliberately NO en-US/USD/Sunday-week fallback. A country
//   absent from this seed simply is not onboardable (its row stays a stub and
//   check-geo-completeness keeps it is_active=false) — we never fabricate a US
//   default to fill a gap.
//
// Currency / locale / symbol / decimals / week_starts_on are aligned with the
// existing live geo_countries rows so the seed is additive (it ADDS phone_format,
// address_format, digit_grouping and the country_config bag incl. weekend_days)
// without changing the formatting conventions the app already renders.

import { buildCountryConfigRow, type CountryReferenceInputs, type GeoCountrySeedRow } from './build-geo-seed';

// libaddressinput-style address line tokens (%N name, %O org, %A street,
// %C city, %S state, %Z postcode). GCC layouts omit %S/%Z where not used.
const GULF_ADDRESS = ['%N', '%O', '%A', '%C'];
const GULF_ADDRESS_PC = ['%N', '%O', '%A', '%C %Z'];

export const GCC_PRIORITY_SEED: CountryReferenceInputs[] = [
  // ===== GCC-6 (launch markets) — weekend Fri/Sat [5,6] =====
  {
    iso: { alpha2: 'SA', alpha3: 'SAU', name: 'Saudi Arabia', currency: 'SAR', currencyMinorUnits: 2 },
    cldr: { localeCode: 'ar-SA', dateFormat: 'DD/MM/YYYY', timeFormat: '12h', decimalSeparator: '.', groupSeparator: ',', firstDay: 0, weekendDays: [5, 6], numberingSystem: 'latn', currencySymbol: 'ر.س', currencyPosition: 'after', timezone: 'Asia/Riyadh' },
    phone: { code: '+966', format: 'XX XXX XXXX' },
    address: { lines: GULF_ADDRESS_PC },
  },
  {
    iso: { alpha2: 'AE', alpha3: 'ARE', name: 'United Arab Emirates', currency: 'AED', currencyMinorUnits: 2 },
    cldr: { localeCode: 'ar-AE', dateFormat: 'DD/MM/YYYY', timeFormat: '12h', decimalSeparator: '.', groupSeparator: ',', firstDay: 0, weekendDays: [5, 6], numberingSystem: 'latn', currencySymbol: 'د.إ', currencyPosition: 'after', timezone: 'Asia/Dubai' },
    phone: { code: '+971', format: 'XX XXX XXXX' },
    address: { lines: GULF_ADDRESS },
  },
  {
    iso: { alpha2: 'OM', alpha3: 'OMN', name: 'Oman', currency: 'OMR', currencyMinorUnits: 3 },
    cldr: { localeCode: 'ar-OM', dateFormat: 'DD/MM/YYYY', timeFormat: '12h', decimalSeparator: '.', groupSeparator: ',', firstDay: 0, weekendDays: [5, 6], numberingSystem: 'latn', currencySymbol: 'ر.ع.', currencyPosition: 'after', timezone: 'Asia/Muscat' },
    phone: { code: '+968', format: 'XXXX XXXX' },
    address: { lines: GULF_ADDRESS_PC },
  },
  {
    iso: { alpha2: 'KW', alpha3: 'KWT', name: 'Kuwait', currency: 'KWD', currencyMinorUnits: 3 },
    cldr: { localeCode: 'ar-KW', dateFormat: 'DD/MM/YYYY', timeFormat: '12h', decimalSeparator: '.', groupSeparator: ',', firstDay: 0, weekendDays: [5, 6], numberingSystem: 'latn', currencySymbol: 'د.ك', currencyPosition: 'after', timezone: 'Asia/Kuwait' },
    phone: { code: '+965', format: 'XXXX XXXX' },
    address: { lines: GULF_ADDRESS_PC },
  },
  {
    iso: { alpha2: 'QA', alpha3: 'QAT', name: 'Qatar', currency: 'QAR', currencyMinorUnits: 2 },
    cldr: { localeCode: 'ar-QA', dateFormat: 'DD/MM/YYYY', timeFormat: '12h', decimalSeparator: '.', groupSeparator: ',', firstDay: 0, weekendDays: [5, 6], numberingSystem: 'latn', currencySymbol: 'ر.ق', currencyPosition: 'after', timezone: 'Asia/Qatar' },
    phone: { code: '+974', format: 'XXXX XXXX' },
    address: { lines: GULF_ADDRESS },
  },
  {
    iso: { alpha2: 'BH', alpha3: 'BHR', name: 'Bahrain', currency: 'BHD', currencyMinorUnits: 3 },
    cldr: { localeCode: 'ar-BH', dateFormat: 'DD/MM/YYYY', timeFormat: '12h', decimalSeparator: '.', groupSeparator: ',', firstDay: 0, weekendDays: [5, 6], numberingSystem: 'latn', currencySymbol: 'د.ب', currencyPosition: 'after', timezone: 'Asia/Bahrain' },
    phone: { code: '+973', format: 'XXXX XXXX' },
    address: { lines: GULF_ADDRESS_PC },
  },
  // ===== Priority anchor markets (already configured live) =====
  {
    iso: { alpha2: 'GB', alpha3: 'GBR', name: 'United Kingdom', currency: 'GBP', currencyMinorUnits: 2 },
    cldr: { localeCode: 'en-GB', dateFormat: 'DD/MM/YYYY', timeFormat: '24h', decimalSeparator: '.', groupSeparator: ',', firstDay: 1, weekendDays: [6, 0], numberingSystem: 'latn', currencySymbol: '£', currencyPosition: 'before', timezone: 'Europe/London' },
    phone: { code: '+44', format: 'XXXX XXXXXX' },
    address: { lines: ['%N', '%O', '%A', '%C', '%Z'] },
  },
  {
    iso: { alpha2: 'IN', alpha3: 'IND', name: 'India', currency: 'INR', currencyMinorUnits: 2 },
    cldr: { localeCode: 'en-IN', dateFormat: 'DD/MM/YYYY', timeFormat: '12h', decimalSeparator: '.', groupSeparator: ',', firstDay: 1, weekendDays: [0, 6], numberingSystem: 'latn', currencySymbol: '₹', currencyPosition: 'before', timezone: 'Asia/Kolkata', digitGrouping: '3;2' },
    phone: { code: '+91', format: 'XXXXX XXXXX' },
    address: { lines: ['%N', '%O', '%A', '%C', '%S %Z'] },
  },
  {
    iso: { alpha2: 'US', alpha3: 'USA', name: 'United States', currency: 'USD', currencyMinorUnits: 2 },
    cldr: { localeCode: 'en-US', dateFormat: 'MM/DD/YYYY', timeFormat: '12h', decimalSeparator: '.', groupSeparator: ',', firstDay: 0, weekendDays: [6, 0], numberingSystem: 'latn', currencySymbol: '$', currencyPosition: 'before', timezone: 'America/New_York' },
    phone: { code: '+1', format: '(XXX) XXX-XXXX' },
    address: { lines: ['%N', '%O', '%A', '%C, %S %Z'] },
  },
];

/** Build every hand-verified seed row (fail-loud on any missing keystone). */
export function buildAllSeedRows(): GeoCountrySeedRow[] {
  return GCC_PRIORITY_SEED.map(buildCountryConfigRow);
}

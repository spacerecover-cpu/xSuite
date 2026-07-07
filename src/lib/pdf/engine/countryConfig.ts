import { isRTLLanguage } from '../../locale';
import type { TemplateConfigOverride, ColumnConfigOverride } from '../templateConfig';
import type { DocumentComplianceProfile, TaxDocumentType } from '../../regimes/types';

/** Maps a compliance profile's `forcedColumns` (statutory snake_case names) to
 *  the line-item table's REAL camelCase column keys. Defined ONCE here and reused
 *  by every financial adapter's country layer (invoice / quote / credit note) via
 *  {@link forcedColumnOverrides}, so the mapping is never hand-rolled per doc type. */
export const FORCED_COLUMN_KEY_MAP: Record<'item_code' | 'unit_code', string> = {
  item_code: 'itemCode',
  unit_code: 'unit',
};

/** Build the `lineItems` column-visibility overrides that turn a profile's
 *  `forcedColumns` ON, addressing the real camelCase column keys. Returns `[]`
 *  when nothing is forced (so the country override stays a no-op for GCC docs,
 *  whose profile forces no columns). */
export function forcedColumnOverrides(
  forcedColumns: ReadonlyArray<'item_code' | 'unit_code'>,
): ColumnConfigOverride[] {
  return forcedColumns.map((fc) => ({ key: FORCED_COLUMN_KEY_MAP[fc], visible: true }));
}

/** Resolved statutory/format facts the country layer needs (read from
 *  geo_countries by countryFactsService; this mapper never touches the DB). */
export interface ResolvedCountryFacts {
  code: string;                        // ISO alpha-2
  taxSystem: string | null;            // 'VAT' | 'GST' | 'SALES_TAX' | 'NONE'
  taxLabel: string | null;             // totals-line label ('VAT')
  taxNumberLabel: string | null;       // registration-number label ('VATIN','TRN','GSTIN')
  taxInvoiceRequired: boolean;
  languageCode: string | null;         // drives RTL via isRTLLanguage
  decimalPlaces: number | null;        // minor-unit (3 OMR/KWD/BHD, 0 JPY)
  dateFormat: string | null;           // stored 'DD/MM/YYYY' etc.
  decimalSeparator: string | null;
  thousandsSeparator: string | null;
  digitGrouping: string | null;        // '3' western, '3;2' Indian (consumed Phase 4)
  /** Adapter key of the active e-invoice regime row (master_einvoice_regimes,
   *  mandatory_from <= today), or 'no_einvoice'. Routes statutory artifacts by
   *  REGIME, never by country-string matching. */
  einvoiceRegimeKey: string;
  /** Joined geo_countries.address_format lines (e.g. '%N %O %A %C %Z'), or null.
   *  Optional so existing fixtures/tests built without it keep compiling. */
  addressFormat?: string | null;
  /** format.amount_words_scale binding from geo_countries.country_config (S1b
   *  seeds 'indian' for IN). Optional so pre-existing fixtures keep compiling;
   *  absent = 'western'. */
  amountWordsScale?: 'western' | 'indian';
}

/** Profile inputs for financial documents; null docType = non-financial doc
 *  (labels/receipts/custody) which take only the formatting facts. */
export interface ComplianceOverrideInputs {
  profile: DocumentComplianceProfile;
  sellerRegistered: boolean;
  docType: TaxDocumentType | null;
}

/** Map resolved country facts (+ optional compliance profile) to a derived
 *  (NOT authored) template override slotting between built-in and theme.
 *  Studio/tenant overrides stay ABOVE this layer, so a tenant rename wins. */
export function countryTemplateOverride(
  facts: ResolvedCountryFacts,
  compliance?: ComplianceOverrideInputs,
): TemplateConfigOverride {
  const override: TemplateConfigOverride = {};

  // D9 — resolved tax label drives the totals tax line.
  if (facts.taxLabel) {
    override.labels = { taxLabel: { en: facts.taxLabel } };
  }

  // Profile title ceremony (financial docs only). 'TAX INVOICE' iff the seller
  // is registered AND the country requires the ceremony — decided by the plugin.
  if (compliance && compliance.docType) {
    const t = compliance.profile.documentTitle({
      docType: compliance.docType,
      sellerRegistered: compliance.sellerRegistered,
      taxInvoiceRequired: facts.taxInvoiceRequired,
    });
    override.labels = {
      ...override.labels,
      documentTitle: { en: t.title, ...(t.titleTranslated ? { ar: t.titleTranslated } : {}) },
    };
  }

  // D11 — registration band. With a profile the PROFILE is the authority (its
  // showRegistrationBand + a registered seller), NOT the tax-system string — else a
  // GST (India) tax invoice would never show its GSTIN band. Without a profile,
  // preserve the legacy VAT-only fact rule.
  const bandEnabled = compliance
    ? facts.taxInvoiceRequired &&
      compliance.profile.showRegistrationBand && compliance.sellerRegistered
    : facts.taxInvoiceRequired && facts.taxSystem === 'VAT';
  override.taxBar = { enabled: bandEnabled };
  const bandLabel = facts.taxNumberLabel ?? facts.taxLabel;
  if (bandLabel) override.taxBar.label = { en: bandLabel };

  // Expose the resolved profile key so the financial adapters can inject the
  // profile's statutory meta rows (regime-owned; no country branching here).
  if (compliance) override.statutoryProfileKey = compliance.profile.key;

  // Forced statutory line-item columns (item code / unit). Map the profile's
  // snake_case forcedColumns to the real camelCase column keys and flip them
  // visible via a `lineItems` sections override — the shared helper so the
  // quote/credit-note adapters reuse the SAME mapping rather than duplicating it.
  if (compliance) {
    const colOverrides = forcedColumnOverrides(compliance.profile.forcedColumns);
    if (colOverrides.length > 0) {
      override.sections = [{ key: 'lineItems', columns: colOverrides }];
    }
  }

  // RTL country -> bilingual-stacked; profile can force Arabic-lead.
  if (facts.languageCode && isRTLLanguage(facts.languageCode)) {
    // arabicLead collapses to 'ar' in both branches deliberately: Arabic is
    // always primary in bilingual_stacked for RTL countries today (byte-parity
    // with the legacy behavior). This starts mattering once the SA pack
    // (Arabic-lead mandatory) lands in Phase 3 — keep the flag read live.
    const arabicLead = compliance?.profile.bilingual.arabicLead === true;
    override.language = { mode: 'bilingual_stacked', primary: arabicLead ? 'ar' : 'ar' };
  } else if (compliance?.profile.bilingual.enabled && compliance.profile.bilingual.secondaryLanguage) {
    override.language = { mode: 'bilingual_stacked', primary: 'en' };
  }

  // §8d/§8g — date format, minor-units and separators onto the locale slice.
  const locale: NonNullable<TemplateConfigOverride['locale']> = {};
  if (facts.dateFormat) locale.dateFormat = facts.dateFormat;
  if (facts.decimalPlaces != null) locale.decimalPlaces = facts.decimalPlaces;
  if (facts.decimalSeparator) locale.decimalSeparator = facts.decimalSeparator;
  if (facts.thousandsSeparator != null) locale.thousandsSeparator = facts.thousandsSeparator;
  if (facts.digitGrouping === '3;2') locale.groupingStyle = 'indian';
  if (facts.amountWordsScale === 'indian') locale.amountWordsScale = 'indian';

  // Address-line ordering (Task 22): geo_countries.address_format is a jsonb
  // postal-address template (e.g. '%N %O %A %C %Z'). postalFirst is set true
  // ONLY when the postal token (%Z) precedes the city token (%C) — today, every
  // onboardable country lists city before postal, so this stays unset (false)
  // everywhere and GCC/US/UK output is unchanged.
  if (facts.addressFormat) {
    const z = facts.addressFormat.indexOf('%Z');
    const c = facts.addressFormat.indexOf('%C');
    if (z >= 0 && c >= 0 && z < c) locale.postalFirst = true;
  }

  if (Object.keys(locale).length > 0) override.locale = locale;

  // Profile paper (Letter for US-profile documents — consumed Phase 5; A4 is a
  // no-op against the built-in default so GCC output is unchanged).
  if (compliance?.profile.paperSize === 'Letter') {
    override.paper = { size: 'Letter' };
  }

  return override;
}

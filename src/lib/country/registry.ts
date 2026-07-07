// The single source of truth for every country-driven config key. Mirrors
// FEATURE_REGISTRY (src/lib/features/registry.ts): one array, defaults + metadata
// in code, an app-facing binding (resolveCountryConfigKey) like isFeatureEnabled.
// Adding a country key = one array push + ZERO schema change (§4.7). The jsonb
// bag columns (geo_countries.country_config, tenants.country_config_overrides)
// already exist, so a new key needs no migration.
import { z, type ZodType } from 'zod';
import { REQUIRED_SENTINEL } from '../../types/tenantConfig';
import { resolveConfig, type ConfigLayers } from './resolveCountryConfig';

export type ConfigDomain =
  | 'currency'
  | 'tax'
  | 'datetime'
  | 'number_format'
  | 'locale'
  | 'address'
  | 'labor'
  | 'document'
  | 'compliance'
  | 'format';

// NOTE: this is the RICHER authoring interface (adds domain/label/description/
// maxOverrideLayer). It is structurally assignable to the MINIMAL ConfigKeyDef in
// resolveCountryConfig.ts (key + schema + codedDefault + required), so passing
// REGISTRY_BY_KEY into resolveConfig typechecks. Task F's worked example imports the
// minimal `type ConfigKeyDef` from './resolveCountryConfig' (not this one) on purpose.
export interface ConfigKeyDef {
  key: string;
  domain: ConfigDomain;
  label: string;
  description: string;
  schema: ZodType;
  /** NEVER a US fabrication for required keys → REQUIRED_SENTINEL. */
  codedDefault: unknown;
  required?: boolean;
  /** Statutory analogue of feature `core`: the most-specific layer allowed to
   *  override this key. `'country'` ⇒ no tenant/BU may fake compliance (D11). */
  maxOverrideLayer?: 'country' | 'legal_entity' | 'tenant' | 'business_unit';
}

// A schema that accepts either the typed value OR the unresolved sentinel, so a
// required key validates while still at REQUIRED_SENTINEL (the resolver throws on
// the sentinel BEFORE safeParse; this union just keeps the parse total).
const orSentinel = (s: ZodType): ZodType => z.union([s, z.symbol()]);

export const COUNTRY_CONFIG_REGISTRY: ConfigKeyDef[] = [
  // ── currency ──
  {
    key: 'currency.code',
    domain: 'currency',
    label: 'Currency code',
    description: 'ISO 4217 currency code for the entity.',
    schema: orSentinel(z.string().length(3)),
    codedDefault: REQUIRED_SENTINEL,
    required: true,
  },
  {
    // Tenant PREFERENCE (not statutory): how the currency renders on documents
    // and in-app — symbol (ر.ع.), ISO code (OMR), or both (ر.ع. OMR). No
    // maxOverrideLayer ⇒ fully tenant-overridable AND outside STATUTORY_KEYS, so
    // the registry↔trigger parity gate never governs it (validate_country_config_
    // overrides() only rejects maxOverrideLayer:'country' keys). Real coded
    // default 'symbol' ⇒ NOT required, byte-identical to pre-Phase-2 rendering.
    key: 'currency.display_mode',
    domain: 'currency',
    label: 'Currency display mode',
    description: 'How the currency token renders: symbol (ر.ع.), ISO code (OMR), or both (ر.ع. OMR). Tenant preference, not statutory.',
    schema: z.enum(['symbol', 'iso_code', 'symbol_code']),
    codedDefault: 'symbol',
  },
  {
    // Tenant PREFERENCE (not statutory): negative-amount rendering — a leading
    // minus (current behavior) or accounting parentheses. Default 'minus' keeps
    // output byte-identical to pre-Phase-2.
    key: 'currency.negative_format',
    domain: 'currency',
    label: 'Negative amount format',
    description: 'How negative amounts render: minus sign or accounting parentheses. Tenant preference, not statutory.',
    schema: z.enum(['minus', 'parentheses']),
    codedDefault: 'minus',
  },
  {
    // Tenant PREFERENCE: symbol placement. NEW in Phase 3 — moves this cosmetic
    // field from an unvalidated snapshot read into the validated registry cascade.
    key: 'currency.position',
    domain: 'currency',
    label: 'Currency symbol position',
    description: 'Whether the currency token renders before or after the amount. Tenant preference.',
    schema: z.enum(['before', 'after']),
    codedDefault: 'before',
  },
  {
    // Tenant PREFERENCE: display decimals. DISTINCT from the statutory
    // number_format.amount_in_words_minor_units (OMR=3/JPY=0) below.
    key: 'currency.decimal_places',
    domain: 'currency',
    label: 'Decimal places',
    description: 'Display decimal places for amounts. Tenant preference (distinct from amount-in-words minor units).',
    schema: z.number().int().min(0).max(4),
    codedDefault: 2,
  },
  {
    key: 'currency.decimal_separator',
    domain: 'currency',
    label: 'Decimal separator',
    description: 'Character separating the integer and fraction parts. Tenant preference.',
    schema: z.string().min(1).max(1),
    codedDefault: '.',
  },
  {
    key: 'currency.thousands_separator',
    domain: 'currency',
    label: 'Thousands separator',
    description: 'Character grouping thousands (empty = no grouping). Tenant preference.',
    schema: z.string().max(1),
    codedDefault: ',',
  },
  // ── tax (statutory; D9/D10/D11) ──
  {
    key: 'tax.label',
    domain: 'tax',
    label: 'Tax label',
    description: 'The tax name shown on documents (VAT/GST/Sales Tax). D9.',
    schema: orSentinel(z.string().min(1)),
    codedDefault: REQUIRED_SENTINEL,
    required: true,
  },
  {
    key: 'tax.default_rate',
    domain: 'tax',
    label: 'Default tax rate',
    description: 'Default standard tax rate (percent). D10. Binding rate resolves effective-dated at commit; this is display only.',
    schema: orSentinel(z.number().min(0).max(100)),
    codedDefault: REQUIRED_SENTINEL,
    required: true,
  },
  {
    key: 'tax.zatca_qr.enabled',
    domain: 'tax',
    label: 'ZATCA QR enabled',
    description: 'Whether ZATCA Phase-1 QR emits. Jurisdiction-derived, country-locked (D11).',
    schema: z.boolean(),
    codedDefault: false,
    maxOverrideLayer: 'country',
  },
  // ── datetime ──
  {
    key: 'datetime.date_format',
    domain: 'datetime',
    label: 'Date format',
    description: 'Display date pattern. Backfilled from geo_countries.date_format (§4.4 Phase A).',
    schema: z.string().min(1),
    codedDefault: 'YYYY-MM-DD', // ISO 8601 — a neutral, non-US coded default
  },
  {
    key: 'datetime.timezone',
    domain: 'datetime',
    label: 'Timezone',
    description: 'IANA timezone. Backfilled from geo_countries.timezone.',
    schema: z.string().min(1),
    codedDefault: 'UTC',
  },
  {
    key: 'datetime.weekend_days',
    domain: 'datetime',
    label: 'Weekend days',
    description: 'Days of week that are weekend (0=Sun..6=Sat). D15.',
    schema: z.array(z.number().int().min(0).max(6)),
    codedDefault: [6, 0], // Sat/Sun — a real, neutral default (NOT a sentinel)
  },
  {
    key: 'datetime.time_format',
    domain: 'datetime',
    label: 'Time format',
    description: '12-hour or 24-hour clock. Tenant preference.',
    schema: z.enum(['12h', '24h']),
    codedDefault: '24h',
  },
  {
    // First day of week. DISTINCT from datetime.weekend_days (which days ARE weekend).
    key: 'datetime.week_starts_on',
    domain: 'datetime',
    label: 'Week starts on',
    description: 'First day of the week (0=Sun..6=Sat). Tenant preference (distinct from weekend_days).',
    schema: z.number().int().min(0).max(6),
    codedDefault: 0,
  },
  {
    key: 'datetime.fiscal_year_start',
    domain: 'datetime',
    label: 'Fiscal year start',
    description: 'Fiscal year start as MM-DD. Tenant preference.',
    schema: z.string().regex(/^\d{2}-\d{2}$/),
    codedDefault: '01-01',
  },
  // ── number_format (statutory minor-unit correctness; D13) ──
  {
    key: 'number_format.amount_in_words_minor_units',
    domain: 'number_format',
    label: 'Amount-in-words minor units',
    description: 'Decimal places for amount-in-words split (OMR=3, JPY=0). D13.',
    schema: orSentinel(z.number().int().min(0).max(4)),
    codedDefault: REQUIRED_SENTINEL,
    required: true,
  },
  {
    key: 'number_format.digit_grouping',
    domain: 'number_format',
    label: 'Digit grouping',
    description: "Integer grouping style: '3' Western thousands, '3;2' Indian lakh/crore. Snapshot-populated from geo_countries.digit_grouping by _apply_country_config; display preference, not statutory.",
    schema: z.enum(['3', '3;2']),
    codedDefault: '3',
  },
  // ── locale ──
  {
    key: 'locale.code',
    domain: 'locale',
    label: 'Locale code',
    description: 'BCP-47 locale. Backfilled from geo_countries.locale_code (§4.4 Phase A).',
    schema: z.string().min(2),
    codedDefault: 'en', // neutral language-only fallback; full locale resolved from layers
  },
  // ── regime routing (L4 → L3; statutory, country-locked — Phase 1) ──
  {
    key: 'regime.tax', domain: 'tax', label: 'Tax regime plugin',
    description: 'Registered TaxStrategy key computing this country\'s tax. Country-locked; tenants cannot forge compliance.',
    schema: z.string().min(1), codedDefault: 'simple_vat', maxOverrideLayer: 'country',
  },
  {
    key: 'regime.einvoice', domain: 'tax', label: 'E-invoicing regime plugin',
    description: 'Registered EInvoicingTransport key. Country-locked.',
    schema: z.string().min(1), codedDefault: 'no_einvoice', maxOverrideLayer: 'country',
  },
  {
    key: 'regime.numbering', domain: 'tax', label: 'Numbering policy plugin',
    description: 'Registered NumberingPolicy key seeding statutory sequences. Country-locked.',
    schema: z.string().min(1), codedDefault: 'prefix_numbering', maxOverrideLayer: 'country',
  },
  {
    key: 'regime.documents', domain: 'tax', label: 'Document compliance profile',
    description: 'Registered DocumentComplianceProfile key (titles, bands, forced columns). Country-locked.',
    schema: z.string().min(1), codedDefault: 'generic_invoice', maxOverrideLayer: 'country',
  },
  {
    key: 'regime.payroll', domain: 'tax', label: 'Payroll pack plugin',
    description: 'Registered PayrollPack key. "none" = loud not-configured error on payroll statutory ops (Phase 6).',
    schema: z.string().min(1), codedDefault: 'none', maxOverrideLayer: 'country',
  },
  {
    key: 'tax.rounding_policy', domain: 'tax', label: 'Tax rounding policy',
    description: 'Pack DATA (graft 4): {mode: half_up|half_even, level: line|document|head, cash_increment?}. head = per-tax-head-per-document (India Sec 170). simple_vat default preserves Oman byte-parity.',
    schema: z.object({
      mode: z.enum(['half_up', 'half_even']),
      level: z.enum(['line', 'document', 'head']),
      cash_increment: z.number().positive().optional(),
    }),
    codedDefault: { mode: 'half_up', level: 'document' }, maxOverrideLayer: 'country',
  },
  {
    key: 'format.amount_words_scale', domain: 'format', label: 'Amount-in-words scale system',
    description: 'western (million/billion) or indian (lakh/crore). Pack data consumed by the speller (Phase 4 wires indian).',
    schema: z.enum(['western', 'indian']), codedDefault: 'western', maxOverrideLayer: 'country',
  },
  // ── RESERVED pack-schema keys — registered NOW, consumers ship later ──
  {
    key: 'compliance.audit_file_exports', domain: 'compliance', label: 'Statutory audit-file export descriptors',
    description: 'RESERVED (owner E9, consumed when markets demand): [{descriptor_key, format_class: saf_t|fec|gobd|custom, version, capability_key}].',
    schema: z.array(z.object({
      descriptor_key: z.string(), format_class: z.enum(['saf_t', 'fec', 'gobd', 'custom']),
      version: z.string(), capability_key: z.string(),
    })),
    codedDefault: [], maxOverrideLayer: 'country',
  },
  {
    key: 'custody.unclaimed_property', domain: 'compliance', label: 'Unclaimed-device / abandoned-property rules',
    description: 'RESERVED (owner E8, implemented Phase 6 wired to custody/checkout with a disposal legality gate): {holding_period_days, notice_schedule_days[], storage_fee_accrual{amount, per: day|month}, lien_rights, disposal_requires_legality_gate}.',
    schema: z.union([z.null(), z.object({
      holding_period_days: z.number().int().positive(),
      notice_schedule_days: z.array(z.number().int().positive()),
      storage_fee_accrual: z.object({ amount: z.number(), per: z.enum(['day', 'month']) }),
      lien_rights: z.boolean(),
      disposal_requires_legality_gate: z.literal(true),
    })]),
    codedDefault: null, maxOverrideLayer: 'country',
  },
  {
    key: 'privacy.regime', domain: 'compliance', label: 'Data-protection regime key',
    description: 'RESERVED (owner E7, consumed Phase 6 on the regime-key pattern): gdpr|pdpl|dpdp|none.',
    schema: z.enum(['gdpr', 'pdpl', 'dpdp', 'none']), codedDefault: 'none', maxOverrideLayer: 'country',
  },
  // ── tax filing shape (P3 — consumed by the ReturnComposer path) ──
  {
    key: 'tax.filing_frequency',
    domain: 'tax',
    label: 'Tax filing frequency',
    description: 'How often the jurisdiction requires tax returns to be filed.',
    schema: z.enum(['monthly', 'quarterly', 'annual']),
    codedDefault: 'quarterly',
    maxOverrideLayer: 'country',
  },
  {
    key: 'tax.period_anchor',
    domain: 'tax',
    label: 'Tax period anchor',
    description: 'MM-DD anchor the filing periods count from (fiscal-year style anchors supported).',
    schema: z.string().regex(/^\d{2}-\d{2}$/),
    codedDefault: '01-01',
    maxOverrideLayer: 'country',
  },
  {
    key: 'tax.return_composer',
    domain: 'tax',
    label: 'Return composer',
    description: "Registered ReturnComposer plugin key that shapes this jurisdiction's statutory return.",
    schema: z.enum(['gcc_return', 'gstr', 'us_jurisdiction_remit', 'uk_mtd_9box']),
    codedDefault: 'gcc_return',
    maxOverrideLayer: 'country',
  },
];

export const REGISTRY_BY_KEY: Record<string, ConfigKeyDef> = Object.fromEntries(
  COUNTRY_CONFIG_REGISTRY.map((d) => [d.key, d]),
);

/** The jurisdiction-derived keys no tenant may override — the parity source the
 *  server-side validate_country_config_overrides() trigger is generated from
 *  (the registry-trigger-parity CI gate, migration 4, a sibling area). */
export const STATUTORY_KEYS: string[] = COUNTRY_CONFIG_REGISTRY.filter(
  (d) => d.maxOverrideLayer === 'country',
).map((d) => d.key);

/** App-facing binding to the real registry (mirrors isFeatureEnabled at registry.ts:116). */
export function resolveCountryConfigKey<T>(layers: ConfigLayers, key: string): T {
  return resolveConfig<T>(REGISTRY_BY_KEY, layers, key);
}

/** A config key is LOCKED (read-only in the Localization Center, never writable as a
 *  tenant override) iff it is a required jurisdiction key OR country-locked (statutory,
 *  maxOverrideLayer:'country'). Unknown keys are locked fail-safe. The write path and UI
 *  both gate on this so a tenant can never shadow jurisdiction truth (D11). */
export function isConfigKeyLocked(key: string): boolean {
  const def = REGISTRY_BY_KEY[key];
  if (!def) return true;
  return def.required === true || def.maxOverrideLayer === 'country';
}

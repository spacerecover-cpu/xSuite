/** WP-S1b: the exact `country_config` payload seeded onto geo_countries code='IN' by
 *  migration `india_pack_bindings_and_uqc` (via update_country_pack_facts). Keep this
 *  byte-equal with the migration — indiaPack.test.ts validates it against the registry,
 *  and WP-S2/WP-S3 assert threaded TaxContext fields against it. */
export const INDIA_PACK_CONFIG = {
  'regime.tax': 'in_gst',
  'regime.documents': 'in_gst_invoice',
  'regime.numbering': 'in_fiscal_numbering',
  'regime.einvoice': 'no_einvoice',
  'tax.return_composer': 'gstr',
  'tax.filing_frequency': 'monthly',
  'tax.period_anchor': '04-01',
  'tax.rounding_policy': { mode: 'half_up', level: 'head', cash_increment: 1 },
  'format.amount_words_scale': 'indian',
} as const;

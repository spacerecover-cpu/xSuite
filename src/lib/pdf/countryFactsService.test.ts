import { describe, it, expect, vi, beforeEach } from 'vitest';

const maybeSingle = vi.fn();
// geo_countries uses `.select().eq().maybeSingle()`; master_einvoice_regimes
// uses `.select().eq().is().lte().order()` returning ALL active regimes (latest first)
// so the resolver can pick the latest IMPLEMENTED one. regimeState.rows is settable
// per-test (hoisted, since vi.mock's factory is hoisted above top-level consts).
const { regimeState } = vi.hoisted(() => ({
  regimeState: { rows: [] as Array<{ adapter_key: string; mandatory_from: string }> },
}));
vi.mock('../supabaseClient', () => ({
  supabase: {
    from: (table: string) =>
      table === 'master_einvoice_regimes'
        ? {
            select: () => ({
              eq: () => ({
                is: () => ({
                  lte: () => ({
                    order: () => Promise.resolve({ data: regimeState.rows, error: null }),
                  }),
                }),
              }),
            }),
          }
        : { select: () => ({ eq: () => ({ maybeSingle }) }) },
  },
}));

import { getResolvedCountryFacts } from './countryFactsService';

describe('getResolvedCountryFacts (R3, §8b)', () => {
  beforeEach(() => { maybeSingle.mockReset(); regimeState.rows = []; });

  it('maps a geo_countries row to ResolvedCountryFacts (scalar tax_label path)', async () => {
    maybeSingle.mockResolvedValue({
      data: {
        code: 'OM', tax_system: 'VAT', tax_label: 'VAT', tax_number_label: 'VATIN',
        tax_invoice_required: true, language_code: 'ar', decimal_places: 3,
        date_format: 'DD/MM/YYYY', decimal_separator: '.', thousands_separator: ',',
        digit_grouping: '3', address_format: { lines: ['%N', '%O', '%A', '%C %Z'] },
      },
      error: null,
    });
    const facts = await getResolvedCountryFacts('country-uuid');
    expect(facts).toEqual({
      code: 'OM', taxSystem: 'VAT', taxLabel: 'VAT', taxNumberLabel: 'VATIN', taxInvoiceRequired: true,
      languageCode: 'ar', decimalPlaces: 3, dateFormat: 'DD/MM/YYYY',
      decimalSeparator: '.', thousandsSeparator: ',', digitGrouping: '3',
      amountWordsScale: 'western',
      einvoiceRegimeKey: 'no_einvoice',
      addressFormat: '%N %O %A %C %Z',
    });
  });

  it('normalizes a jsonb address_format with no array lines to null (Task 22)', async () => {
    maybeSingle.mockResolvedValue({
      data: {
        code: 'US', tax_system: 'SALES_TAX', tax_label: 'Sales Tax', tax_number_label: null,
        tax_invoice_required: false, language_code: 'en', decimal_places: 2,
        date_format: 'MM/DD/YYYY', decimal_separator: null, thousands_separator: null,
        digit_grouping: null, address_format: null,
      },
      error: null,
    });
    const facts = await getResolvedCountryFacts('country-uuid-2');
    expect(facts?.addressFormat).toBeNull();
  });

  it('returns null (fail-soft, never fabricates US) when country_id is null', async () => {
    expect(await getResolvedCountryFacts(null)).toBeNull();
    expect(maybeSingle).not.toHaveBeenCalled();
  });

  it('returns null when no geo_countries row is found', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await getResolvedCountryFacts('missing')).toBeNull();
  });

  it('routes the QR to the latest IMPLEMENTED regime, not a declared-but-unimplemented later phase', async () => {
    // SA carries zatca_ph1 (implemented) AND zatca_ph2 (clearance, later-mandated, NOT implemented).
    // The resolver must skip the unimplemented latest and pick zatca_ph1 so the Phase-1 QR still emits.
    maybeSingle.mockResolvedValue({
      data: {
        code: 'SA', tax_system: 'VAT', tax_label: 'VAT', tax_number_label: null,
        tax_invoice_required: true, language_code: 'ar', decimal_places: 2,
        date_format: 'DD/MM/YYYY', decimal_separator: '.', thousands_separator: ',',
        digit_grouping: '3', address_format: null,
      },
      error: null,
    });
    regimeState.rows = [
      { adapter_key: 'zatca_ph2', mandatory_from: '2023-01-01' },
      { adapter_key: 'zatca_ph1', mandatory_from: '2021-12-04' },
    ];
    const facts = await getResolvedCountryFacts('sa-uuid');
    expect(facts?.einvoiceRegimeKey).toBe('zatca_ph1');
  });

  it("maps country_config format.amount_words_scale='indian' onto facts.amountWordsScale", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        code: 'IN', tax_system: 'GST', tax_label: 'GST', tax_number_label: 'GSTIN',
        tax_invoice_required: true, language_code: 'en', decimal_places: 2,
        date_format: 'DD/MM/YYYY', decimal_separator: '.', thousands_separator: ',',
        digit_grouping: '3;2', address_format: null,
        country_config: { 'format.amount_words_scale': 'indian' },
      },
      error: null,
    });
    const facts = await getResolvedCountryFacts('in-uuid');
    expect(facts?.amountWordsScale).toBe('indian');
  });

  it("defaults amountWordsScale to 'western' when the country_config binding is absent", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        code: 'OM', tax_system: 'VAT', tax_label: 'VAT', tax_number_label: 'VATIN',
        tax_invoice_required: true, language_code: 'ar', decimal_places: 3,
        date_format: 'DD/MM/YYYY', decimal_separator: '.', thousands_separator: ',',
        digit_grouping: '3', address_format: null,
      },
      error: null,
    });
    const facts = await getResolvedCountryFacts('om-uuid');
    expect(facts?.amountWordsScale).toBe('western');
  });
});

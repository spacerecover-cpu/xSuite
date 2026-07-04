import { describe, it, expect, vi, beforeEach } from 'vitest';

const maybeSingle = vi.fn();
vi.mock('../supabaseClient', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) },
}));

import { getResolvedCountryFacts } from './countryFactsService';

describe('getResolvedCountryFacts (R3, §8b)', () => {
  beforeEach(() => maybeSingle.mockReset());

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
});

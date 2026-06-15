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
        code: 'OM', tax_system: 'VAT', tax_label: 'VAT', tax_invoice_required: true,
        language_code: 'ar', decimal_places: 3, date_format: 'DD/MM/YYYY',
      },
      error: null,
    });
    const facts = await getResolvedCountryFacts('country-uuid');
    expect(facts).toEqual({
      code: 'OM', taxSystem: 'VAT', taxLabel: 'VAT', taxInvoiceRequired: true,
      languageCode: 'ar', decimalPlaces: 3, dateFormat: 'DD/MM/YYYY',
    });
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

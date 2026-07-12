import { describe, it, expect, vi } from 'vitest';

// `vi.mock` factories are hoisted above imports, so any variable they close
// over must be created via `vi.hoisted` (a bare top-level `const` here would
// still be in its TDZ when the factory first runs) — same convention as
// taxDocumentService.test.ts.
const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../supabaseClient', () => ({ supabase: { from } }));
vi.mock('../currencyService', () => ({
  resolveRateContext: vi.fn(async () => ({
    documentCurrency: 'OMR', documentDecimals: 3, baseCurrency: 'OMR', baseDecimals: 3,
    rate: 1, rateSource: 'derived',
  })),
}));

import { computeStockSaleTax } from './assembleStockSaleContext';

/** Thenable query builder covering every chain shape this module issues
 *  (array reads end the chain on .is/.or/.order; the single tenant read ends
 *  on .maybeSingle()). */
function makeQuery(data: unknown) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    or: vi.fn(() => builder),
    order: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve({ data, error: null })),
    then: (resolve: (v: { data: unknown; error: null }) => void) => resolve({ data, error: null }),
  };
  return builder;
}

describe('computeStockSaleTax (kernel parity for POS sales)', () => {
  it('computes a single VAT rollup for an exclusive POS sale', async () => {
    const legalEntitiesQuery = makeQuery([
      {
        id: 'le-1', tenant_id: 'tenant-1', country_id: 'om', subdivision_id: null,
        tax_identifier: 'OM-TAX-1', is_primary: true,
      },
    ]);
    const tenantQuery = makeQuery({
      id: 'tenant-1', timezone: 'Asia/Muscat', base_currency_code: 'OMR',
      resolved_country_config: {
        'regime.tax': 'simple_vat',
        'tax.rounding_policy': { mode: 'half_up', level: 'document' },
      },
    });
    const registrationsQuery = makeQuery([]);
    const ratesQuery = makeQuery([
      {
        id: 'r1', country_id: 'om', subdivision_id: null, component_code: 'VAT', component_label: 'VAT',
        tax_category: 'standard', rate: 5.0, applies_to: null, valid_from: '2021-04-16', valid_to: null, sort_order: 0,
      },
    ]);
    from.mockImplementation((table: string) => {
      switch (table) {
        case 'legal_entities': return legalEntitiesQuery;
        case 'tenants': return tenantQuery;
        case 'legal_entity_tax_registrations': return registrationsQuery;
        case 'geo_country_tax_rates': return ratesQuery;
        default: throw new Error(`unexpected table: ${table}`);
      }
    });

    const comp = await computeStockSaleTax({
      lines: [{ lineItemId: null, description: 'SATA cable', quantity: 2, unitPrice: 5,
        lineDiscount: 0, unitCode: 'C62', itemCode: null, treatment: 'standard', treatmentReasonCode: null }],
      documentDiscount: 0,
      taxInclusive: false,
    });
    expect(comp.rollups).toHaveLength(1);
    expect(comp.rollups[0]).toMatchObject({ componentCode: 'VAT', rate: 5, taxAmount: 0.5 });
    expect(comp.totals.grandTotal).toBe(10.5);
  });

  /** India multi-slab pack (in_gst). Regression for the slab + place-of-supply
   *  bug: without narrowing, the split kernel selected EVERY standard row and
   *  stacked all four slabs (5+12+18+28 = 63% across CGST/SGST/IGST). A counter
   *  sale is intra-state, so the correct answer is CGST 9 + SGST 9 = 18 on ₹100. */
  const IN_GST_SLABS = [5, 12, 18, 28].flatMap((slab, i) => {
    const half = slab / 2;
    return [
      { id: `cgst-${slab}`, country_id: 'in', subdivision_id: null, component_code: 'CGST', component_label: 'CGST',
        tax_category: 'standard', rate: half, applies_to: `gst_slab_${slab}`, valid_from: '2017-07-01', valid_to: null, sort_order: i * 3 },
      { id: `sgst-${slab}`, country_id: 'in', subdivision_id: null, component_code: 'SGST', component_label: 'SGST',
        tax_category: 'standard', rate: half, applies_to: `gst_slab_${slab}`, valid_from: '2017-07-01', valid_to: null, sort_order: i * 3 + 1 },
      { id: `igst-${slab}`, country_id: 'in', subdivision_id: null, component_code: 'IGST', component_label: 'IGST',
        tax_category: 'standard', rate: slab, applies_to: `gst_slab_${slab}`, valid_from: '2017-07-01', valid_to: null, sort_order: i * 3 + 2 },
    ];
  });

  function wireIndiaTenant(rates: unknown[]) {
    const legalEntitiesQuery = makeQuery([
      { id: 'le-1', tenant_id: 'tenant-in', country_id: 'in', subdivision_id: 'in-ka',
        tax_identifier: '29AAAAA0000A1Z5', is_primary: true },
    ]);
    const tenantQuery = makeQuery({
      id: 'tenant-in', timezone: 'Asia/Kolkata', base_currency_code: 'INR',
      resolved_country_config: {
        'regime.tax': 'in_gst',
        'tax.rounding_policy': { mode: 'half_up', level: 'head' },
      },
    });
    const registrationsQuery = makeQuery([]);
    const ratesQuery = makeQuery(rates);
    from.mockImplementation((table: string) => {
      switch (table) {
        case 'legal_entities': return legalEntitiesQuery;
        case 'tenants': return tenantQuery;
        case 'legal_entity_tax_registrations': return registrationsQuery;
        case 'geo_country_tax_rates': return ratesQuery;
        default: throw new Error(`unexpected table: ${table}`);
      }
    });
  }

  it('narrows a split-levy (India GST) counter sale to intra-state CGST+SGST for its slab', async () => {
    wireIndiaTenant(IN_GST_SLABS);

    const comp = await computeStockSaleTax({
      lines: [{ lineItemId: null, description: 'SATA cable', quantity: 1, unitPrice: 100,
        lineDiscount: 0, unitCode: null, itemCode: null, treatment: 'standard', treatmentReasonCode: null }],
      documentDiscount: 0,
      taxInclusive: false,
      taxRate: 18,
    });

    // Intra-state: exactly CGST + SGST at half the slab each — never IGST, and
    // never the 63% stack of all four slabs.
    expect(comp.rollups.map((r) => r.componentCode).sort()).toEqual(['CGST', 'SGST']);
    expect(comp.rollups.find((r) => r.componentCode === 'CGST')).toMatchObject({ rate: 9, taxAmount: 9 });
    expect(comp.rollups.find((r) => r.componentCode === 'SGST')).toMatchObject({ rate: 9, taxAmount: 9 });
    expect(comp.totals.taxTotal).toBe(18);
    expect(comp.totals.grandTotal).toBe(118);
  });

  it('refuses to guess a slab for a multi-slab pack when no taxRate is supplied', async () => {
    wireIndiaTenant(IN_GST_SLABS);

    await expect(
      computeStockSaleTax({
        lines: [{ lineItemId: null, description: 'SATA cable', quantity: 1, unitPrice: 100,
          lineDiscount: 0, unitCode: null, itemCode: null, treatment: 'standard', treatmentReasonCode: null }],
        documentDiscount: 0,
        taxInclusive: false,
      }),
    ).rejects.toThrow(/must specify which slab/);
  });
});

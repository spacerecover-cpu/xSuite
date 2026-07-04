import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeDocumentTax } from './tax/kernel';
import type { GeoCountryTaxRateRow, TaxContext } from './regimes/types';
import type { RateContext } from './currencyService';

// createQuote regression harness (silent-drop bug, Task 23): the collected
// unit_code/unit_label/item_code fields were dropped between the caller-facing
// QuoteItem and the quote_items insert payload. Full dependency surface is
// mocked so the only thing under test is the shape of the captured insert.
const { rpc, from, getUser, resolveTenantId } = vi.hoisted(() => ({
  rpc: vi.fn(), from: vi.fn(), getUser: vi.fn(), resolveTenantId: vi.fn(),
}));
vi.mock('./supabaseClient', () => ({
  supabase: { rpc, from, auth: { getUser } },
  resolveTenantId,
}));
vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('./auditTrailService', () => ({ logAuditTrail: vi.fn() }));
vi.mock('./chainOfCustodyService', () => ({ logQuoteCreated: vi.fn(), logQuoteStatusChanged: vi.fn() }));
vi.mock('./currencyService', () => ({
  resolveRateContext: vi.fn(() => Promise.resolve({
    documentCurrency: 'OMR', documentDecimals: 3, baseCurrency: 'OMR', baseDecimals: 3,
    rate: 1, rateSource: 'derived',
  })),
  getBaseCurrency: vi.fn(() => Promise.resolve('OMR')),
  getCurrencyDecimals: vi.fn(() => Promise.resolve(3)),
}));
vi.mock('./taxDocumentService', () => ({
  computeDocumentTotals: vi.fn(() => Promise.resolve({
    computation: { lines: [], totals: { taxableBase: 200, taxTotal: 10, grandTotal: 210 } },
    subtotal: 200, taxAmount: 10, totalAmount: 210,
  })),
  persistDocumentTaxLines: vi.fn(() => Promise.resolve()),
}));

import { createQuote } from './quotesService';

// Kernel parity pin (M-G): locks the canonical quote shape (12 × OMR 120.000 @5%,
// no discount, 3-dp) that quotesService now routes through the fiscal kernel.
// Task 32 deleted the legacy calculateQuoteTotals; the kernel is canonical. The
// same shape is the spec walkthrough in tax/kernel/computeDocumentTax.test.ts →
// taxable 1440.000, VAT 72.000, total 1512.000. This keeps those locked constants
// under the quotesService name.

const omrRc: RateContext = {
  documentCurrency: 'OMR', documentDecimals: 3, baseCurrency: 'OMR', baseDecimals: 3,
  rate: 1, rateSource: 'derived',
};
const omVat5: GeoCountryTaxRateRow = {
  id: 'rate-om-vat-std', country_id: 'om', subdivision_id: null, component_code: 'VAT',
  component_label: 'VAT', tax_category: 'standard', rate: 5, applies_to: null,
  valid_from: '2021-04-16', valid_to: null, sort_order: 0,
};

describe('quotesService cutover parity pin (kernel is canonical)', () => {
  it('kernel pins the OMR quote shape (subtotal 1440, VAT 72, total 1512)', () => {
    const ctx: TaxContext = {
      documentType: 'quote',
      seller: { legalEntityId: 'le', countryId: 'om', subdivisionId: null, taxIdentifier: 'OM123', registrations: [] },
      buyer: { taxNumber: null, countryId: null, subdivisionId: null, isBusiness: false, addressSnapshot: null },
      taxPointDate: '2026-07-02', placeOfSupplySubdivisionId: null,
      lines: [
        { lineItemId: null, description: 'Recovery service', quantity: 12, unitPrice: 120, lineDiscount: 0, unitCode: null, itemCode: null, treatment: 'standard', treatmentReasonCode: null },
      ],
      documentDiscount: 0, taxInclusive: false,
      rateContext: omrRc, rates: [omVat5],
      roundingPolicy: { mode: 'half_up', level: 'document' }, scaleSystem: 'western',
    };
    const c = computeDocumentTax(ctx);
    expect(c.totals.taxableBase).toBe(1440);
    expect(c.totals.taxTotal).toBe(72);
    expect(c.totals.grandTotal).toBe(1512);
  });
});

/** Chainable quotes/quote_items builder: insert/select/eq/is/order chain; awaiting yields {data}. */
function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ['insert', 'select', 'eq', 'is', 'order', 'update']) c[m] = vi.fn(() => c);
  c.maybeSingle = vi.fn(() => Promise.resolve(result));
  c.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return c;
}

describe('createQuote — unit/item-code persistence (regression for the silent-drop bug)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    resolveTenantId.mockResolvedValue('tenant-1');
    rpc.mockResolvedValue({ data: 'Q-0001', error: null });
  });

  it('persists unit_code, unit_label, and item_code on the quote_items insert payload', async () => {
    let capturedItemsInsert: unknown[] = [];
    from.mockImplementation((table: string) => {
      if (table === 'quotes') {
        return chain({ data: { id: 'quote-1', quote_number: 'Q-0001', total_amount: 210 }, error: null });
      }
      if (table === 'quote_items') {
        const c = chain({ data: [{ id: 'item-1', sort_order: 0 }], error: null });
        c.insert = vi.fn((rows: unknown[]) => {
          capturedItemsInsert = rows;
          return c;
        });
        return c;
      }
      return chain({ data: null, error: null });
    });

    await createQuote(
      { case_id: 'case-1', customer_id: 'cust-1', company_id: null, status: 'draft' },
      [{ description: 'RAID recovery', quantity: 2, unit_price: 100, unit_code: 'C62', unit_label: 'Piece', item_code: '998713' }],
    );

    expect(capturedItemsInsert).toHaveLength(1);
    expect(capturedItemsInsert[0]).toMatchObject({
      unit_code: 'C62',
      unit_label: 'Piece',
      item_code: '998713',
    });
  });
});

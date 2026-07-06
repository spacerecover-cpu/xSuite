import { describe, it, expect, vi, beforeEach } from 'vitest';

const { computeTotalsSpy, insertedPayloads, fromMock } = vi.hoisted(() => {
  const insertedPayloads: Record<string, unknown[]> = {};
  const computeTotalsSpy = vi.fn(async () => ({
    computation: {
      lines: [], rollups: [],
      totals: { taxableBase: 8000, taxTotal: 1440, grandTotal: 9440, roundingAdjustment: null },
      expectedWithholding: null, notations: [],
      trace: { regimeKey: 'simple_vat', pluginVersion: 't', packVersionId: null, schemeMode: 'single', steps: [] },
    },
    subtotal: 8000, taxAmount: 1440, totalAmount: 9440,
    placeOfSupplySubdivisionId: 'sub-ka',
  }));
  const rowFor = (table: string): unknown =>
    table === 'invoices'
      ? {
          id: 'inv-1', invoice_number: null, due_date: null,
          status: 'draft', payment_status: 'unpaid', invoice_type: 'tax_invoice',
          total_amount: 0, amount_paid: 0, balance_due: 0,
          currency: 'INR', exchange_rate: 1, rate_source: 'derived',
          customer_id: 'cust-existing', company_id: null,
        }
      : [{ id: 'li-1', sort_order: 0 }];
  const fromMock = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    chain.insert = vi.fn((payload: unknown) => {
      (insertedPayloads[table] ??= []).push(Array.isArray(payload) ? payload[0] : payload);
      return chain;
    });
    chain.update = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.is = vi.fn(() => chain);
    chain.select = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => ({ data: rowFor(table), error: null }));
    (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: rowFor(table), error: null });
    return chain;
  });
  return { computeTotalsSpy, insertedPayloads, fromMock };
});

vi.mock('./supabaseClient', () => ({
  supabase: { from: fromMock, rpc: vi.fn(async () => ({ data: 'X-1', error: null })), auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u-1' } } })) } },
  resolveTenantId: vi.fn(async () => 't-1'),
}));
vi.mock('./taxDocumentService', () => ({
  computeDocumentTotals: computeTotalsSpy,
  persistDocumentTaxLines: vi.fn(async () => undefined),
  issueTaxDocument: vi.fn(async () => ({})),
}));
vi.mock('./currencyService', () => ({
  resolveRateContext: vi.fn(async () => ({ documentCurrency: 'INR', documentDecimals: 2, baseCurrency: 'INR', baseDecimals: 2, rate: 1, rateSource: 'derived' })),
  getBaseCurrency: vi.fn(async () => 'INR'),
  getCurrencyDecimals: vi.fn(async () => 2),
}));
vi.mock('./auditTrailService', () => ({ logAuditTrail: vi.fn(async () => undefined) }));
vi.mock('./chainOfCustodyService', () => ({ logInvoiceCreated: vi.fn(async () => undefined), logInvoicePayment: vi.fn(async () => undefined) }));
vi.mock('./rateLimiter', () => ({
  checkRateLimit: vi.fn(async () => undefined),
  RATE_LIMITS: new Proxy({}, { get: () => ({ maxRequests: 1000, windowMs: 60000 }) }),
}));
vi.mock('./tenantConfigService', () => ({ getTenantConfig: vi.fn(async () => ({})) }));
vi.mock('./tenantToday', () => ({ currentTenantToday: vi.fn(async () => '2026-07-05') }));

import { createInvoice, updateInvoice } from './invoiceService';

beforeEach(() => {
  computeTotalsSpy.mockClear();
  for (const k of Object.keys(insertedPayloads)) delete insertedPayloads[k];
});

describe('createInvoice — buyer threading + place-of-supply persistence (P4 S2)', () => {
  it('passes customerId/companyId to computeDocumentTotals and persists place_of_supply_subdivision_id', async () => {
    await createInvoice(
      { case_id: 'case-1', customer_id: 'cust-1', company_id: null, invoice_type: 'tax_invoice', invoice_date: '2026-07-05', tax_rate: 18 },
      [{ description: 'Data recovery — evaluation', quantity: 1, unit_price: 8000 }],
    );
    expect(computeTotalsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cust-1', companyId: null }),
      expect.anything(),
    );
    expect(insertedPayloads['invoices'][0]).toMatchObject({ place_of_supply_subdivision_id: 'sub-ka' });
  });
});

describe('updateInvoice — buyer resolution semantics (P4 S2 review #7)', () => {
  it('a line-only edit (no customer_id in the patch) keeps the persisted buyer', async () => {
    await updateInvoice('inv-1', { tax_rate: 18 }, [{ description: 'x', quantity: 1, unit_price: 8000 }] as never);
    expect(computeTotalsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cust-existing', companyId: null }), expect.anything());
  });
  it('an explicit customer_id:null clears the buyer (place of supply derives from null, not the stale row buyer)', async () => {
    await updateInvoice('inv-1', { customer_id: null }, [{ description: 'x', quantity: 1, unit_price: 8000 }] as never);
    expect(computeTotalsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: null, companyId: null }), expect.anything());
  });
});

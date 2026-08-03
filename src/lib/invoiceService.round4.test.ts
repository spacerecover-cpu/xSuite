import { describe, it, expect, vi, beforeEach } from 'vitest';

// Round-4 regressions for invoiceService:
//   Finding 1 — bulkSendInvoiceEmails must resolve a COMPANY recipient. A
//              company-billed invoice (customer_id null, company.email set) was
//              always reported "skipped: Customer has no email" and never sent.
//   Finding 2 — createInvoice must not persist a settlement status on a proforma;
//              a proforma cannot take payments, so 'paid'/'partial'/'overdue' would
//              show a settled document with zero payment rows behind it.
//   Finding 3 — the bulk-send template context hardcoded caseNumber/companyName to
//              '', so every bulk email shipped as "Invoice - " signed " Team".

const { fromMock, state, sendSpy, templateSpy } = vi.hoisted(() => {
  const state: {
    emailRows: Array<Record<string, unknown>>;
    inserted: Record<string, unknown[]>;
  } = { emailRows: [], inserted: {} };

  const sendSpy = vi.fn(async () => ({ success: true }));
  const templateSpy = vi.fn(() => ({ subject: 's', body: 'b' }));

  const fromMock = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    chain.insert = vi.fn((payload: unknown) => {
      (state.inserted[table] ??= []).push(Array.isArray(payload) ? payload[0] : payload);
      return chain;
    });
    chain.update = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.is = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.select = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => {
      if (table === 'invoices') {
        return { data: { id: 'inv-new', invoice_number: 'PRO-1', due_date: null }, error: null };
      }
      return { data: { id: 'li-1', sort_order: 0 }, error: null };
    });
    (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
      resolve({
        data: table === 'invoices' ? state.emailRows : [{ id: 'li-1', sort_order: 0 }],
        error: null,
      });
    return chain;
  });

  return { fromMock, state, sendSpy, templateSpy };
});

vi.mock('./supabaseClient', () => ({
  supabase: { from: fromMock, rpc: vi.fn(async () => ({ data: 'PRO-1', error: null })) },
  resolveTenantId: vi.fn(async () => 't-1'),
}));
vi.mock('./auditTrailService', () => ({ logAuditTrail: vi.fn(async () => undefined) }));
vi.mock('./chainOfCustodyService', () => ({
  logInvoiceCreated: vi.fn(async () => undefined),
  logInvoicePayment: vi.fn(async () => undefined),
}));
vi.mock('./taxDocumentService', () => ({
  computeDocumentTotals: vi.fn(async () => ({ computation: { lines: [] }, subtotal: 0, taxAmount: 0, totalAmount: 0, placeOfSupplySubdivisionId: null })),
  persistDocumentTaxLines: vi.fn(async () => undefined),
  issueTaxDocument: vi.fn(async () => ({})),
}));
vi.mock('./currencyService', () => ({
  resolveRateContext: vi.fn(async () => ({ documentCurrency: 'INR', documentDecimals: 2, baseCurrency: 'INR', baseDecimals: 2, rate: 1, rateSource: 'derived' })),
  getBaseCurrency: vi.fn(async () => 'INR'),
  getCurrencyDecimals: vi.fn(async () => 2),
}));
vi.mock('./rateLimiter', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  RATE_LIMITS: new Proxy({}, { get: () => ({ maxRequests: 1000, windowMs: 10 }) }),
}));
vi.mock('./tenantConfigService', () => ({ getTenantConfig: vi.fn(async () => ({})) }));
vi.mock('./tenantToday', () => ({ currentTenantToday: vi.fn(async () => '2026-08-03') }));
vi.mock('./companySettingsService', () => ({
  getOrCreateCompanySettings: vi.fn(async () => ({ basic_info: { company_name: 'Space Data Recovery' } })),
}));
vi.mock('./emailDocumentService', () => ({ sendDocumentEmail: sendSpy }));
vi.mock('./emailTemplates', () => ({ getEmailTemplate: templateSpy }));
vi.mock('./pdf/pdfService', () => ({
  generateInvoiceAsBlob: vi.fn(async () => ({ success: true, blob: new Blob(['x']), filename: 'inv.pdf' })),
  generateInvoice: vi.fn(async () => ({ success: true })),
}));

import { bulkSendInvoiceEmails, createInvoice, normalizeProformaCreateStatus } from './invoiceService';

beforeEach(() => {
  state.emailRows = [];
  for (const k of Object.keys(state.inserted)) delete state.inserted[k];
  sendSpy.mockClear();
  templateSpy.mockClear();
});

describe('bulkSendInvoiceEmails — Finding 1: company recipients are resolved', () => {
  it('sends a company-billed invoice (no customer) to the company email', async () => {
    state.emailRows = [{
      id: 'inv-co', invoice_number: 'INV-9', status: 'sent', invoice_type: 'tax_invoice', case_id: 'c1',
      customers_enhanced: null,
      companies: { name: 'Acme Holdings', company_name: 'Acme Holdings LLC', email: 'billing@acme.com' },
      cases: { case_no: 'CASE-0042' },
    }];

    const results = await bulkSendInvoiceEmails(['inv-co']);

    expect(results[0].status).toBe('sent');
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect((sendSpy.mock.calls[0] as unknown[])[0]).toMatchObject({ to: 'billing@acme.com' });
  });

  it('still skips when neither the customer nor the company has an email', async () => {
    state.emailRows = [{
      id: 'inv-none', invoice_number: 'INV-10', status: 'sent', invoice_type: 'tax_invoice', case_id: 'c1',
      customers_enhanced: null,
      companies: { name: 'Acme Holdings', company_name: null, email: null },
      cases: { case_no: 'CASE-0043' },
    }];

    const results = await bulkSendInvoiceEmails(['inv-none']);

    expect(results[0].status).toBe('skipped');
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('prefers the customer email over the company email when both exist', async () => {
    state.emailRows = [{
      id: 'inv-both', invoice_number: 'INV-11', status: 'sent', invoice_type: 'tax_invoice', case_id: 'c1',
      customers_enhanced: { customer_name: 'Jane Doe', email: 'jane@acme.com' },
      companies: { name: 'Acme Holdings', company_name: 'Acme Holdings LLC', email: 'billing@acme.com' },
      cases: { case_no: 'CASE-0044' },
    }];

    await bulkSendInvoiceEmails(['inv-both']);

    expect((sendSpy.mock.calls[0] as unknown[])[0]).toMatchObject({ to: 'jane@acme.com' });
  });
});

describe('bulkSendInvoiceEmails — Finding 3: template context carries real identifiers', () => {
  it('passes the case number and the tenant company name into the template', async () => {
    state.emailRows = [{
      id: 'inv-ctx', invoice_number: 'INV-12', status: 'sent', invoice_type: 'tax_invoice', case_id: 'c1',
      customers_enhanced: { customer_name: 'Jane Doe', email: 'jane@acme.com' },
      companies: null,
      cases: { case_no: 'CASE-0045' },
    }];

    await bulkSendInvoiceEmails(['inv-ctx']);

    expect(templateSpy).toHaveBeenCalledWith('invoice', expect.objectContaining({
      customerName: 'Jane Doe',
      caseNumber: 'CASE-0045',
      companyName: 'Space Data Recovery',
    }));
  });

  it('falls back to the invoice number when the invoice has no case', async () => {
    state.emailRows = [{
      id: 'inv-nocase', invoice_number: 'INV-13', status: 'sent', invoice_type: 'tax_invoice', case_id: null,
      customers_enhanced: { customer_name: 'Jane Doe', email: 'jane@acme.com' },
      companies: null,
      cases: null,
    }];

    await bulkSendInvoiceEmails(['inv-nocase']);

    expect(templateSpy).toHaveBeenCalledWith('invoice', expect.objectContaining({ caseNumber: 'INV-13' }));
  });
});

describe('createInvoice — Finding 2: a proforma cannot be created settled', () => {
  const proforma = (status: string) => ({
    case_id: 'case-1',
    invoice_type: 'proforma' as const,
    invoice_date: '2026-08-03',
    due_date: '2026-08-17',
    status,
  });

  const lastInvoiceInsert = () =>
    ((state.inserted['invoices'] ?? []).slice(-1)[0] ?? {}) as Record<string, unknown>;

  it.each(['paid', 'partial', 'overdue'])(
    'clamps the settlement status %s to draft',
    async (status) => {
      await createInvoice(proforma(status), []);
      expect(lastInvoiceInsert().status).toBe('draft');
    },
  );

  it('keeps a legitimate pre-settlement status', async () => {
    await createInvoice(proforma('sent'), []);
    expect(lastInvoiceInsert().status).toBe('sent');
  });

  it('normalizeProformaCreateStatus is the pure guard behind it', () => {
    expect(normalizeProformaCreateStatus('paid')).toBe('draft');
    expect(normalizeProformaCreateStatus(undefined)).toBe('draft');
    expect(normalizeProformaCreateStatus('sent')).toBe('sent');
    expect(normalizeProformaCreateStatus('cancelled')).toBe('cancelled');
  });
});

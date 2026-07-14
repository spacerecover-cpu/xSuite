import { describe, it, expect, vi, beforeEach } from 'vitest';

// State/audit guards for invoiceService:
//   Bug 52 — the restricted-edit path (issued/paid invoices) must still write an
//            audit_trails row (append-only mandate), like the full-edit path.
//   Bug 53 — the full-edit path must NOT persist a caller-supplied status on a tax
//            invoice (status is machine-owned via issuance/payment paths).
//   Bug 54 — bulk emailing must not clobber a paid/partial/overdue status back to
//            'sent' when re-sending a copy.
// invoicePermissions (getInvoiceEditability) is intentionally left UNMOCKED — these
// tests exercise the real editability derivation.

const { fromMock, state, logAuditTrailSpy } = vi.hoisted(() => {
  const state: {
    invoiceRow: Record<string, unknown>;
    updates: Record<string, unknown[]>;
    emailRows: Array<Record<string, unknown>>;
  } = { invoiceRow: {}, updates: {}, emailRows: [] };

  const logAuditTrailSpy = vi.fn(async () => undefined);

  const fromMock = vi.fn((table: string) => {
    const listData = () => (table === 'invoices' ? state.emailRows : [{ id: 'li-1', sort_order: 0 }]);
    const singleData = () => (table === 'invoices' ? state.invoiceRow : { id: 'li-1', sort_order: 0 });
    const chain: Record<string, unknown> = {};
    chain.insert = vi.fn(() => chain);
    chain.update = vi.fn((payload: unknown) => {
      (state.updates[table] ??= []).push(payload);
      return chain;
    });
    chain.eq = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.is = vi.fn(() => chain);
    chain.select = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => ({ data: singleData(), error: null }));
    (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: listData(), error: null });
    return chain;
  });
  return { fromMock, state, logAuditTrailSpy };
});

vi.mock('./supabaseClient', () => ({
  supabase: { from: fromMock, rpc: vi.fn(async () => ({ data: 'X-1', error: null })) },
  resolveTenantId: vi.fn(async () => 't-1'),
}));
vi.mock('./auditTrailService', () => ({ logAuditTrail: logAuditTrailSpy }));
vi.mock('./chainOfCustodyService', () => ({ logInvoiceCreated: vi.fn(async () => undefined), logInvoicePayment: vi.fn(async () => undefined) }));
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
vi.mock('./rateLimiter', () => ({ checkRateLimit: vi.fn(() => ({ allowed: true })), RATE_LIMITS: new Proxy({}, { get: () => ({ maxRequests: 1000, windowMs: 60000 }) }) }));
vi.mock('./tenantConfigService', () => ({ getTenantConfig: vi.fn(async () => ({})) }));
vi.mock('./tenantToday', () => ({ currentTenantToday: vi.fn(async () => '2026-07-05') }));
// Email/PDF transport for the bulk-send path.
vi.mock('./emailDocumentService', () => ({ sendDocumentEmail: vi.fn(async () => ({ success: true })) }));
vi.mock('./emailTemplates', () => ({ getEmailTemplate: vi.fn(() => ({ subject: 's', body: 'b' })) }));
vi.mock('./pdf/pdfService', () => ({
  generateInvoiceAsBlob: vi.fn(async () => ({ success: true, blob: new Blob(['x']), filename: 'inv.pdf' })),
  generateInvoice: vi.fn(async () => ({ success: true })),
}));

import { updateInvoice, bulkSendInvoiceEmails } from './invoiceService';

const lastInvoiceUpdate = () => {
  const u = state.updates['invoices'] ?? [];
  return (u[u.length - 1] ?? {}) as Record<string, unknown>;
};

beforeEach(() => {
  state.invoiceRow = {};
  state.emailRows = [];
  for (const k of Object.keys(state.updates)) delete state.updates[k];
  logAuditTrailSpy.mockClear();
});

describe('updateInvoice — Bug 52: restricted edit still writes an audit_trails row', () => {
  it('editing an issued invoice (restricted mode) calls logAuditTrail with the persisted fields', async () => {
    state.invoiceRow = {
      status: 'sent', payment_status: 'unpaid', invoice_type: 'tax_invoice',
      total_amount: 100, amount_paid: 0, balance_due: 100, due_date: '2026-07-01',
    };
    await updateInvoice('inv-1', { due_date: '2026-08-01', status: 'paid' } as never);
    expect(logAuditTrailSpy).toHaveBeenCalledTimes(1);
    expect(logAuditTrailSpy).toHaveBeenCalledWith(
      'update', 'invoices', 'inv-1', {}, expect.objectContaining({ due_date: '2026-08-01' }),
    );
    // status is not a restricted-editable field, so it must not leak into the write.
    const auditPayload = (logAuditTrailSpy.mock.calls[0] as unknown[])[4] as Record<string, unknown>;
    expect(auditPayload).not.toHaveProperty('status');
  });
});

describe('updateInvoice — Bug 53: caller status is not persisted on a tax invoice', () => {
  it('a full-edit of a draft tax invoice strips a caller-supplied status', async () => {
    state.invoiceRow = {
      status: 'draft', payment_status: 'unpaid', invoice_type: 'tax_invoice',
      total_amount: 100, amount_paid: 0, balance_due: 100, due_date: null,
    };
    await updateInvoice('inv-1', { status: 'paid', notes: 'edited' } as never);
    expect(lastInvoiceUpdate()).not.toHaveProperty('status');
    expect(lastInvoiceUpdate()).toMatchObject({ notes: 'edited' });
  });

  it('a proforma keeps its caller-supplied status (guard is tax-invoice only)', async () => {
    state.invoiceRow = {
      status: 'draft', payment_status: 'unpaid', invoice_type: 'proforma',
      total_amount: 100, amount_paid: 0, balance_due: 100, due_date: null,
    };
    await updateInvoice('inv-1', { status: 'sent' } as never);
    expect(lastInvoiceUpdate()).toMatchObject({ status: 'sent' });
  });
});

describe('bulkSendInvoiceEmails — Bug 54: re-send never clobbers a settled status', () => {
  it('a paid invoice keeps status=paid and only stamps sent_at', async () => {
    state.emailRows = [{
      id: 'inv-paid', invoice_number: 'INV-1', status: 'paid', case_id: 'c1',
      customers_enhanced: { customer_name: 'Acme', email: 'a@b.com' },
    }];
    const results = await bulkSendInvoiceEmails(['inv-paid']);
    expect(results[0].status).toBe('sent'); // the send outcome, not the invoice status
    const payload = lastInvoiceUpdate();
    expect(payload).toHaveProperty('sent_at');
    expect(payload.status).toBe('paid');
  });

  it('a draft invoice is advanced to sent', async () => {
    state.emailRows = [{
      id: 'inv-draft', invoice_number: null, status: 'draft', case_id: 'c2',
      customers_enhanced: { customer_name: 'Acme', email: 'a@b.com' },
    }];
    await bulkSendInvoiceEmails(['inv-draft']);
    expect(lastInvoiceUpdate().status).toBe('sent');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

// bulkSendInvoiceEmails must PACE its sends to the transport's own rate limit.
// sendDocumentEmail's gate rejects rather than queues, so an unpaced loop drains
// the whole window on the first `maxRequests` rows and reports every remaining
// invoice as a rate-limit failure — while the UI promised "~N minute(s)".
// RATE_LIMITS is mocked to a tiny window (250ms / 5 => 50ms per send) so the
// real-timer assertions here stay fast.

const { fromMock, state, sendSpy, WINDOW_MS, MAX_REQUESTS } = vi.hoisted(() => {
  // vi.mock factories are hoisted above module-level consts, so the limit the
  // rateLimiter mock reports has to be declared in here.
  const WINDOW_MS = 250;
  const MAX_REQUESTS = 5;

  const state: { emailRows: Array<Record<string, unknown>>; sendTimes: number[] } = {
    emailRows: [],
    sendTimes: [],
  };

  const sendSpy = vi.fn(async () => {
    state.sendTimes.push(Date.now());
    return { success: true };
  });

  const fromMock = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    chain.update = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.is = vi.fn(() => chain);
    chain.select = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: state.emailRows, error: null });
    return chain;
  });

  return { fromMock, state, sendSpy, WINDOW_MS, MAX_REQUESTS };
});

const EXPECTED_INTERVAL_MS = WINDOW_MS / MAX_REQUESTS;

vi.mock('./supabaseClient', () => ({
  supabase: { from: fromMock, rpc: vi.fn(async () => ({ data: null, error: null })) },
  resolveTenantId: vi.fn(async () => 't-1'),
}));
vi.mock('./rateLimiter', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  RATE_LIMITS: { EMAIL_SEND: { key: 'email_send', maxRequests: MAX_REQUESTS, windowMs: WINDOW_MS } },
}));
vi.mock('./auditTrailService', () => ({ logAuditTrail: vi.fn(async () => undefined) }));
vi.mock('./chainOfCustodyService', () => ({
  logInvoiceCreated: vi.fn(async () => undefined),
  logInvoicePayment: vi.fn(async () => undefined),
}));
vi.mock('./emailDocumentService', () => ({ sendDocumentEmail: sendSpy }));
vi.mock('./emailTemplates', () => ({ getEmailTemplate: vi.fn(() => ({ subject: 's', body: 'b' })) }));
vi.mock('./pdf/pdfService', () => ({
  generateInvoiceAsBlob: vi.fn(async () => ({ success: true, blob: new Blob(['x']), filename: 'inv.pdf' })),
  generateInvoice: vi.fn(async () => ({ success: true })),
}));

import { bulkSendInvoiceEmails } from './invoiceService';

const row = (id: string, email: string | null) => ({
  id,
  invoice_number: id.toUpperCase(),
  status: 'sent',
  invoice_type: 'tax_invoice',
  case_id: 'c1',
  customers_enhanced: email ? { customer_name: 'Acme', email } : null,
});

beforeEach(() => {
  state.emailRows = [];
  state.sendTimes = [];
  sendSpy.mockClear();
});

describe('bulkSendInvoiceEmails — throttles to the documented email rate', () => {
  it('spaces consecutive sends by one window-slice instead of firing them back to back', async () => {
    state.emailRows = [row('inv-1', 'a@b.com'), row('inv-2', 'b@b.com'), row('inv-3', 'c@b.com')];

    const results = await bulkSendInvoiceEmails(['inv-1', 'inv-2', 'inv-3']);

    expect(results.map((r) => r.status)).toEqual(['sent', 'sent', 'sent']);
    expect(state.sendTimes).toHaveLength(3);
    // Timer slack: setTimeout may fire a hair early on some platforms.
    const floor = EXPECTED_INTERVAL_MS - 5;
    expect(state.sendTimes[1] - state.sendTimes[0]).toBeGreaterThanOrEqual(floor);
    expect(state.sendTimes[2] - state.sendTimes[1]).toBeGreaterThanOrEqual(floor);
  });

  it('does not pace rows that never reach the transport (skipped for no email)', async () => {
    state.emailRows = [row('inv-1', null), row('inv-2', null), row('inv-3', 'c@b.com')];

    const started = Date.now();
    const results = await bulkSendInvoiceEmails(['inv-1', 'inv-2', 'inv-3']);

    expect(results.map((r) => r.status)).toEqual(['skipped', 'skipped', 'sent']);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    // Only one real send, so the batch must not have waited at all.
    expect(Date.now() - started).toBeLessThan(EXPECTED_INTERVAL_MS);
  });
});

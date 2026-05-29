import { describe, it, expect } from 'vitest';
import { deriveInvoiceStatus } from './invoiceStatus';

// Pins the single payment-status rule extracted from the five inlined call sites.
// The two divergent dimensions across those sites — the "partially paid" label
// ('partial' in financial/payments, 'partially-paid' in banking) and the
// fully-unpaid fall-through ('sent' vs the invoice's current status) — are
// parameters, so each site reproduces its exact prior output.

describe('deriveInvoiceStatus', () => {
  it('returns paid when the amount due is cleared (regardless of amount paid)', () => {
    expect(deriveInvoiceStatus(120, 0)).toBe('paid');
    expect(deriveInvoiceStatus(120, -0.01)).toBe('paid');
  });

  it('returns the partial label when some (but not all) is paid', () => {
    expect(deriveInvoiceStatus(50, 50)).toBe('partial');
  });

  it('returns the unpaid label when nothing is paid', () => {
    expect(deriveInvoiceStatus(0, 100)).toBe('sent');
  });

  it('honors a custom partial label (banking uses "partially-paid")', () => {
    expect(deriveInvoiceStatus(50, 50, { partialLabel: 'partially-paid' })).toBe('partially-paid');
  });

  it('honors a custom unpaid label', () => {
    expect(deriveInvoiceStatus(0, 100, { unpaidLabel: 'draft' })).toBe('draft');
  });

  // bankingService.recordPayment-style: invoiceService.recordPayment
  it('reproduces recordPayment (partial / sent)', () => {
    expect(deriveInvoiceStatus(0, 100, { partialLabel: 'partial', unpaidLabel: 'sent' })).toBe('sent');
    expect(deriveInvoiceStatus(30, 70, { partialLabel: 'partial', unpaidLabel: 'sent' })).toBe('partial');
    expect(deriveInvoiceStatus(100, 0, { partialLabel: 'partial', unpaidLabel: 'sent' })).toBe('paid');
  });

  // bankingService.allocateReceiptToInvoice: the inline ternary was
  // `due <= 0 ? 'paid' : 'partially-paid'` — both non-paid branches collapse to
  // the same label, so partial and unpaid labels are identical.
  it('reproduces the banking allocate ternary (paid / partially-paid)', () => {
    expect(deriveInvoiceStatus(0, 50, { partialLabel: 'partially-paid', unpaidLabel: 'partially-paid' })).toBe('partially-paid');
    expect(deriveInvoiceStatus(50, 50, { partialLabel: 'partially-paid', unpaidLabel: 'partially-paid' })).toBe('partially-paid');
    expect(deriveInvoiceStatus(50, 0, { partialLabel: 'partially-paid', unpaidLabel: 'partially-paid' })).toBe('paid');
  });
});

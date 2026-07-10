import { describe, it, expect } from 'vitest';
import { deriveInvoiceStatus } from './invoiceStatus';

// Pins the single payment-status rule shared by all call sites. The vocabulary
// is canonical (owner decision 2026-07-10, FU-1): lowercase codes matching
// invoices_status_check — 'paid' / 'partial' / 'sent'. The banking-only
// 'partially-paid' label was never storable (the CHECK rejects it); the label
// parameters that preserved it are gone (WP-C).

describe('deriveInvoiceStatus', () => {
  it('returns paid when the amount due is cleared (regardless of amount paid)', () => {
    expect(deriveInvoiceStatus(120, 0)).toBe('paid');
    expect(deriveInvoiceStatus(120, -0.01)).toBe('paid');
  });

  it('returns partial when some (but not all) is paid', () => {
    expect(deriveInvoiceStatus(50, 50)).toBe('partial');
    expect(deriveInvoiceStatus(30, 70)).toBe('partial');
  });

  it('returns sent when nothing is paid', () => {
    expect(deriveInvoiceStatus(0, 100)).toBe('sent');
  });

  it('never emits a value outside invoices_status_check vocabulary', () => {
    const allowed = new Set(['draft', 'sent', 'paid', 'partial', 'overdue', 'cancelled', 'void', 'converted']);
    for (const [paid, due] of [[0, 100], [50, 50], [100, 0], [0, 0], [-5, 10]] as Array<[number, number]>) {
      expect(allowed.has(deriveInvoiceStatus(paid, due))).toBe(true);
    }
  });
});

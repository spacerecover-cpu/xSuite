import { describe, it, expect } from 'vitest';
import { calculateInvoiceTotals, type MoneyLineItem } from './financialMath';

// Byte-parity pin: locks the LEGACY calculateInvoiceTotals arithmetic for the
// representative OMR (3-dp) walkthrough shape BEFORE Task 32 deletes the function.
// The kernel side is asserted equal to these exact values in
// tax/kernel/computeDocumentTax.test.ts ("legacy invoice math parity":
// taxableBase 109.355, taxTotal 5.468, grandTotal 114.823), so this pin + that
// case together prove the invoiceService cutover is behaviour-preserving.
describe('invoiceService cutover parity (kernel vs legacy)', () => {
  it('legacy calculateInvoiceTotals pins the OMR representative shape', () => {
    const items: MoneyLineItem[] = [
      { quantity: 3, unit_price: 40.5, discount_percent: 10 },
      { quantity: 1, unit_price: 0.105 },
    ];
    const legacy = calculateInvoiceTotals(items, 0.1, 5, 0, 3);
    expect(legacy.taxAmount).toBe(5.468);
    expect(legacy.totalAmount).toBe(114.823);
  });
});

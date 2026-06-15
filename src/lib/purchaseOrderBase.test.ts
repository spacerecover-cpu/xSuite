import { describe, it, expect } from 'vitest';
import { buildPoBaseColumns } from './purchaseOrderBase';

describe('buildPoBaseColumns', () => {
  it('freezes subtotal/tax/discount/shipping/total into base at the rate, rounded to base decimals', () => {
    const rc = {
      documentCurrency: 'EUR', documentDecimals: 2,
      baseCurrency: 'OMR', baseDecimals: 3, rate: 0.42, rateSource: 'derived' as const,
    };
    const out = buildPoBaseColumns(
      { subtotal: 100, tax_amount: 15, discount_amount: 5, shipping_cost: 10, total_amount: 120 },
      rc,
    );
    expect(out).toEqual({
      currency: 'EUR', exchange_rate: 0.42, rate_source: 'derived',
      subtotal_base: 42, tax_amount_base: 6.3, discount_amount_base: 2.1,
      shipping_cost_base: 4.2, total_amount_base: 50.4,
    });
  });
  it('is identity at rate 1 (single-currency tenant) at base decimals', () => {
    const rc = {
      documentCurrency: 'OMR', documentDecimals: 3,
      baseCurrency: 'OMR', baseDecimals: 3, rate: 1, rateSource: 'derived' as const,
    };
    const out = buildPoBaseColumns(
      { subtotal: 100, tax_amount: 5, discount_amount: 0, shipping_cost: 0, total_amount: 105 },
      rc,
    );
    expect(out.total_amount_base).toBe(105);
    expect(out.exchange_rate).toBe(1);
  });
});

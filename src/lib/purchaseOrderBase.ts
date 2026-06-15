import { convertToBase } from './financialMath';
import type { RateContext } from './currencyService';

export interface PoTotals {
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  shipping_cost: number;
  total_amount: number;
}

/** Freeze a purchase order's money fields into the tenant base currency at the
 *  resolved rate (mirrors invoiceService's base-writer). Identity at rate 1, so a
 *  single-currency tenant is unchanged: base == native. */
export function buildPoBaseColumns(t: PoTotals, rc: RateContext) {
  return {
    currency: rc.documentCurrency,
    exchange_rate: rc.rate,
    rate_source: rc.rateSource,
    subtotal_base: convertToBase(t.subtotal, rc.rate, rc.baseDecimals),
    tax_amount_base: convertToBase(t.tax_amount, rc.rate, rc.baseDecimals),
    discount_amount_base: convertToBase(t.discount_amount, rc.rate, rc.baseDecimals),
    shipping_cost_base: convertToBase(t.shipping_cost, rc.rate, rc.baseDecimals),
    total_amount_base: convertToBase(t.total_amount, rc.rate, rc.baseDecimals),
  };
}

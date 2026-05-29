// Single source of truth for invoice/quote header money math.
//
// All amounts round to cents via roundMoney. The rules below are extracted
// verbatim from the canonical, fully-rounded create paths
// (invoiceService.createInvoice and quotesService.createQuote/updateQuote);
// they are shared so the create/update paths can no longer diverge.

/**
 * Round a monetary value to a currency's minor units. decimalPlaces defaults to 2
 * (cents) so every existing caller is unchanged; pass the currency's decimal_places
 * (0 for JPY/KRW, 3 for BHD/JOD/KWD/OMR) for currency-correct rounding.
 */
export const roundMoney = (value: number, decimalPlaces = 2): number => {
  const factor = 10 ** decimalPlaces;
  return Math.round(value * factor) / factor;
};

/**
 * Convert a transaction-currency amount to the base currency at a frozen rate,
 * rounded to the base currency's minor units. base_amount = round(amount * rate).
 */
export const convertToBase = (
  amount: number,
  rate: number,
  baseDecimalPlaces = 2,
): number => roundMoney(amount * rate, baseDecimalPlaces);

export interface MoneyLineItem {
  quantity: number;
  unit_price: number;
  discount_percent?: number;
}

export interface InvoiceTotals {
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  amountDue: number;
}

/**
 * Invoice header totals. Per-item subtotal less per-item percentage discount,
 * then invoice-level fixed discount, then invoice-level tax, then amount paid.
 * Mirrors invoiceService.createInvoice (the canonical rounded variant).
 */
export const calculateInvoiceTotals = (
  items: MoneyLineItem[],
  discountAmount: number,
  taxRate: number,
  amountPaid: number,
  decimalPlaces = 2,
): InvoiceTotals => {
  const subtotal = items.reduce((sum, item) => {
    const itemSubtotal = roundMoney(item.quantity * item.unit_price, decimalPlaces);
    const discount = roundMoney(itemSubtotal * ((item.discount_percent || 0) / 100), decimalPlaces);
    return roundMoney(sum + (itemSubtotal - discount), decimalPlaces);
  }, 0);

  const discountedSubtotal = roundMoney(subtotal - discountAmount, decimalPlaces);
  const taxAmount = roundMoney((discountedSubtotal * taxRate) / 100, decimalPlaces);
  const totalAmount = roundMoney(discountedSubtotal + taxAmount, decimalPlaces);
  const amountDue = roundMoney(totalAmount - amountPaid, decimalPlaces);

  return { subtotal, taxRate, taxAmount, totalAmount, amountDue };
};

export interface QuoteTotals {
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
}

/**
 * Quote header totals. Per-item line totals, then a fixed-or-percentage
 * discount, then quote-level tax. Mirrors quotesService.createQuote/updateQuote
 * (both already fully rounded and identical).
 */
export const calculateQuoteTotals = (
  items: MoneyLineItem[],
  discountType: string | null | undefined,
  discountAmount: number,
  taxRate: number,
  decimalPlaces = 2,
): QuoteTotals => {
  const subtotal = items.reduce((sum, item) => {
    const lineTotal = roundMoney(item.quantity * item.unit_price, decimalPlaces);
    return roundMoney(sum + lineTotal, decimalPlaces);
  }, 0);

  const discountValue =
    discountType === 'percentage'
      ? roundMoney((subtotal * discountAmount) / 100, decimalPlaces)
      : discountAmount;

  const discountedSubtotal = roundMoney(subtotal - discountValue, decimalPlaces);
  const taxAmount = roundMoney(discountedSubtotal * (taxRate / 100), decimalPlaces);
  const totalAmount = roundMoney(discountedSubtotal + taxAmount, decimalPlaces);

  return { subtotal, taxAmount, totalAmount };
};

// Single source of truth for invoice/quote header money math.
//
// All amounts round to cents via roundMoney. The rules below are extracted
// verbatim from the canonical, fully-rounded create paths
// (invoiceService.createInvoice and quotesService.createQuote/updateQuote);
// they are shared so the create/update paths can no longer diverge.

/** Round a monetary value to 2 decimal places (cents). */
export const roundMoney = (value: number): number => Math.round(value * 100) / 100;

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
): InvoiceTotals => {
  const subtotal = items.reduce((sum, item) => {
    const itemSubtotal = roundMoney(item.quantity * item.unit_price);
    const discount = roundMoney(itemSubtotal * ((item.discount_percent || 0) / 100));
    return roundMoney(sum + (itemSubtotal - discount));
  }, 0);

  const discountedSubtotal = roundMoney(subtotal - discountAmount);
  const taxAmount = roundMoney((discountedSubtotal * taxRate) / 100);
  const totalAmount = roundMoney(discountedSubtotal + taxAmount);
  const amountDue = roundMoney(totalAmount - amountPaid);

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
): QuoteTotals => {
  const subtotal = items.reduce((sum, item) => {
    const lineTotal = roundMoney(item.quantity * item.unit_price);
    return roundMoney(sum + lineTotal);
  }, 0);

  const discountValue =
    discountType === 'percentage'
      ? roundMoney((subtotal * discountAmount) / 100)
      : discountAmount;

  const discountedSubtotal = roundMoney(subtotal - discountValue);
  const taxAmount = roundMoney(discountedSubtotal * (taxRate / 100));
  const totalAmount = roundMoney(discountedSubtotal + taxAmount);

  return { subtotal, taxAmount, totalAmount };
};

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

export interface InvoiceBaseTotals {
  subtotalBase: number;
  taxAmountBase: number;
  totalAmountBase: number;
  amountPaidBase: number;
  balanceDueBase: number;
}

/**
 * Snapshot an invoice's document-currency totals into base currency at the frozen
 * rate. Each field is converted independently and rounded to the base currency's
 * minor units (the §3.3 invariant: *_base = round(* * rate, base.dp)); base fields
 * are never derived from one another, so cross-field rounding never accumulates.
 * At rate 1 this is the identity, so single-currency tenants store base == document.
 */
export const calculateInvoiceTotalsBase = (
  totals: {
    subtotal: number;
    taxAmount: number;
    totalAmount: number;
    amountPaid: number;
    amountDue: number;
  },
  rate: number,
  baseDecimalPlaces = 2,
): InvoiceBaseTotals => ({
  subtotalBase: convertToBase(totals.subtotal, rate, baseDecimalPlaces),
  taxAmountBase: convertToBase(totals.taxAmount, rate, baseDecimalPlaces),
  totalAmountBase: convertToBase(totals.totalAmount, rate, baseDecimalPlaces),
  amountPaidBase: convertToBase(totals.amountPaid, rate, baseDecimalPlaces),
  balanceDueBase: convertToBase(totals.amountDue, rate, baseDecimalPlaces),
});

export interface QuoteTotals {
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
}

export interface QuoteBaseTotals {
  subtotalBase: number;
  taxAmountBase: number;
  totalAmountBase: number;
}

/** Snapshot a quote's document-currency totals into base. Same invariant as invoices. */
export const calculateQuoteTotalsBase = (
  totals: { subtotal: number; taxAmount: number; totalAmount: number },
  rate: number,
  baseDecimalPlaces = 2,
): QuoteBaseTotals => ({
  subtotalBase: convertToBase(totals.subtotal, rate, baseDecimalPlaces),
  taxAmountBase: convertToBase(totals.taxAmount, rate, baseDecimalPlaces),
  totalAmountBase: convertToBase(totals.totalAmount, rate, baseDecimalPlaces),
});

/**
 * Realized FX gain/loss when a document amount booked at `invoiceRate` is settled
 * at `paymentRate` (both documentCurrency -> base). TS mirror of the canonical SQL
 * compute_realized_fx(): realized = round(docAmount * (paymentRate - invoiceRate),
 * base.dp). Positive => gain, negative => loss, exactly 0 when the rate did not move
 * (the single-currency / same-day case — so no FX row is ever posted there). Uses the
 * house roundMoney (round-half-toward-+infinity); it can differ from Postgres round()
 * only on an exact negative half-minor-unit, which is immaterial for rate * amount.
 */
export const computeRealizedFx = (
  docAmount: number,
  paymentRate: number,
  invoiceRate: number,
  baseDecimalPlaces = 2,
): number => roundMoney(docAmount * (paymentRate - invoiceRate), baseDecimalPlaces);

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

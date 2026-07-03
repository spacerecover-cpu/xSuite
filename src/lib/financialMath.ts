// Single source of truth for invoice/quote header money math.
//
// All amounts round to cents via roundMoney. The rules below are extracted
// verbatim from the canonical, fully-rounded create paths
// (invoiceService.createInvoice and quotesService.createQuote/updateQuote);
// they are shared so the create/update paths can no longer diverge.

import type { RoundingPolicy } from './regimes/types';

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

/**
 * THE ONLY sanctioned way to split a document-level amount across lines or
 * components (graft 9). Guarantees Σ(result) === total exactly at the target
 * precision; parts are proportional to weights with the residual minor units
 * assigned by largest fractional remainder (ties broken by stable input order,
 * so the result is deterministic). Negative totals allocate |total| and negate.
 * Ad-hoc proportional splits are banned by eslint xsuite/no-adhoc-money-allocation.
 */
export const allocateLargestRemainder = (
  total: number,
  weights: number[],
  decimalPlaces: number,
): number[] => {
  if (weights.length === 0) return [];
  if (total < 0) {
    return allocateLargestRemainder(-total, weights, decimalPlaces).map((v) => (v === 0 ? 0 : -v));
  }
  const factor = 10 ** decimalPlaces;
  const totalUnits = Math.round(total * factor);
  const weightSum = weights.reduce((s, w) => s + w, 0);

  let exactUnits: number[];
  if (weightSum === 0) {
    // Degenerate weights: spread equally (stable order gets the residual first).
    exactUnits = weights.map(() => totalUnits / weights.length);
  } else {
    exactUnits = weights.map((w) => (totalUnits * w) / weightSum);
  }
  const floored = exactUnits.map((u) => Math.floor(u + 1e-9));
  let residual = totalUnits - floored.reduce((s, u) => s + u, 0);
  const order = exactUnits
    .map((u, i) => ({ i, frac: u - Math.floor(u + 1e-9) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const result = [...floored];
  for (const { i } of order) {
    if (residual <= 0) break;
    result[i] += 1;
    residual -= 1;
  }
  return result.map((u) => u / factor);
};

/**
 * Policy-aware money rounding (graft 4). 'half_up' is defined as the HOUSE
 * roundMoney behavior (Math.round: half toward +infinity) — NOT textbook
 * half-away-from-zero — because the Oman byte-parity gate pins the kernel to the
 * legacy calculateInvoiceTotals output on 2,131 live documents. 'half_even'
 * (banker's) rounds exact halves to the even minor unit. `policy.level` and
 * `policy.cash_increment` are consumed by the kernel, not here.
 */
export const roundMoneyWith = (
  value: number,
  decimalPlaces: number,
  policy: RoundingPolicy,
): number => {
  if (policy.mode === 'half_up') return roundMoney(value, decimalPlaces);
  const factor = 10 ** decimalPlaces;
  const scaled = value * factor;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  const EPS = 1e-9;
  let units: number;
  if (Math.abs(diff - 0.5) < EPS) {
    units = floor % 2 === 0 ? floor : floor + 1;
  } else {
    units = Math.round(scaled);
  }
  return units / factor;
};

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

/**
 * Read a row's base-currency value for a money field, for cross-document
 * aggregation (reports / dashboards). Prefers the `<field>_base` column when it is
 * a number — COALESCE semantics, so a stored 0 is honoured as a real value — and
 * falls back to the raw `<field>` only for transition rows that predate the base
 * snapshot, else 0. Summing the RAW transaction amount across documents is wrong
 * the moment a tenant uses more than one currency (it adds OMR to EUR under one
 * symbol); cross-document totals must always go through this helper.
 */
export const baseAmount = (
  row: Record<string, unknown>,
  field: string,
): number => {
  const base = row[`${field}_base`];
  if (typeof base === 'number') return base;
  const raw = row[field];
  return typeof raw === 'number' ? raw : 0;
};

// Canonical receivable filter — a converted proforma and the tax_invoice it became are
// the SAME bill; void/cancelled are not owed. Shared by the case-detail Financial Summary
// and the Revenue-by-Case report so the two surfaces cannot diverge (EXP-014).
export const RECEIVABLE_INVOICE_EXCLUDED_STATUSES = ['void', 'cancelled'] as const;

export const isReceivableInvoice = (inv: {
  invoice_type?: string | null;
  status?: string | null;
}): boolean =>
  inv.invoice_type === 'tax_invoice' &&
  !(RECEIVABLE_INVOICE_EXCLUDED_STATUSES as readonly string[]).includes(inv.status ?? '');

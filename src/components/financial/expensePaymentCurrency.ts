/**
 * Expense-payment currency matching (EXP-017, match-currency v1). A NULL currency
 * — on the expense or on a bank account — means "the tenant base currency", never
 * a fabricated 'USD' (which broke the deposit-account list for non-USD tenants).
 */

/** The currency an expense is paid in: its own if set, else the tenant base. */
export const resolveExpensePaymentCurrency = (
  expenseCurrency: string | null | undefined,
  baseCurrency: string,
): string => expenseCurrency || baseCurrency;

/** Accounts that can pay an expense 1:1 — same currency, with a null account
 *  currency treated as the tenant base. */
export const filterExpensePaymentAccounts = <T extends { currency?: string | null }>(
  accounts: T[],
  paymentCurrency: string,
  baseCurrency: string,
): T[] => accounts.filter((a) => (a.currency || baseCurrency) === paymentCurrency);

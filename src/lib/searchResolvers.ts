import { supabase } from './supabaseClient';

/**
 * Cross-entity search support for list pages.
 *
 * PostgREST cannot OR a foreign-table column into a parent `.or()` filter, so searching an
 * invoice by its CUSTOMER's name (or a payment by its CASE number) requires two steps:
 * resolve the term against the related table first, then fold the matched ids into the
 * parent filter as `<fk>.in.(...)` clauses. These resolvers are shared by the Cases,
 * Invoices, Quotes, Payments and Expenses lists.
 */

/** Cap the id fan-in so a 1-letter term cannot expand into a huge in.() list. */
export const SEARCH_MATCH_LIMIT = 200;

/** Pure: compose local ilike parts + resolved-id clauses into one `.or()` string. */
export function composeSearchOr(
  localParts: string[],
  idClauses: Array<{ column: string; ids: string[] }>,
): string {
  const parts = [...localParts];
  for (const { column, ids } of idClauses) {
    if (ids.length > 0) parts.push(`${column}.in.(${ids.join(',')})`);
  }
  return parts.join(',');
}

/** Customers matching the term by name, email, mobile or customer number. */
export async function resolveCustomerIds(s: string): Promise<string[]> {
  const { data } = await supabase
    .from('customers_enhanced')
    .select('id')
    .or(`customer_name.ilike.%${s}%,email.ilike.%${s}%,mobile_number.ilike.%${s}%,customer_number.ilike.%${s}%`)
    .is('deleted_at', null)
    .limit(SEARCH_MATCH_LIMIT);
  return (data ?? []).map((r) => r.id);
}

/** Cases matching the term by case number or client reference. */
export async function resolveCaseIds(s: string): Promise<string[]> {
  const { data } = await supabase
    .from('cases')
    .select('id')
    .or(`case_number.ilike.%${s}%,client_reference.ilike.%${s}%`)
    .is('deleted_at', null)
    .limit(SEARCH_MATCH_LIMIT);
  return (data ?? []).map((r) => r.id);
}

/** Invoices matching the term by invoice number (for payment search). */
export async function resolveInvoiceIds(s: string): Promise<string[]> {
  const { data } = await supabase
    .from('invoices')
    .select('id')
    .ilike('invoice_number', `%${s}%`)
    .is('deleted_at', null)
    .limit(SEARCH_MATCH_LIMIT);
  return (data ?? []).map((r) => r.id);
}

/** Invoice search: number/notes/client-ref + customer + case. */
export async function buildInvoiceSearchOr(s: string): Promise<string> {
  const [customerIds, caseIds] = await Promise.all([resolveCustomerIds(s), resolveCaseIds(s)]);
  return composeSearchOr(
    [`invoice_number.ilike.%${s}%`, `notes.ilike.%${s}%`, `client_reference.ilike.%${s}%`],
    [{ column: 'customer_id', ids: customerIds }, { column: 'case_id', ids: caseIds }],
  );
}

/** Quote search: number/title/client-ref + customer + case. */
export async function buildQuoteSearchOr(s: string): Promise<string> {
  const [customerIds, caseIds] = await Promise.all([resolveCustomerIds(s), resolveCaseIds(s)]);
  return composeSearchOr(
    [`quote_number.ilike.%${s}%`, `title.ilike.%${s}%`, `client_reference.ilike.%${s}%`],
    [{ column: 'customer_id', ids: customerIds }, { column: 'case_id', ids: caseIds }],
  );
}

/** Payment search: number/reference + customer + case + invoice number. */
export async function buildPaymentSearchOr(s: string): Promise<string> {
  const [customerIds, caseIds, invoiceIds] = await Promise.all([
    resolveCustomerIds(s), resolveCaseIds(s), resolveInvoiceIds(s),
  ]);
  return composeSearchOr(
    [`payment_number.ilike.%${s}%`, `reference.ilike.%${s}%`],
    [
      { column: 'customer_id', ids: customerIds },
      { column: 'case_id', ids: caseIds },
      { column: 'invoice_id', ids: invoiceIds },
    ],
  );
}

/** Expense search: number/description/vendor/reference + case. */
export async function buildExpenseSearchOr(s: string): Promise<string> {
  const caseIds = await resolveCaseIds(s);
  return composeSearchOr(
    [`expense_number.ilike.%${s}%`, `description.ilike.%${s}%`, `vendor.ilike.%${s}%`, `reference.ilike.%${s}%`],
    [{ column: 'case_id', ids: caseIds }],
  );
}

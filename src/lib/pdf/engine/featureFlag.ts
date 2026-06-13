/**
 * featureFlag — gate for routing a document type through the new config-driven
 * PDF engine (`renderTemplate`) instead of the hand-written builders.
 *
 * DEFAULT-OFF by design: with the flag unset, every document type keeps using
 * its legacy builder and the rendered output is byte-identical to production.
 * Only the literal string `'true'` on the matching env var opts a document type
 * into the engine — any other value (unset, `'false'`, `'1'`, …) stays OFF.
 *
 * `'invoice'` (the M3 pilot), `'quote'`, `'payment_receipt'`, the three case
 * documents `'office_receipt'`, `'customer_copy'`, and `'checkout_form'`, the
 * `'case_label'` and `'chain_of_custody'` documents, the `'payslip'` +
 * `'stock_label'` documents, and the `'report'` (case report) document each have
 * a wired engine branch, driven by
 * `VITE_PDF_ENGINE_INVOICE`, `VITE_PDF_ENGINE_QUOTE`,
 * `VITE_PDF_ENGINE_PAYMENT_RECEIPT`, `VITE_PDF_ENGINE_OFFICE_RECEIPT`,
 * `VITE_PDF_ENGINE_CUSTOMER_COPY`, `VITE_PDF_ENGINE_CHECKOUT_FORM`,
 * `VITE_PDF_ENGINE_CASE_LABEL`, `VITE_PDF_ENGINE_CHAIN_OF_CUSTODY`,
 * `VITE_PDF_ENGINE_PAYSLIP`, `VITE_PDF_ENGINE_STOCK_LABEL`, and
 * `VITE_PDF_ENGINE_REPORT` respectively. Other document types always return
 * `false` here.
 *
 * NOTE: this is a build-time, ALL-tenants switch. Per-tenant rollout (reading a
 * tenant flag / a deployed-template opt-in) is a later milestone — deliberately
 * out of scope for the pilot so the blast radius stays a single env var.
 */

/** Env var name per supported document type. Absent types are never enabled. */
const FLAG_ENV_BY_TYPE: Record<string, string> = {
  invoice: 'VITE_PDF_ENGINE_INVOICE',
  quote: 'VITE_PDF_ENGINE_QUOTE',
  payment_receipt: 'VITE_PDF_ENGINE_PAYMENT_RECEIPT',
  office_receipt: 'VITE_PDF_ENGINE_OFFICE_RECEIPT',
  customer_copy: 'VITE_PDF_ENGINE_CUSTOMER_COPY',
  checkout_form: 'VITE_PDF_ENGINE_CHECKOUT_FORM',
  case_label: 'VITE_PDF_ENGINE_CASE_LABEL',
  chain_of_custody: 'VITE_PDF_ENGINE_CHAIN_OF_CUSTODY',
  payslip: 'VITE_PDF_ENGINE_PAYSLIP',
  stock_label: 'VITE_PDF_ENGINE_STOCK_LABEL',
  report: 'VITE_PDF_ENGINE_REPORT',
};

/**
 * Whether the new PDF engine is enabled for `documentType`.
 *
 * Returns `true` only when the document type has a registered env flag AND that
 * env var is exactly the string `'true'`. Defaults to `false` for everything
 * else, so the legacy path is the safe, unchanged default.
 */
export function isPdfEngineEnabled(documentType: string): boolean {
  const envKey = FLAG_ENV_BY_TYPE[documentType];
  if (!envKey) return false;
  const raw = (import.meta.env as Record<string, unknown>)[envKey];
  return raw === 'true';
}

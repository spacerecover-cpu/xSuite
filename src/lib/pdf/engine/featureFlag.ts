/**
 * featureFlag — gate for routing a document type through the new config-driven
 * PDF engine (`renderTemplate`) instead of the hand-written builders.
 *
 * DEFAULT-OFF by design: with the flag unset, every document type keeps using
 * its legacy builder and the rendered output is byte-identical to production.
 * Only the literal string `'true'` on the matching env var opts a document type
 * into the engine — any other value (unset, `'false'`, `'1'`, …) stays OFF.
 *
 * `'invoice'` (the M3 pilot), `'quote'`, and `'payment_receipt'` each have a
 * wired engine branch, driven by `VITE_PDF_ENGINE_INVOICE`,
 * `VITE_PDF_ENGINE_QUOTE`, and `VITE_PDF_ENGINE_PAYMENT_RECEIPT` respectively.
 * Other document types always return `false` here.
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

export interface SupplierAddressParts {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  country?: string | null;
}

/** Fold the five captured address inputs into the single `suppliers.address` text
 *  column so city/state/zip/country are no longer silently dropped (D12).
 *  `suppliers` has no free-text city column (only the `city_id` FK), so the typed
 *  city belongs in the composed text until the structured-address migration. */
export function composeSupplierAddress(parts: SupplierAddressParts): string | null {
  const ordered = [parts.address, parts.city, parts.state, parts.zip_code, parts.country]
    .map((p) => (p ?? '').trim())
    .filter((p) => p.length > 0);
  return ordered.length > 0 ? ordered.join(', ') : null;
}

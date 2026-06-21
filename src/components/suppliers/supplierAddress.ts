export interface SupplierAddressParts {
  address?: string | null;
  state?: string | null;
  zip_code?: string | null;
  country?: string | null;
}

/** Fold the four captured address inputs into the single `suppliers.address` text
 *  column so state/zip/country are no longer silently dropped (D12). */
export function composeSupplierAddress(parts: SupplierAddressParts): string | null {
  const ordered = [parts.address, parts.state, parts.zip_code, parts.country]
    .map((p) => (p ?? '').trim())
    .filter((p) => p.length > 0);
  return ordered.length > 0 ? ordered.join(', ') : null;
}

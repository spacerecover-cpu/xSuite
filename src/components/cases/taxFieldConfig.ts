/** D10 — resolve the tax-rate field default from the tenant's country config,
 *  never the hardcoded Gulf-VAT 5. An explicit initial value (editing an existing
 *  doc) always wins; otherwise fall through to the config default. 0% is valid. */
export function resolveDefaultRate(initial: number | undefined, configDefault: number): number {
  return initial ?? configDefault;
}

/** D9 — render the tax line label from the country's tax label (VAT/GST/Sales Tax),
 *  never the hardcoded "VAT". */
export function resolveTaxLabel(label: string, rate: number): string {
  return `${label} (${rate}%)`;
}

import { baseAmount } from '../../lib/financialMath';

/** D7 — sum the base-currency shadow column so multi-currency analytics are
 *  arithmetically correct. Delegates to financialMath.baseAmount (raw fallback for
 *  legacy unity rows). */
export function sumBase<T extends Record<string, unknown>>(rows: T[], field: string): number {
  return (rows || []).reduce((acc, r) => acc + baseAmount(r as never, field as never), 0);
}

/** D7 — group-and-sum the base-currency shadow per key. Same base-fallback as sumBase. */
export function groupSumBase<T extends Record<string, unknown>>(
  rows: T[],
  field: string,
  keyOf: (row: T) => string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows || []) {
    const k = keyOf(r);
    out[k] = (out[k] ?? 0) + baseAmount(r as never, field as never);
  }
  return out;
}

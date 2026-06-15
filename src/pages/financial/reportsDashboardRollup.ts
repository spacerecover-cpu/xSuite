import { baseAmount } from '../../lib/financialMath';

/** D7 — sum the base-currency shadow column so multi-currency analytics are
 *  arithmetically correct. Delegates to financialMath.baseAmount (raw fallback for
 *  legacy unity rows). */
export function sumBase<T extends Record<string, unknown>>(rows: T[], field: string): number {
  return (rows || []).reduce((acc, r) => acc + baseAmount(r as never, field as never), 0);
}

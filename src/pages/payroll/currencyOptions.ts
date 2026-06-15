export interface CurrencyRow { code: string; symbol: string; decimal_places: number }
export interface CurrencyOption { value: string; label: string; symbol: string; decimals: number }
/** D17 — build the payroll currency dropdown from master_currency_codes/tenant_currencies
 *  rows instead of an inline hardcoded USD/EUR/... map that drifts from the data. */
export function buildCurrencyOptions(rows: CurrencyRow[]): CurrencyOption[] {
  return (rows || []).map((r) => ({
    value: r.code, label: `${r.code} (${r.symbol})`, symbol: r.symbol, decimals: r.decimal_places,
  }));
}

import { supabase } from './supabaseClient';

// Currency utilities for the multi-currency model:
//  - per-currency minor units (decimal_places), cached from master_currency_codes
//  - the tenant's supported transaction currencies (RLS-scoped to the caller's tenant)
//  - cross-rate lookup from the USD-pivot exchange_rates table, with weekend/holiday
//    carry-forward (most-recent rate on/before the document date)
// The frozen rate a document stores is rate(documentCurrency -> tenantBaseCurrency),
// captured at the document's date; base amounts are then convertToBase(amount, rate, baseDp).

let decimalsCache: Map<string, number> | null = null;

/** decimal_places for a currency (0 JPY/KRW, 3 BHD/JOD/KWD/OMR, else 2). Cached. */
export async function getCurrencyDecimals(code: string): Promise<number> {
  if (!decimalsCache) {
    const { data, error } = await supabase
      .from('master_currency_codes')
      .select('code, decimal_places')
      .eq('is_active', true);
    if (error) throw error;
    decimalsCache = new Map((data ?? []).map((c) => [c.code, c.decimal_places ?? 2]));
  }
  return decimalsCache.get(code) ?? 2;
}

export interface SupportedCurrency {
  code: string;
  isBase: boolean;
  displayOrder: number;
}

/** The tenant's active supported currencies (base first). RLS scopes to the tenant. */
export async function getSupportedCurrencies(): Promise<SupportedCurrency[]> {
  const { data, error } = await supabase
    .from('tenant_currencies')
    .select('currency_code, is_base, display_order')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('is_base', { ascending: false })
    .order('display_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    code: r.currency_code,
    isBase: r.is_base,
    displayOrder: r.display_order,
  }));
}

/** USD-per-1-of-`code` from the pivot table; most recent on/before `date`. USD => 1. */
async function usdRate(code: string, date: string): Promise<number> {
  if (code === 'USD') return 1;
  const { data, error } = await supabase
    .from('exchange_rates')
    .select('rate')
    .eq('base_currency', 'USD')
    .eq('quote_currency', code)
    .eq('source', 'provider')
    .lte('rate_date', date)
    .order('rate_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`No exchange rate for USD->${code} on/before ${date}`);
  return Number(data.rate);
}

/**
 * Conversion rate: units of `toCurrency` per 1 unit of `fromCurrency`, derived from the
 * USD pivot as usdRate(to) / usdRate(from). Defaults to today; pass the document date for
 * a historically-correct frozen rate. Returns 1 when the currencies match.
 */
export async function getConversionRate(
  fromCurrency: string,
  toCurrency: string,
  onDate?: string,
): Promise<number> {
  if (fromCurrency === toCurrency) return 1;
  const date = onDate ?? new Date().toISOString().slice(0, 10);
  const [toUsd, fromUsd] = await Promise.all([usdRate(toCurrency, date), usdRate(fromCurrency, date)]);
  return toUsd / fromUsd;
}

/** Reset the decimals cache (e.g. after a currency-reference change). */
export function clearCurrencyCache(): void {
  decimalsCache = null;
}

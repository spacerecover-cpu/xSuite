// The tenant-timezone "current date" primitive (localization Phase 0, canonical
// contract src/lib/tenantToday.ts). Replaces `new Date().toISOString().split('T')[0]`
// on every DOCUMENT-DATE write path: that pattern stamps the UTC calendar day, which
// for any UTC+ tenant (e.g. Muscat, UTC+4) is YESTERDAY between local 00:00 and the
// offset — wrong tax point and wrong VAT period at month/quarter boundaries.
import { supabase } from './supabaseClient';

/** 'YYYY-MM-DD' for "now" in the given IANA timezone. Throws on an invalid zone. */
export function tenantToday(timezone: string): string {
  // en-CA formats as YYYY-MM-DD; Intl throws RangeError on a bad zone (fail-loud).
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/** 'YYYY-MM' for "now" in the given IANA timezone (vat_records.tax_period shape). */
export function tenantTodayMonth(timezone: string): string {
  return tenantToday(timezone).slice(0, 7);
}

/** Pure calendar-day arithmetic on 'YYYY-MM-DD' strings — no timezone involved. */
export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Pure calendar-month arithmetic on 'YYYY-MM-DD' strings. Clamps to the last day of
 * the target month when the source day doesn't exist there (e.g. Jan 31 + 1 month =
 * Feb 28, not a naive-Date.UTC overflow into March) — required for VAT/billing period
 * boundaries anchored on month-end dates.
 */
export function addMonthsIso(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const targetMonthIndex = m - 1 + months;
  const lastDayOfTargetMonth = new Date(Date.UTC(y, targetMonthIndex + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDayOfTargetMonth);
  return new Date(Date.UTC(y, targetMonthIndex, day)).toISOString().slice(0, 10);
}

let timezoneCache: string | null = null;

/** The tenant's IANA timezone (RLS scopes the tenants read to the caller). Cached. */
export async function getTenantTimezone(): Promise<string> {
  if (timezoneCache) return timezoneCache;
  const { data, error } = await supabase.from('tenants').select('timezone').limit(1).maybeSingle();
  if (error) throw error;
  if (!data?.timezone) throw new Error('Tenant has no timezone configured');
  timezoneCache = data.timezone;
  return data.timezone;
}

/** Convenience for service-layer (non-React) document-date stamping. */
export async function currentTenantToday(): Promise<string> {
  return tenantToday(await getTenantTimezone());
}

export function clearTenantTodayCache(): void {
  timezoneCache = null;
}

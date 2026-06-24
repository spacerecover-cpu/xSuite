// Period windows + trend math for the Cases command-center KPIs.
//
// Kept pure (no Date.now() inside — `now` is injected) so the window/trend
// logic is unit-testable and deterministic. The data hook
// (useCaseCommandStats) supplies `new Date()` at call time.

export type CasePeriod = 'month' | '30d' | '90d' | 'year';

export interface CasePeriodOption {
  value: CasePeriod;
  /** Toggle label, e.g. "This Month". */
  label: string;
  /** Short label for trend captions, e.g. "vs last month". */
  vsLabel: string;
}

export const CASE_PERIOD_OPTIONS: readonly CasePeriodOption[] = [
  { value: 'month', label: 'This Month', vsLabel: 'vs last month' },
  { value: '30d', label: '30 Days', vsLabel: 'vs prev 30d' },
  { value: '90d', label: '90 Days', vsLabel: 'vs prev 90d' },
  { value: 'year', label: 'This Year', vsLabel: 'vs last year' },
] as const;

export interface PeriodWindows {
  /** Inclusive lower bound of the current window (ISO). */
  curStart: string;
  /** Inclusive lower bound of the previous window (ISO). */
  prevStart: string;
  /** Exclusive upper bound of the previous window (ISO) — equals curStart. */
  prevEnd: string;
}

/**
 * Compute the current and previous comparison windows for a period.
 *
 * - `month` / `year`: calendar-anchored. Current window runs from the start of
 *   the month/year to `now` (period-to-date); previous window is the full prior
 *   month/year. (Same to-date-vs-full-prior convention dashboards conventionally
 *   use — the trend caption says "vs last month".)
 * - `30d` / `90d`: rolling. Current = [now-N, now]; previous = [now-2N, now-N]
 *   (equal-length windows, a clean apples-to-apples comparison).
 *
 * All bounds are UTC, matching the app's existing UTC date handling.
 */
export function getPeriodWindows(period: CasePeriod, now: Date): PeriodWindows {
  const iso = (d: Date) => d.toISOString();

  if (period === 'month' || period === 'year') {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const curStart = period === 'month'
      ? new Date(Date.UTC(y, m, 1))
      : new Date(Date.UTC(y, 0, 1));
    const prevStart = period === 'month'
      ? new Date(Date.UTC(y, m - 1, 1))
      : new Date(Date.UTC(y - 1, 0, 1));
    return { curStart: iso(curStart), prevStart: iso(prevStart), prevEnd: iso(curStart) };
  }

  const days = period === '30d' ? 30 : 90;
  const ms = days * 24 * 60 * 60 * 1000;
  const curStart = new Date(now.getTime() - ms);
  const prevStart = new Date(now.getTime() - 2 * ms);
  return { curStart: iso(curStart), prevStart: iso(prevStart), prevEnd: iso(curStart) };
}

export type TrendDirection = 'up' | 'down' | 'flat';

export interface Trend {
  /** Absolute percentage change, or null when undefined (previous = 0). */
  pct: number | null;
  direction: TrendDirection;
}

/**
 * Percentage change of `cur` vs `prev`.
 *
 * - prev > 0: signed percentage → abs pct + direction.
 * - prev === 0 && cur > 0: change is undefined (÷0) → pct null, direction up
 *   (the UI renders this as "new" rather than a misleading number).
 * - prev === 0 && cur === 0: flat.
 */
export function computeTrend(cur: number, prev: number): Trend {
  if (prev === 0) {
    return cur > 0 ? { pct: null, direction: 'up' } : { pct: 0, direction: 'flat' };
  }
  const change = Math.round(((cur - prev) / prev) * 100);
  if (change === 0) return { pct: 0, direction: 'flat' };
  return { pct: Math.abs(change), direction: change > 0 ? 'up' : 'down' };
}

import { parseISO, addDays } from 'date-fns';

/**
 * Count working days in [start, end] inclusive, excluding the tenant's weekend
 * days. `weekendDays` is a set of JS weekday indices (0=Sun … 6=Sat); it defaults
 * to Sat/Sun but a Gulf tenant passes [5, 6] (Fri/Sat). Dates are 'YYYY-MM-DD';
 * parseISO anchors to local midnight so getDay() is the calendar weekday in any tz.
 */
export const countBusinessDays = (
  start: string,
  end: string,
  weekendDays: number[] = [6, 0],
): number => {
  if (!start || !end) return 0;
  const s = parseISO(start);
  const e = parseISO(end);
  if (e < s) return 0;
  const weekend = new Set(weekendDays);
  let count = 0;
  let cur = s;
  while (cur <= e) {
    if (!weekend.has(cur.getDay())) count++;
    cur = addDays(cur, 1);
  }
  return count;
};

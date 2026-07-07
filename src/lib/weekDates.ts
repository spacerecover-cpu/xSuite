import { startOfWeek, format } from 'date-fns';

/**
 * The 'YYYY-MM-DD' date of the start of the week containing `today`, honoring the
 * tenant's first-day-of-week (0=Sun … 6=Sat; date-fns `weekStartsOn`). Local-date
 * based (date-fns `format`, not toISOString) so it never drifts a day across
 * timezones.
 */
export const startOfWeekIso = (
  today: Date,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6,
): string => format(startOfWeek(today, { weekStartsOn }), 'yyyy-MM-dd');

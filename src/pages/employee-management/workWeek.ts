type Dow = 0 | 1 | 2 | 3 | 4 | 5 | 6;
/** D15 — resolve the week-start day from tenant config instead of hardcoding Monday.
 *  date-fns weekStartsOn uses 0=Sunday..6=Saturday, matching geo_countries.week_starts_on. */
export function resolveWeekStartsOn(configValue: Dow | undefined): Dow {
  return configValue ?? 0;
}

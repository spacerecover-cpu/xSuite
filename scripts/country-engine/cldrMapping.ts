// Pure CLDR → geo_countries fact mapping. Network stays in the GENERATE path of
// the test; this module is deterministic and unit-tested offline.
export interface TerritoryFacts {
  code: string;           // ISO-3166 alpha-2 (geo_countries.code)
  currencyCode: string | null;
  weekendDays: number[];  // registry dow, 0=Sun..6=Sat (matches datetime.weekend_days)
  weekStartsOn: number;   // registry dow, 0=Sun..6=Sat (matches datetime.week_starts_on)
}

// Country Engine convention (registry.ts:163-186): 0=Sun..6=Sat — NOT ISO 1..7.
// Sunday MUST be 0, not 7, or datetime.weekend_days/.week_starts_on fail the
// registry's z.number().int().min(0).max(6) schema on every Sunday-inclusive nation.
const DAY_TO_DOW: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
export function cldrDayToDow(day: string): number {
  const dow = DAY_TO_DOW[day];
  if (dow === undefined) throw new Error(`cldrDayToDow: unknown CLDR day '${day}'`);  // NOT `!dow` — 0 (Sunday) is valid
  return dow;
}

type CurrencyData = { supplemental: { currencyData: { region: Record<string, Array<Record<string, { _from?: string; _to?: string }>>> } } };
type WeekData = { supplemental: { weekData: { firstDay: Record<string, string>; weekendStart: Record<string, string>; weekendEnd: Record<string, string> } } };

function activeCurrency(entries: Array<Record<string, { _from?: string; _to?: string }>>): string | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    for (const [code, span] of Object.entries(entries[i])) {
      if (!span._to) return code;   // open-ended = the territory's current tender
    }
  }
  return null;
}

export function mapTerritoryFacts(currencyData: unknown, weekData: unknown): Map<string, TerritoryFacts> {
  const cur = (currencyData as CurrencyData).supplemental.currencyData.region;
  const week = (weekData as WeekData).supplemental.weekData;
  const worldFirst = week.firstDay['001'] ?? 'mon';
  const worldWs = week.weekendStart['001'] ?? 'sat';
  const worldWe = week.weekendEnd['001'] ?? 'sun';
  const out = new Map<string, TerritoryFacts>();
  for (const [territory, entries] of Object.entries(cur)) {
    if (!/^[A-Z]{2}$/.test(territory)) continue;   // skip numeric/world territories
    const ws = cldrDayToDow(week.weekendStart[territory] ?? worldWs);
    const we = cldrDayToDow(week.weekendEnd[territory] ?? worldWe);
    const weekend: number[] = [];
    // Walk forward in the 0..6 ring (…Fri=5, Sat=6, Sun=0…) so AE Sat→Sun = [6,0].
    for (let d = ws; ; d = (d + 1) % 7) { weekend.push(d); if (d === we) break; if (weekend.length > 7) break; }
    out.set(territory, {
      code: territory,
      currencyCode: activeCurrency(entries),
      weekendDays: weekend,
      weekStartsOn: cldrDayToDow(week.firstDay[territory] ?? worldFirst),
    });
  }
  return out;
}

export function territoryFactsToSql(facts: TerritoryFacts[]): string {
  return facts.map((f) => {
    const weekendJson = JSON.stringify(f.weekendDays);
    const currencyExpr = f.currencyCode ? `COALESCE(currency_code, '${f.currencyCode}')` : 'currency_code';
    return [
      `UPDATE geo_countries SET`,
      `  currency_code = ${currencyExpr},`,
      `  country_config = country_config`,
      `    || (CASE WHEN country_config ? 'datetime.weekend_days' THEN '{}'::jsonb`,
      `             ELSE jsonb_build_object('datetime.weekend_days', '${weekendJson}'::jsonb) END)`,
      `    || (CASE WHEN country_config ? 'datetime.week_starts_on' THEN '{}'::jsonb`,
      `             ELSE jsonb_build_object('datetime.week_starts_on', ${f.weekStartsOn}) END)`,
      `WHERE code = '${f.code}' AND deleted_at IS NULL;`,
    ].join('\n');
  }).join('\n\n') + '\n';
}

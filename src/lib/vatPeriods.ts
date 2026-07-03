// Calendar-quarter period bounds as PURE STRING math (localization Phase 0).
// Never construct a local-midnight Date and serialize via toISOString(): for any
// UTC+ tenant that shifts the boundary a day, and calculateVATForPeriod's
// month-slice bucketing amplifies the shifted day into a DOUBLE-DECLARED MONTH
// across consecutive quarterly returns. Country/tenant filing frequencies and
// fiscal anchors arrive with the Phase-3 ReturnComposer; these calendar quarters
// are the Phase-0 (GCC-correct) default.
export interface PeriodBounds { periodStart: string; periodEnd: string; }

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Last day-of-month via UTC construction only (no local-zone Date in play). */
const daysInMonth = (year: number, month1to12: number): number =>
  new Date(Date.UTC(year, month1to12, 0)).getUTCDate();

export function calendarQuarterBounds(year: number, quarter: 1 | 2 | 3 | 4): PeriodBounds {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  return {
    periodStart: `${year}-${pad2(startMonth)}-01`,
    periodEnd: `${year}-${pad2(endMonth)}-${pad2(daysInMonth(year, endMonth))}`,
  };
}

export function quarterOf(isoDate: string): { year: number; quarter: 1 | 2 | 3 | 4 } {
  const [y, m] = isoDate.split('-').map(Number);
  return { year: y, quarter: (Math.floor((m - 1) / 3) + 1) as 1 | 2 | 3 | 4 };
}

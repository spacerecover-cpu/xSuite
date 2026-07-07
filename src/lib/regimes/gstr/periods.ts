// GSTR period math. PURE STRING ARITHMETIC on 'YYYY-MM-DD' — never
// new Date().toISOString() (the Phase-0 VATReturnModal UTC-boundary bug class).
// The timezone argument documents intent (forDate must already be tenant-local
// via tenantToday); it is not used for conversion here — same convention as
// gcc_return/index.ts:35.
import { CountryConfigError } from '../../country/resolveCountryConfig';

const pad2 = (n: number): string => String(n).padStart(2, '0');

const daysInMonth = (y: number, m: number): number =>
  [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28,
   31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

function monthsFrom(startYear: number, startMonth: number, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const total = startYear * 12 + (startMonth - 1) + i;
    out.push(`${Math.floor(total / 12)}-${pad2((total % 12) + 1)}`);
  }
  return out;
}

/** Fiscal-year start year for a date under an 'MM-DD' anchor. */
function fiscalStartYear(forDate: string, periodAnchor: string): number {
  const y = Number(forDate.slice(0, 4));
  const m = Number(forDate.slice(5, 7));
  const d = Number(forDate.slice(8, 10));
  const am = Number(periodAnchor.slice(0, 2));
  const ad = Number(periodAnchor.slice(3, 5));
  return m < am || (m === am && d < ad) ? y - 1 : y;
}

/** {FY} SHORT form per spec §3 (Rule 46(b) headroom): '25-26'. Mirrors the S5 numbering token. */
export function fiscalYearLabel(forDate: string, periodAnchor: string): string {
  const start = fiscalStartYear(forDate, periodAnchor);
  return `${pad2(start % 100)}-${pad2((start + 1) % 100)}`;
}

export function gstrPeriodBounds(
  filingFrequency: 'monthly' | 'quarterly' | 'annual',
  periodAnchor: string,
  forDate: string,
  _timezone: string,
): { periodStart: string; periodEnd: string; taxPeriods: string[] } {
  if (periodAnchor.slice(3, 5) !== '01') {
    throw new CountryConfigError(`gstr requires a month-aligned period anchor (MM-01); got ${periodAnchor}`);
  }
  const y = Number(forDate.slice(0, 4));
  const m = Number(forDate.slice(5, 7));
  const anchorMonth = Number(periodAnchor.slice(0, 2));

  if (filingFrequency === 'monthly') {
    return {
      periodStart: `${y}-${pad2(m)}-01`,
      periodEnd: `${y}-${pad2(m)}-${pad2(daysInMonth(y, m))}`,
      taxPeriods: [`${y}-${pad2(m)}`],
    };
  }

  const monthsPerPeriod = filingFrequency === 'quarterly' ? 3 : 12;
  const fy = fiscalStartYear(forDate, periodAnchor);
  const elapsed = (y * 12 + (m - 1)) - (fy * 12 + (anchorMonth - 1));
  const startOffset = Math.floor(elapsed / monthsPerPeriod) * monthsPerPeriod;
  const startTotal = fy * 12 + (anchorMonth - 1) + startOffset;
  const sy = Math.floor(startTotal / 12);
  const sm = (startTotal % 12) + 1;
  const endTotal = startTotal + monthsPerPeriod - 1;
  const ey = Math.floor(endTotal / 12);
  const em = (endTotal % 12) + 1;
  return {
    periodStart: `${sy}-${pad2(sm)}-01`,
    periodEnd: `${ey}-${pad2(em)}-${pad2(daysInMonth(ey, em))}`,
    taxPeriods: monthsFrom(sy, sm, monthsPerPeriod),
  };
}

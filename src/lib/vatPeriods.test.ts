import { describe, it, expect } from 'vitest';
import { calendarQuarterBounds, quarterOf } from './vatPeriods';

describe('calendarQuarterBounds', () => {
  it('builds month-aligned bounds as pure strings (never a UTC round trip)', () => {
    expect(calendarQuarterBounds(2026, 1)).toEqual({ periodStart: '2026-01-01', periodEnd: '2026-03-31' });
    expect(calendarQuarterBounds(2026, 2)).toEqual({ periodStart: '2026-04-01', periodEnd: '2026-06-30' });
    expect(calendarQuarterBounds(2026, 3)).toEqual({ periodStart: '2026-07-01', periodEnd: '2026-09-30' });
    expect(calendarQuarterBounds(2026, 4)).toEqual({ periodStart: '2026-10-01', periodEnd: '2026-12-31' });
  });
  it('handles leap February in Q1', () => {
    expect(calendarQuarterBounds(2028, 1).periodEnd).toBe('2028-03-31'); // Q1 end is March regardless
    expect(calendarQuarterBounds(2028, 1).periodStart).toBe('2028-01-01');
  });
  // Regression: the old code did `new Date(y, m, 1).toISOString().split('T')[0]`,
  // which in any UTC+ browser shifted Jul 1 -> Jun 30 and (via month-slice
  // bucketing in calculateVATForPeriod) double-declared an entire month.
  it('Q3 start is July 1 exactly — the double-declared-month regression', () => {
    expect(calendarQuarterBounds(2026, 3).periodStart).toBe('2026-07-01');
    expect(calendarQuarterBounds(2026, 3).periodStart).not.toBe('2026-06-30');
  });
});

describe('quarterOf', () => {
  it('maps a tenant-local date to its calendar quarter', () => {
    expect(quarterOf('2026-01-01')).toEqual({ year: 2026, quarter: 1 });
    expect(quarterOf('2026-06-30')).toEqual({ year: 2026, quarter: 2 });
    expect(quarterOf('2026-07-01')).toEqual({ year: 2026, quarter: 3 });
    expect(quarterOf('2026-12-31')).toEqual({ year: 2026, quarter: 4 });
  });
});

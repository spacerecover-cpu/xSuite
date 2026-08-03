import { describe, it, expect } from 'vitest';
import { revenuePeriodRange } from './RevenueDashboard';

// Inclusive day count between two 'YYYY-MM-DD' strings.
const spanDays = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

describe('revenuePeriodRange — current vs previous window symmetry', () => {
  // Month/year windows are calendar-length (Jul = 31d, Jun = 30d), so day-count
  // parity only holds for the fixed-day filters; adjacency holds for all of them.
  it.each(['today', 'week'])(
    'gives the %s baseline exactly the same number of days as the current window',
    (filter) => {
      const r = revenuePeriodRange('2026-08-02', filter);
      expect(r.prevFrom).not.toBeNull();
      expect(spanDays(r.prevFrom!, r.prevTo!)).toBe(spanDays(r.from, r.to));
    },
  );

  it.each(['today', 'week', 'month', 'year'])(
    'leaves no gap or overlap between the %s baseline and the current window',
    (filter) => {
      const r = revenuePeriodRange('2026-08-02', filter);
      expect(spanDays(r.prevTo!, r.from)).toBe(2); // prevTo is the day before `from`
    },
  );

  it('builds a 7-day inclusive week, not 8 days against a 7-day baseline', () => {
    const r = revenuePeriodRange('2026-08-02', 'week');
    expect(r).toEqual({
      from: '2026-07-27',
      to: '2026-08-02',
      prevFrom: '2026-07-20',
      prevTo: '2026-07-26',
    });
    expect(spanDays(r.from, r.to)).toBe(7);
  });

  it('builds a single-day window for the Today filter', () => {
    expect(revenuePeriodRange('2026-08-02', 'today')).toEqual({
      from: '2026-08-02',
      to: '2026-08-02',
      prevFrom: '2026-08-01',
      prevTo: '2026-08-01',
    });
  });

  it('keeps the windows adjacent and non-overlapping for month and year', () => {
    const month = revenuePeriodRange('2026-08-02', 'month');
    expect(month.prevTo).toBe('2026-07-02');
    expect(month.from).toBe('2026-07-03');

    const year = revenuePeriodRange('2026-08-02', 'year');
    expect(year).toEqual({
      from: '2025-08-03',
      to: '2026-08-02',
      prevFrom: '2024-08-03',
      prevTo: '2025-08-02',
    });
  });

  it('never extends the current window past the tenant\'s today (no future-dated invoices)', () => {
    for (const filter of ['today', 'week', 'month', 'year', 'all']) {
      expect(revenuePeriodRange('2026-08-02', filter).to).toBe('2026-08-02');
    }
  });

  it('has no comparable baseline for the all-time filter', () => {
    expect(revenuePeriodRange('2026-08-02', 'all')).toEqual({
      from: '2020-01-01',
      to: '2026-08-02',
      prevFrom: null,
      prevTo: null,
    });
  });
});

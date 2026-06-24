import { describe, it, expect } from 'vitest';
import { getPeriodWindows, computeTrend } from './casePeriods';

describe('getPeriodWindows', () => {
  const now = new Date('2026-06-24T10:30:00.000Z');

  it('month: current = month-to-date, previous = full prior month', () => {
    const w = getPeriodWindows('month', now);
    expect(w.curStart).toBe('2026-06-01T00:00:00.000Z');
    expect(w.prevStart).toBe('2026-05-01T00:00:00.000Z');
    expect(w.prevEnd).toBe('2026-06-01T00:00:00.000Z');
  });

  it('month: rolls over the year at January', () => {
    const w = getPeriodWindows('month', new Date('2026-01-15T00:00:00.000Z'));
    expect(w.curStart).toBe('2026-01-01T00:00:00.000Z');
    expect(w.prevStart).toBe('2025-12-01T00:00:00.000Z');
  });

  it('year: current = year-to-date, previous = full prior year', () => {
    const w = getPeriodWindows('year', now);
    expect(w.curStart).toBe('2026-01-01T00:00:00.000Z');
    expect(w.prevStart).toBe('2025-01-01T00:00:00.000Z');
    expect(w.prevEnd).toBe('2026-01-01T00:00:00.000Z');
  });

  it('30d: equal-length rolling windows, prevEnd === curStart', () => {
    const w = getPeriodWindows('30d', now);
    expect(w.curStart).toBe('2026-05-25T10:30:00.000Z');
    expect(w.prevStart).toBe('2026-04-25T10:30:00.000Z');
    expect(w.prevEnd).toBe(w.curStart);
  });

  it('90d: rolling window spans 90 days back', () => {
    const w = getPeriodWindows('90d', now);
    expect(w.curStart).toBe('2026-03-26T10:30:00.000Z');
    expect(w.prevEnd).toBe(w.curStart);
  });
});

describe('computeTrend', () => {
  it('reports an increase', () => {
    expect(computeTrend(120, 100)).toEqual({ pct: 20, direction: 'up' });
  });

  it('reports a decrease as an absolute pct + down direction', () => {
    expect(computeTrend(80, 100)).toEqual({ pct: 20, direction: 'down' });
  });

  it('reports no change as flat', () => {
    expect(computeTrend(100, 100)).toEqual({ pct: 0, direction: 'flat' });
  });

  it('treats growth from zero as undefined pct (rendered as "new")', () => {
    expect(computeTrend(5, 0)).toEqual({ pct: null, direction: 'up' });
  });

  it('treats zero-to-zero as flat', () => {
    expect(computeTrend(0, 0)).toEqual({ pct: 0, direction: 'flat' });
  });

  it('rounds to the nearest whole percent', () => {
    expect(computeTrend(7, 6)).toEqual({ pct: 17, direction: 'up' });
  });
});

import { describe, it, expect } from 'vitest';
import { gstrPeriodBounds, fiscalYearLabel } from './periods';

describe('gstrPeriodBounds (04-01 anchor, Asia/Kolkata)', () => {
  it('monthly: mid-month resolves the calendar month', () => {
    expect(gstrPeriodBounds('monthly', '04-01', '2026-07-15', 'Asia/Kolkata')).toEqual({
      periodStart: '2026-07-01', periodEnd: '2026-07-31', taxPeriods: ['2026-07'],
    });
  });
  it('monthly: month-end boundary stays in its month (pure string math — no UTC drift)', () => {
    expect(gstrPeriodBounds('monthly', '04-01', '2026-07-31', 'Asia/Kolkata').taxPeriods).toEqual(['2026-07']);
    expect(gstrPeriodBounds('monthly', '04-01', '2026-08-01', 'Asia/Kolkata').taxPeriods).toEqual(['2026-08']);
  });
  it('monthly: February leap handling', () => {
    expect(gstrPeriodBounds('monthly', '04-01', '2028-02-10', 'Asia/Kolkata').periodEnd).toBe('2028-02-29');
    expect(gstrPeriodBounds('monthly', '04-01', '2027-02-10', 'Asia/Kolkata').periodEnd).toBe('2027-02-28');
  });
  it('quarterly (QRMP shape): fiscal quarters off the anchor', () => {
    expect(gstrPeriodBounds('quarterly', '04-01', '2026-07-15', 'Asia/Kolkata')).toEqual({
      periodStart: '2026-07-01', periodEnd: '2026-09-30', taxPeriods: ['2026-07', '2026-08', '2026-09'],
    });
    expect(gstrPeriodBounds('quarterly', '04-01', '2026-02-15', 'Asia/Kolkata')).toEqual({
      periodStart: '2026-01-01', periodEnd: '2026-03-31', taxPeriods: ['2026-01', '2026-02', '2026-03'],
    });
  });
  it('annual: the Apr–Mar fiscal year containing forDate', () => {
    expect(gstrPeriodBounds('annual', '04-01', '2026-07-15', 'Asia/Kolkata')).toEqual({
      periodStart: '2026-04-01', periodEnd: '2027-03-31',
      taxPeriods: ['2026-04','2026-05','2026-06','2026-07','2026-08','2026-09','2026-10','2026-11','2026-12','2027-01','2027-02','2027-03'],
    });
    expect(gstrPeriodBounds('annual', '04-01', '2026-02-15', 'Asia/Kolkata').periodStart).toBe('2025-04-01');
  });
  it('rejects a non-month-aligned anchor', () => {
    expect(() => gstrPeriodBounds('monthly', '04-15', '2026-07-15', 'Asia/Kolkata'))
      .toThrowError(/month-aligned/);
  });
});

describe('fiscalYearLabel — SHORT form per spec §3 ({FY} = 25-26, never 2025-26)', () => {
  it('renders yy-yy across the April boundary', () => {
    expect(fiscalYearLabel('2026-07-15', '04-01')).toBe('26-27');
    expect(fiscalYearLabel('2026-02-15', '04-01')).toBe('25-26');
    expect(fiscalYearLabel('2026-04-01', '04-01')).toBe('26-27');
    expect(fiscalYearLabel('2026-03-31', '04-01')).toBe('25-26');
  });
});

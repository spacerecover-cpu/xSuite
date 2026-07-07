import { describe, it, expect } from 'vitest';
import { countBusinessDays } from './businessDays';

// 2023-01-01 is a Sunday, so: 01=Sun 02=Mon 03=Tue 04=Wed 05=Thu 06=Fri 07=Sat.
// parseISO anchors to local midnight, so getDay() is the calendar weekday in any tz.
describe('countBusinessDays', () => {
  it('excludes Sat+Sun by default over a full week (Mon–Fri = 5)', () => {
    expect(countBusinessDays('2023-01-01', '2023-01-07')).toBe(5);
  });

  it('honors a Fri–Sat weekend (Gulf): a Fri→Sat span counts 0', () => {
    // Fri 06 + Sat 07, both weekend under [5,6]
    expect(countBusinessDays('2023-01-06', '2023-01-07', [5, 6])).toBe(0);
  });

  it('the same Fri→Sat span counts 1 under the default Sat/Sun weekend (Fri is a workday)', () => {
    expect(countBusinessDays('2023-01-06', '2023-01-07', [6, 0])).toBe(1);
  });

  it('counts a single workday inclusively', () => {
    expect(countBusinessDays('2023-01-02', '2023-01-02', [6, 0])).toBe(1); // Monday
  });

  it('returns 0 for a reversed or empty range', () => {
    expect(countBusinessDays('2023-01-07', '2023-01-01')).toBe(0);
    expect(countBusinessDays('', '2023-01-07')).toBe(0);
  });

  it('an all-weekend span (Sat→Sun) counts 0 under the default', () => {
    expect(countBusinessDays('2023-01-07', '2023-01-08', [6, 0])).toBe(0); // Sat + Sun
  });
});

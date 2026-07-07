import { describe, it, expect } from 'vitest';
import { startOfWeekIso } from './weekDates';

// 2023-01-04 is a Wednesday (01=Sun 02=Mon 03=Tue 04=Wed).
describe('startOfWeekIso (tenant-configurable first day of week)', () => {
  it('Monday-start (weekStartsOn=1) returns the Monday of the week', () => {
    expect(startOfWeekIso(new Date(2023, 0, 4), 1)).toBe('2023-01-02');
  });

  it('Sunday-start (weekStartsOn=0, Gulf/US) returns the Sunday of the week', () => {
    expect(startOfWeekIso(new Date(2023, 0, 4), 0)).toBe('2023-01-01');
  });

  it('a Sunday is its own week-start when weekStartsOn=0', () => {
    expect(startOfWeekIso(new Date(2023, 0, 1), 0)).toBe('2023-01-01');
  });

  it('a Sunday belongs to the prior Monday-started week when weekStartsOn=1', () => {
    expect(startOfWeekIso(new Date(2023, 0, 1), 1)).toBe('2022-12-26');
  });

  it('Saturday-start (weekStartsOn=6) returns the Saturday of the week', () => {
    // Wed 2023-01-04 → previous Saturday is 2022-12-31
    expect(startOfWeekIso(new Date(2023, 0, 4), 6)).toBe('2022-12-31');
  });
});

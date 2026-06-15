import { describe, it, expect } from 'vitest';
import { resolveWeekStartsOn } from './workWeek';

describe('resolveWeekStartsOn (D15)', () => {
  it('returns the config value, never hardcoded Monday', () => {
    expect(resolveWeekStartsOn(0)).toBe(0); // Sunday-start (GCC/US)
    expect(resolveWeekStartsOn(6)).toBe(6); // Saturday-start
  });
  it('defaults to Sunday (0) when unset, not Monday', () => {
    expect(resolveWeekStartsOn(undefined)).toBe(0);
  });
});

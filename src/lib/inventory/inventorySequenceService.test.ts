import { describe, it, expect } from 'vitest';
import { formatNextNumber, formatCurrentNumber, maxNumericSuffix } from './inventorySequenceService';

describe('maxNumericSuffix', () => {
  it('returns the highest numeric suffix among numbers with the prefix', () => {
    expect(maxNumericSuffix(['H25-0001', 'H25-0012', 'H25-0007'], 'H25')).toBe(12);
  });

  it('ignores other prefixes and malformed suffixes; prefix match is case-insensitive', () => {
    expect(maxNumericSuffix(['SSD-0099', 'h25-0003', 'H25-abc', 'H25-'], 'H25')).toBe(3);
  });

  it('returns 0 when nothing matches', () => {
    expect(maxNumericSuffix([], 'H25')).toBe(0);
    expect(maxNumericSuffix(['SSD-0001'], 'H25')).toBe(0);
  });
});

describe('formatNextNumber', () => {
  it('pads to the specified width', () => {
    expect(formatNextNumber('HDD', 0, 4)).toBe('HDD-0001');
    expect(formatNextNumber('HDD', 99, 4)).toBe('HDD-0100');
    expect(formatNextNumber('SSD', 999, 6)).toBe('SSD-001000');
  });

  it('handles single-digit padding', () => {
    expect(formatNextNumber('X', 8, 1)).toBe('X-9');
    expect(formatNextNumber('X', 9, 1)).toBe('X-10');
  });
});

describe('formatCurrentNumber', () => {
  it('returns em-dash when current_value is 0', () => {
    expect(formatCurrentNumber('HDD', 0, 4)).toBe('—');
  });

  it('formats allocated values correctly', () => {
    expect(formatCurrentNumber('HDD', 5, 4)).toBe('HDD-0005');
    expect(formatCurrentNumber('USB', 123, 6)).toBe('USB-000123');
  });
});

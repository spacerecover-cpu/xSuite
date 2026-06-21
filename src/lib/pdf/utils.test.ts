import { describe, it, expect } from 'vitest';
import { formatCapacity } from './utils';

describe('formatCapacity', () => {
  // Regression: catalog_device_capacities.name is a label like "2TB". parseFloat
  // stripped the unit ("2TB" -> 2) and the value was re-labelled "2 GB" on the
  // Device Check-In Receipt / Customer Copy / Checkout PDFs.
  it('preserves capacity labels that already carry a unit', () => {
    expect(formatCapacity('2TB')).toBe('2TB');
    expect(formatCapacity('500GB')).toBe('500GB');
    expect(formatCapacity('1.5 TB')).toBe('1.5 TB');
    expect(formatCapacity('4 TB')).toBe('4 TB');
    expect(formatCapacity('1PB')).toBe('1PB');
  });

  it('still formats bare GB numbers (legacy values stored without a unit)', () => {
    expect(formatCapacity('500')).toBe('500 GB');
    expect(formatCapacity('2000')).toBe('2.0 TB');
  });

  it('returns a dash for empty or blank input', () => {
    expect(formatCapacity(null)).toBe('-');
    expect(formatCapacity(undefined)).toBe('-');
    expect(formatCapacity('')).toBe('-');
    expect(formatCapacity('   ')).toBe('-');
  });
});

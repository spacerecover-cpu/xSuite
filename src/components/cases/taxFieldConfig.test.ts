import { describe, it, expect } from 'vitest';
import { resolveDefaultRate, resolveTaxLabel } from './taxFieldConfig';

describe('resolveDefaultRate (D10)', () => {
  it('uses the config default rate, never literal 5', () => {
    expect(resolveDefaultRate(undefined, 15)).toBe(15);
    expect(resolveDefaultRate(undefined, 0)).toBe(0); // 0% must survive (not coerced to 5)
  });
  it('prefers an explicit initial value when present', () => {
    expect(resolveDefaultRate(7.5, 15)).toBe(7.5);
  });
});

describe('resolveTaxLabel (D9)', () => {
  it('returns the country tax label, not hardcoded VAT', () => {
    expect(resolveTaxLabel('GST', 10)).toBe('GST (10%)');
    expect(resolveTaxLabel('Sales Tax', 8.25)).toBe('Sales Tax (8.25%)');
  });
});

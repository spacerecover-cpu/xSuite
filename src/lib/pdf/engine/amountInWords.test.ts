import { describe, it, expect } from 'vitest';
import {
  amountInWordsEn,
  amountInWordsAr,
  numberToWordsEn,
  numberToWordsEnIndian,
  formatAmountWordsForScale,
} from './amountInWords';

describe('numberToWordsEn', () => {
  const cases: [number, string][] = [
    [0, 'Zero'],
    [5, 'Five'],
    [21, 'Twenty One'],
    [100, 'One Hundred'],
    [115, 'One Hundred Fifteen'],
    [1050, 'One Thousand Fifty'],
    [1234, 'One Thousand Two Hundred Thirty Four'],
    [1000000, 'One Million'],
  ];
  it.each(cases)('spells %i as "%s"', (n, words) => {
    expect(numberToWordsEn(n)).toBe(words);
  });
});

describe('amountInWordsEn', () => {
  it('appends the currency and "only", and renders cents as NN/100', () => {
    expect(amountInWordsEn(1050, 'OMR')).toBe('OMR One Thousand Fifty only');
    expect(amountInWordsEn(1050.5, 'OMR')).toBe('OMR One Thousand Fifty and 50/100 only');
  });

  it('works without a currency', () => {
    expect(amountInWordsEn(7)).toBe('Seven only');
  });

  it('renders OMR 3-decimal minor units (baisa), not /100 (D13)', () => {
    expect(amountInWordsEn(1050.5, 'OMR', 3)).toBe('OMR One Thousand Fifty and 500/1000 only');
  });
  it('renders JPY with no fractional part (0 decimals)', () => {
    expect(amountInWordsEn(1050, 'JPY', 0)).toBe('JPY One Thousand Fifty only');
  });
  it('defaults to 2 decimals when omitted (back-compat)', () => {
    expect(amountInWordsEn(1050.5, 'OMR')).toBe('OMR One Thousand Fifty and 50/100 only');
  });
  it('carries a rounded-up minor unit into the whole (no 100/100 overflow)', () => {
    expect(amountInWordsEn(9.999, 'OMR', 2)).toBe('OMR Ten only');
    expect(amountInWordsEn(9.9999, 'OMR', 3)).toBe('OMR Ten only');
    expect(amountInWordsEn(999.999, 'OMR', 2)).toBe('OMR One Thousand only');
  });
});

describe('amountInWordsAr', () => {
  it('produces Arabic words for common amounts', () => {
    expect(amountInWordsAr(0)).toContain('صفر');
    expect(amountInWordsAr(5)).toContain('خمسة');
    expect(amountInWordsAr(1000)).toContain('ألف');
  });

  it('appends the currency', () => {
    expect(amountInWordsAr(5, 'ر.ع')).toContain('ر.ع');
  });

  it('carries a rounded-up minor unit into the whole', () => {
    expect(amountInWordsAr(9.999, '', 2)).toBe('عشرة فقط');
  });
});

describe('formatAmountWordsForScale carry', () => {
  it('carries a rounded-up minor unit into the whole (indian scale)', () => {
    expect(formatAmountWordsForScale(9.999, '₹', 2, 'indian')).toBe('₹ Ten only');
  });
  it('carries on the western path', () => {
    expect(formatAmountWordsForScale(9.999, 'OMR', 2, 'western')).toBe('OMR Ten only');
  });
});

describe('numberToWordsEnIndian (WP-L1)', () => {
  const cases: [number, string][] = [
    [0, 'Zero'],
    [999, 'Nine Hundred Ninety Nine'],
    [106200, 'One Lakh Six Thousand Two Hundred'],
    [1234000, 'Twelve Lakh Thirty Four Thousand'],
    [10000000, 'One Crore'],
    [123456789, 'Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine'],
  ];
  it.each(cases)('spells %i as "%s"', (n, words) => {
    expect(numberToWordsEnIndian(n)).toBe(words);
  });
  it('returns null for the honest-degrade guard cases (non-finite / negative)', () => {
    expect(numberToWordsEnIndian(Number.NaN)).toBeNull();
    expect(numberToWordsEnIndian(Number.POSITIVE_INFINITY)).toBeNull();
    expect(numberToWordsEnIndian(-5)).toBeNull();
  });
});

describe("amountInWordsEn scale='indian' (WP-L1)", () => {
  it('spells the walkthrough total', () => {
    expect(amountInWordsEn(106200, '₹', 2, 'indian')).toBe('₹ One Lakh Six Thousand Two Hundred only');
  });
  it('keeps cheque-style minor units', () => {
    expect(amountInWordsEn(106200.5, '₹', 2, 'indian')).toBe('₹ One Lakh Six Thousand Two Hundred and 50/100 only');
  });
  it('default scale stays western (byte-identical)', () => {
    expect(amountInWordsEn(1234000, 'OMR', 3)).toBe('OMR One Million Two Hundred Thirty Four Thousand only');
  });
  it('carries a rounded-up minor unit into the whole (indian scale)', () => {
    expect(amountInWordsEn(9.999, '₹', 2, 'indian')).toBe('₹ Ten only');
  });
  it('non-finite honest-degrades to no words (matches the western path, never renders "null")', () => {
    expect(amountInWordsEn(Number.NaN, '₹', 2, 'indian')).not.toContain('null');
    expect(amountInWordsEn(Number.NaN, '₹', 2, 'indian')).toBe(amountInWordsEn(Number.NaN, '₹', 2));
  });
});

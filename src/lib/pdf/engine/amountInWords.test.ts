import { describe, it, expect } from 'vitest';
import { amountInWordsEn, amountInWordsAr, numberToWordsEn } from './amountInWords';

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
});

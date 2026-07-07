import { describe, it, expect } from 'vitest';
import { formatAmountWordsForScale, numberToWordsEnIndian } from './amountInWords';

describe('amount-in-words scale hook (WP-S4 defines, WP-L1 implements indian)', () => {
  it('western scale spells normally with currency + cheque-style minor', () => {
    expect(formatAmountWordsForScale(1180.5, '₹', 2, 'western'))
      .toBe('₹ One Thousand One Hundred Eighty and 50/100 only');
  });

  it('indian scale spells lakh/crore now that WP-L1 implemented numberToWordsEnIndian', () => {
    expect(numberToWordsEnIndian(105000)).toBe('One Lakh Five Thousand');
    expect(formatAmountWordsForScale(105000, '₹', 2, 'indian')).toBe('₹ One Lakh Five Thousand only');
  });

  it('indian scale still honest-degrades to null for the non-finite guard cases (render omits the line)', () => {
    expect(numberToWordsEnIndian(Number.NaN)).toBeNull();
    expect(numberToWordsEnIndian(-1)).toBeNull();
    // formatAmountWordsForScale takes |amount| for the whole part, so only a
    // non-finite amount reaches the null branch (a negative renders its magnitude).
    expect(formatAmountWordsForScale(Number.NaN, '₹', 2, 'indian')).toBeNull();
  });
});

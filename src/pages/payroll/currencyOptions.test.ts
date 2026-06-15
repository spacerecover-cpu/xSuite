import { describe, it, expect } from 'vitest';
import { buildCurrencyOptions } from './currencyOptions';

describe('buildCurrencyOptions (D17)', () => {
  it('maps DB currency rows to options, not a hardcoded USD/EUR map', () => {
    expect(buildCurrencyOptions([
      { code: 'OMR', symbol: 'OMR', decimal_places: 3 },
      { code: 'JPY', symbol: '¥', decimal_places: 0 },
    ])).toEqual([
      { value: 'OMR', label: 'OMR (OMR)', symbol: 'OMR', decimals: 3 },
      { value: 'JPY', label: 'JPY (¥)', symbol: '¥', decimals: 0 },
    ]);
  });
  it('returns an empty list (not a US default) when no data', () => {
    expect(buildCurrencyOptions([])).toEqual([]);
  });
});

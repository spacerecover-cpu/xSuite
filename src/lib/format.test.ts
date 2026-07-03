import { describe, it, expect } from 'vitest';
import { format as dateFnsFormat, parseISO } from 'date-fns';
import { ar as arDateLocale } from 'date-fns/locale/ar';

import {
  formatCurrency,
  formatBaseEquivalent,
  formatNumber,
  formatDate,
  formatDateTime,
  formatCurrencyWithConfig,
  renderCurrencyToken,
  toDateInputValue,
  formatTaxRatePercent,
} from './format';
import type { CurrencyConfig } from '../types/tenantConfig';
import { REQUIRED_SENTINEL } from '../types/tenantConfig';

describe('formatCurrency (currency-aware decimals)', () => {
  it('uses 2 decimals for USD', () => {
    expect(formatCurrency(1234.5, 'USD')).toBe('$1,234.50');
  });
  it('uses 3 decimals for OMR (ISO-4217)', () => {
    expect(formatCurrency(1234.5, 'OMR')).toMatch(/1,234\.500/);
  });
  it('uses 0 decimals for JPY', () => {
    expect(formatCurrency(1234, 'JPY')).toMatch(/1,234(?!\.)/);
  });
});

describe('formatBaseEquivalent', () => {
  it('formats the converted base amount with its currency decimals', () => {
    // 1000 USD * 0.385 -> 385 OMR (3dp)
    expect(formatBaseEquivalent(1000, 0.385, 'OMR')).toMatch(/385\.000/);
  });
  it('returns null when document currency equals base (no preview needed)', () => {
    expect(formatBaseEquivalent(1000, 1, 'USD', 'USD')).toBeNull();
  });
});

// --- Phase 4a: locale-aware formatting (gated on ar, en byte-identical) ---

describe('en path is byte-identical to current main (regression pin)', () => {
  // These literals pin the exact pre-Phase-4a output. The default param must
  // preserve 'en-US' exactly so existing 40+ consumers are unaffected.
  it('formatCurrency with no locale arg', () => {
    expect(formatCurrency(1234.5, 'USD')).toBe('$1,234.50');
  });
  it("formatCurrency with explicit 'en-US' locale", () => {
    expect(formatCurrency(1234.5, 'USD', 'en-US')).toBe('$1,234.50');
  });
  it('formatNumber with no locale arg', () => {
    expect(formatNumber(1234567.5)).toBe('1,234,567.50');
    expect(formatNumber(1234.5, 0)).toBe('1,235');
  });
  it("formatNumber with explicit 'en-US' locale", () => {
    expect(formatNumber(1234567.5, 2, 'en-US')).toBe('1,234,567.50');
  });
  it('formatDate with no locale arg', () => {
    expect(formatDate('2026-05-31', 'MMM dd, yyyy')).toBe('May 31, 2026');
  });
  it("formatDate with explicit 'en-US' locale", () => {
    expect(formatDate('2026-05-31', 'MMM dd, yyyy', 'en-US')).toBe('May 31, 2026');
  });
  it('formatDateTime stays English', () => {
    expect(formatDateTime('2026-05-31T13:05:00')).toBe('May 31, 2026 13:05');
  });
  it('formatCurrencyWithConfig with no locale arg', () => {
    const cfg: CurrencyConfig = {
      code: 'USD',
      symbol: '$',
      name: 'US Dollar',
      decimalPlaces: 2,
      decimalSeparator: '.',
      thousandsSeparator: ',',
      position: 'before',
      displayMode: 'symbol',
      negativeFormat: 'minus',
    };
    expect(formatCurrencyWithConfig(1234.5, cfg)).toBe('$1,234.50');
  });
  it("formatCurrencyWithConfig with explicit 'en-US' locale is unchanged", () => {
    const cfg: CurrencyConfig = {
      code: 'USD',
      symbol: '$',
      name: 'US Dollar',
      decimalPlaces: 2,
      decimalSeparator: '.',
      thousandsSeparator: ',',
      position: 'before',
      displayMode: 'symbol',
      negativeFormat: 'minus',
    };
    expect(formatCurrencyWithConfig(1234.5, cfg, 'en-US')).toBe('$1,234.50');
  });
});

describe('ar path is locale-aware (Gregorian, Western numerals)', () => {
  it('formatDate uses the date-fns ar locale (Arabic month, Gregorian, Western numerals)', () => {
    const arOut = formatDate('2026-05-31', 'MMM dd, yyyy', 'ar-SA');
    // Arabic month name present, day/year stay Western numerals, year is Gregorian 2026.
    expect(arOut).not.toBe('May 31, 2026');
    expect(arOut).toContain('31');
    expect(arOut).toContain('2026');
    expect(arOut).not.toMatch(/[٠-٩]/); // Western numerals, not Arabic-Indic
    // matches the canonical date-fns ar rendering
    expect(arOut).toBe(
      dateFnsFormat(parseISO('2026-05-31'), 'MMM dd, yyyy', { locale: arDateLocale }),
    );
  });

  it('formatNumber emits ar-locale-tagged output with Western numerals (numberingSystem latn)', () => {
    const out = formatNumber(1234567.5, 2, 'ar-SA');
    // Locale tag honored, but digits forced Latin per the locked Western-numeral policy.
    const expected = new Intl.NumberFormat('ar-SA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      numberingSystem: 'latn',
    }).format(1234567.5);
    expect(out).toBe(expected);
    expect(out).not.toMatch(/[٠-٩]/); // no Arabic-Indic digits
  });

  it('formatCurrency emits ar-locale-tagged output with Western numerals (numberingSystem latn)', () => {
    const out = formatCurrency(1234.5, 'USD', 'ar-SA');
    const expected = new Intl.NumberFormat('ar-SA', {
      style: 'currency',
      currency: 'USD',
      numberingSystem: 'latn',
    }).format(1234.5);
    expect(out).toBe(expected);
    expect(out).not.toMatch(/[٠-٩]/); // no Arabic-Indic digits
  });

  it('formatCurrencyWithConfig keeps Western numerals under ar (no Arabic-Indic digits)', () => {
    const cfg: CurrencyConfig = {
      code: 'USD',
      symbol: '$',
      name: 'US Dollar',
      decimalPlaces: 2,
      decimalSeparator: '.',
      thousandsSeparator: ',',
      position: 'before',
      displayMode: 'symbol',
      negativeFormat: 'minus',
    };
    const out = formatCurrencyWithConfig(1234.5, cfg, 'ar-SA');
    // v1 policy: Western numerals (Gulf-ERP norm) — output digit set unchanged.
    expect(out).toMatch(/[0-9]/);
    expect(out).not.toMatch(/[٠-٩]/); // no Arabic-Indic digits
    expect(out).toContain('1,234.50');
  });
});

// --- Phase 2: currency display_mode + negative_format ---

const cfg = (over: Partial<CurrencyConfig> = {}): CurrencyConfig => ({
  code: 'USD',
  symbol: '$',
  name: 'US Dollar',
  decimalPlaces: 2,
  decimalSeparator: '.',
  thousandsSeparator: ',',
  position: 'before',
  displayMode: 'symbol',
  negativeFormat: 'minus',
  ...over,
});

const omr = (over: Partial<CurrencyConfig> = {}): CurrencyConfig =>
  cfg({ code: 'OMR', symbol: 'ر.ع.', name: 'Omani Rial', decimalPlaces: 3, position: 'after', ...over });

describe('renderCurrencyToken — which token a tenant sees', () => {
  it("'symbol' mode returns the display symbol (default, byte-identical)", () => {
    expect(renderCurrencyToken(cfg())).toBe('$');
    expect(renderCurrencyToken(omr())).toBe('ر.ع.');
  });

  it("'iso_code' mode returns the ISO 4217 code", () => {
    expect(renderCurrencyToken(cfg({ displayMode: 'iso_code' }))).toBe('USD');
    expect(renderCurrencyToken(omr({ displayMode: 'iso_code' }))).toBe('OMR');
  });

  it("'symbol_code' mode returns 'symbol code' (e.g. 'ر.ع. OMR')", () => {
    expect(renderCurrencyToken(omr({ displayMode: 'symbol_code' }))).toBe('ر.ع. OMR');
    expect(renderCurrencyToken(cfg({ displayMode: 'symbol_code' }))).toBe('$ USD');
  });

  it('falls back to the ISO code when the display symbol is empty (never blank)', () => {
    expect(renderCurrencyToken(omr({ symbol: '' }))).toBe('OMR');
    // symbol_code with no symbol must NOT duplicate the code ('OMR OMR')
    expect(renderCurrencyToken(omr({ symbol: '', displayMode: 'symbol_code' }))).toBe('OMR');
  });

  it('falls back to the symbol when the code is the unresolved sentinel (no Symbol→string crash)', () => {
    expect(renderCurrencyToken(cfg({ code: REQUIRED_SENTINEL, displayMode: 'iso_code' }))).toBe('$');
  });
});

describe('formatCurrencyWithConfig — display_mode + negative_format', () => {
  it("'iso_code' renders the code as the token (OMR after-position, 3dp)", () => {
    expect(formatCurrencyWithConfig(1234.5, omr({ displayMode: 'iso_code' }))).toBe('1,234.500 OMR');
  });

  it("'symbol_code' renders 'symbol code' as the token", () => {
    expect(formatCurrencyWithConfig(1234.5, omr({ displayMode: 'symbol_code' }))).toBe('1,234.500 ر.ع. OMR');
  });

  it("'iso_code' before-position renders the token verbatim (no injected space)", () => {
    expect(formatCurrencyWithConfig(1234.5, cfg({ displayMode: 'iso_code' }))).toBe('USD1,234.50');
  });

  it("negative_format 'parentheses' wraps negatives in accounting parens (before position)", () => {
    expect(formatCurrencyWithConfig(-1234.5, cfg({ negativeFormat: 'parentheses' }))).toBe('($1,234.50)');
  });

  it("negative_format 'parentheses' wraps negatives (after position, iso_code)", () => {
    expect(
      formatCurrencyWithConfig(-1234.5, omr({ negativeFormat: 'parentheses', displayMode: 'iso_code' })),
    ).toBe('(1,234.500 OMR)');
  });

  it("negative_format 'parentheses' leaves POSITIVE amounts unwrapped", () => {
    expect(formatCurrencyWithConfig(1234.5, cfg({ negativeFormat: 'parentheses' }))).toBe('$1,234.50');
  });

  it("default negative_format 'minus' is byte-identical to pre-Phase-2 (sign inside the number)", () => {
    expect(formatCurrencyWithConfig(-1234.5, cfg())).toBe('$-1,234.50');
  });
});

// D18 grouping coverage, migrated from the retired formatCurrencyWithSettings.
// formatCurrencyWithConfig is now the single tenant-separator-aware formatter.
describe('formatCurrencyWithConfig — tenant grouping separators (D18)', () => {
  it('honors a custom thousands separator (space), not forced en-US comma grouping', () => {
    const out = formatCurrencyWithConfig(
      1234567.5,
      omr({ thousandsSeparator: ' ', decimalSeparator: '.', position: 'after', displayMode: 'iso_code' }),
    );
    expect(out).toBe('1 234 567.500 OMR');
  });
  it('defaults to comma/dot grouping for a standard before-position config', () => {
    expect(formatCurrencyWithConfig(1234567.5, cfg())).toBe('$1,234,567.50');
  });
});

describe('toDateInputValue (timestamptz -> yyyy-MM-dd for <input type="date">)', () => {
  it('slices the date out of a full ISO timestamptz without timezone drift', () => {
    expect(toDateInputValue('2026-07-03T00:00:00+00:00')).toBe('2026-07-03');
    expect(toDateInputValue('2026-07-03 00:00:00+00')).toBe('2026-07-03');
    expect(toDateInputValue('2026-12-31T23:59:59.999Z')).toBe('2026-12-31');
  });

  it('passes through an already date-only value', () => {
    expect(toDateInputValue('2026-07-03')).toBe('2026-07-03');
  });

  it('returns empty string for null/undefined/empty (so the input renders blank, not "Invalid")', () => {
    expect(toDateInputValue(null)).toBe('');
    expect(toDateInputValue(undefined)).toBe('');
    expect(toDateInputValue('')).toBe('');
  });

  it('formats a Date instance', () => {
    expect(toDateInputValue(new Date('2026-07-03T12:00:00Z'))).toBe('2026-07-03');
  });

  it('returns empty string for an unparseable value rather than throwing', () => {
    expect(toDateInputValue('not-a-date')).toBe('');
  });
});

describe('formatTaxRatePercent', () => {
  it('renders stored-percent rates directly — 5 means 5%, never 500%', () => {
    expect(formatTaxRatePercent(5)).toBe('5.00%');
    expect(formatTaxRatePercent(20)).toBe('20.00%');
    expect(formatTaxRatePercent(8.875)).toBe('8.88%');
  });
  it('treats null/undefined as 0', () => {
    expect(formatTaxRatePercent(null)).toBe('0.00%');
    expect(formatTaxRatePercent(undefined)).toBe('0.00%');
  });
});

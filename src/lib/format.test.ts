import { describe, it, expect, vi } from 'vitest';
import { format as dateFnsFormat, parseISO } from 'date-fns';
import { ar as arDateLocale } from 'date-fns/locale/ar';

// Mock supabaseClient so format.ts can be imported without env vars
vi.mock('./supabaseClient', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }),
  },
}));

import {
  formatCurrency,
  formatBaseEquivalent,
  formatNumber,
  formatDate,
  formatDateTime,
  formatCurrencyWithConfig,
} from './format';
import type { CurrencyConfig } from '../types/tenantConfig';

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
    };
    const out = formatCurrencyWithConfig(1234.5, cfg, 'ar-SA');
    // v1 policy: Western numerals (Gulf-ERP norm) — output digit set unchanged.
    expect(out).toMatch(/[0-9]/);
    expect(out).not.toMatch(/[٠-٩]/); // no Arabic-Indic digits
    expect(out).toContain('1,234.50');
  });
});

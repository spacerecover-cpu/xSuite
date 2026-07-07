import { describe, it, expect } from 'vitest';
import { formatCapacity, formatCurrency, formatEngineMoney, formatPartyAddressLines } from './utils';

describe('formatEngineMoney', () => {
  // Regression: adapters used a bare `toFixed()` that dropped the thousands
  // separator (e.g. "2000.000 OMR"); all money must now group consistently.
  it('groups thousands and respects decimal places + symbol position', () => {
    expect(formatEngineMoney(2000, { symbol: 'OMR', decimalPlaces: 3, position: 'after' })).toBe('2,000.000 OMR');
    expect(formatEngineMoney(1000, { symbol: 'OMR', decimalPlaces: 3, position: 'before' })).toBe('OMR 1,000.000');
    expect(formatEngineMoney(1234567.5, { symbol: 'AED', decimalPlaces: 2, position: 'after' })).toBe('1,234,567.50 AED');
  });

  it('leaves sub-thousand and zero-decimal amounts correct', () => {
    expect(formatEngineMoney(250, { symbol: 'AED', decimalPlaces: 2, position: 'after' })).toBe('250.00 AED');
    expect(formatEngineMoney(5000, { symbol: 'JPY', decimalPlaces: 0, position: 'before' })).toBe('JPY 5,000');
  });

  it('groups the integer part of a negative amount', () => {
    expect(formatEngineMoney(-1500, { symbol: 'AED', decimalPlaces: 2, position: 'after' })).toBe('-1,500.00 AED');
  });
});

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

describe('formatEngineMoney separators', () => {
  it('defaults to comma-grouping dot-decimal (legacy byte-parity)', () => {
    expect(formatEngineMoney(2000000.5, { symbol: 'OMR', decimalPlaces: 3, position: 'after' }))
      .toBe('2,000,000.500 OMR');
  });
  it('renders continental EU shape from explicit separators', () => {
    expect(formatEngineMoney(1234567.89, {
      symbol: '€', decimalPlaces: 2, position: 'before',
      decimalSeparator: ',', thousandsSeparator: '.',
    })).toBe('€ 1.234.567,89');
  });
  it('supports empty thousands separator', () => {
    expect(formatEngineMoney(1234.5, {
      symbol: 'X', decimalPlaces: 2, position: 'after', thousandsSeparator: '',
    })).toBe('1234.50 X');
  });
});

describe('formatPartyAddressLines', () => {
  const addr = {
    line1: 'Bldg 12, Way 3015', line2: 'Al Khuwair', city: 'Muscat',
    subdivision: 'Muscat', postal_code: '133', country: 'Oman', free_text: null,
  };
  it('street-first order (GCC/US)', () => {
    expect(formatPartyAddressLines(addr, false)).toEqual([
      'Bldg 12, Way 3015', 'Al Khuwair', 'Muscat, Muscat 133', 'Oman',
    ]);
  });
  it('postal-first order (EU/JP city line)', () => {
    expect(formatPartyAddressLines(addr, true)).toEqual([
      'Bldg 12, Way 3015', 'Al Khuwair', '133 Muscat, Muscat', 'Oman',
    ]);
  });
  it('falls back to free text when no structured fields exist (M-I legacy rows)', () => {
    expect(formatPartyAddressLines({ free_text: 'PO Box 1, Ruwi, Muscat' }, false))
      .toEqual(['PO Box 1, Ruwi, Muscat']);
  });
  it('returns [] when nothing is present', () => {
    expect(formatPartyAddressLines({}, false)).toEqual([]);
  });
});

describe("formatEngineMoney digitGrouping '3;2' (WP-L1)", () => {
  it('groups lakh/crore with the walkthrough total', () => {
    expect(formatEngineMoney(106200, { symbol: '₹', decimalPlaces: 2, position: 'before', digitGrouping: '3;2' }))
      .toBe('₹ 1,06,200.00');
    expect(formatEngineMoney(12345678.9, { symbol: '₹', decimalPlaces: 2, position: 'before', digitGrouping: '3;2' }))
      .toBe('₹ 1,23,45,678.90');
    expect(formatEngineMoney(250, { symbol: '₹', decimalPlaces: 2, position: 'before', digitGrouping: '3;2' }))
      .toBe('₹ 250.00');
  });
  it("absent / '3' stays byte-identical to today", () => {
    expect(formatEngineMoney(106200, { symbol: 'AED', decimalPlaces: 2, position: 'after' })).toBe('106,200.00 AED');
    expect(formatEngineMoney(106200, { symbol: 'AED', decimalPlaces: 2, position: 'after', digitGrouping: '3' }))
      .toBe('106,200.00 AED');
  });
  it('formatCurrency (CurrencyConfig mirror) honors digitGrouping', () => {
    expect(formatCurrency(106200, {
      code: 'INR', symbol: '₹', name: 'Indian Rupee', decimalPlaces: 2,
      decimalSeparator: '.', thousandsSeparator: ',', position: 'before',
      displayMode: 'symbol', negativeFormat: 'minus', digitGrouping: '3;2',
    })).toBe('₹1,06,200.00');
  });
});

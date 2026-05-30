import { describe, it, expect, vi } from 'vitest';

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

import { formatCurrency, formatBaseEquivalent } from './format';

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

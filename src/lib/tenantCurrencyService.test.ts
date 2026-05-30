import { describe, it, expect, vi } from 'vitest';

// Mock supabaseClient so tenantCurrencyService.ts can be imported without env vars
vi.mock('./supabaseClient', () => ({
  supabase: {},
}));

import { assertCanAddCurrency, assertCanDeactivate } from './tenantCurrencyService';

const rows = [
  { id: '1', currency_code: 'OMR', is_base: true, is_active: true, display_order: 0 },
  { id: '2', currency_code: 'USD', is_base: false, is_active: true, display_order: 1 },
];

describe('tenant currency guards', () => {
  it('rejects a duplicate currency', () => {
    expect(() => assertCanAddCurrency(rows, 'USD')).toThrow(/already/i);
  });
  it('allows a new currency', () => {
    expect(() => assertCanAddCurrency(rows, 'EUR')).not.toThrow();
  });
  it('refuses to deactivate the base currency', () => {
    expect(() => assertCanDeactivate(rows, '1')).toThrow(/base/i);
  });
  it('allows deactivating a non-base currency', () => {
    expect(() => assertCanDeactivate(rows, '2')).not.toThrow();
  });
});

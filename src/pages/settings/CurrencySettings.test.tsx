// src/pages/settings/CurrencySettings.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const svc = vi.hoisted(() => ({
  listTenantCurrencies: vi.fn(),
  listAddableCurrencies: vi.fn(),
  addTenantCurrency: vi.fn(),
  setCurrencyActive: vi.fn(),
}));
vi.mock('../../lib/tenantCurrencyService', () => svc);

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { role: 'admin' } }),
}));
vi.mock('../../contexts/TenantConfigContext', () => ({
  useTenantConfig: () => ({ refreshConfig: vi.fn() }),
}));

// Mirror the real hook: a NEW object literal on every render. A fetch callback
// that lists it as a dependency would re-run forever.
vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import { TenantCurrenciesSection } from './CurrencySettings';

beforeEach(() => {
  Object.values(svc).forEach((m) => m.mockReset());
  // Fresh arrays per call, like the real service — identical references would let
  // React bail out of re-rendering and mask a runaway effect.
  svc.listTenantCurrencies.mockImplementation(async () => [
    { id: 'c1', currency_code: 'AED', is_base: true, is_active: true, display_order: 1 },
  ]);
  svc.listAddableCurrencies.mockImplementation(async () => [{ code: 'USD', name: 'US Dollar' }]);
});

describe('TenantCurrenciesSection', () => {
  it('fetches once on mount and does not loop', async () => {
    render(<TenantCurrenciesSection />);
    await waitFor(() => expect(screen.getByText('AED')).toBeInTheDocument());

    // Give any runaway effect several async cycles to fire.
    await new Promise((r) => setTimeout(r, 100));

    expect(svc.listTenantCurrencies).toHaveBeenCalledTimes(1);
    expect(svc.listAddableCurrencies).toHaveBeenCalledTimes(1);
  });
});

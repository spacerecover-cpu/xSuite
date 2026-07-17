import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../../../../lib/tenantService', () => ({
  tenantService: { listPlans: vi.fn(() => Promise.resolve([])), createTenant: vi.fn() },
}));
vi.mock('../../../../lib/geoCountryService', () => ({
  geoCountryService: { listOnboardableCountries: vi.fn(() => Promise.resolve([])) },
}));
vi.mock('../../../../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }));
vi.mock('../../../../lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../../../hooks/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

import { useOnboardingFlow } from './useOnboardingFlow';

describe('useOnboardingFlow persistence', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('never writes password or confirmPassword to sessionStorage', async () => {
    const { result } = renderHook(() => useOnboardingFlow());

    await act(async () => {
      result.current.updateField('companyName', 'Acme Labs');
      result.current.updateField('password', 'SuperSecret123!');
      result.current.updateField('confirmPassword', 'SuperSecret123!');
    });

    await waitFor(() => {
      const raw = sessionStorage.getItem('xsuite_onboarding');
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw as string);
      expect(parsed.formData.companyName).toBe('Acme Labs');
      expect(parsed.formData).not.toHaveProperty('password');
      expect(parsed.formData).not.toHaveProperty('confirmPassword');
    });

    expect(sessionStorage.getItem('xsuite_onboarding')).not.toContain('SuperSecret123!');
  });
});

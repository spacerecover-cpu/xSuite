import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequireTenantWorkspace } from './RequireTenantWorkspace';
import { useAuth } from '../contexts/AuthContext';

vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }));

const DEFAULTS = {
  user: { id: 'u1' },
  profile: null,
  session: null,
  loading: false,
  profileStatus: 'approved',
  passwordResetRequired: false,
  mfaPending: false,
  signIn: vi.fn(),
  signInWithGoogle: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  refreshProfile: vi.fn(),
  completeMFAChallenge: vi.fn(),
};

const baseProfile = {
  id: 'u1',
  full_name: 'Tester',
  phone: null,
  avatar_url: null,
  is_active: true,
  last_login: null,
  password_reset_required: false,
  case_access_level: 'full',
};

const PLATFORM_ADMIN = { ...baseProfile, role: 'owner', tenant_id: null };
const TENANT_ADMIN = { ...baseProfile, role: 'admin', tenant_id: 't1' };
const TENANT_OWNER = { ...baseProfile, role: 'owner', tenant_id: 't1' };

function setAuth(over: Record<string, unknown>) {
  vi.mocked(useAuth).mockReturnValue({ ...DEFAULTS, ...over } as unknown as ReturnType<typeof useAuth>);
}

// Render the guard at a tenant URL alongside a /platform-admin landing route so
// a redirect resolves to observable content.
function renderGuard() {
  return render(
    <MemoryRouter initialEntries={['/cases']}>
      <Routes>
        <Route
          path="/cases"
          element={
            <RequireTenantWorkspace>
              <div>tenant content</div>
            </RequireTenantWorkspace>
          }
        />
        <Route path="/platform-admin" element={<div>platform portal</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireTenantWorkspace', () => {
  beforeEach(() => vi.mocked(useAuth).mockReset());

  it('redirects a platform super-admin (null tenant + owner) to /platform-admin', () => {
    setAuth({ profile: PLATFORM_ADMIN });
    renderGuard();
    expect(screen.getByText('platform portal')).toBeInTheDocument();
    expect(screen.queryByText('tenant content')).not.toBeInTheDocument();
  });

  it('lets a tenant user into the workspace', () => {
    setAuth({ profile: TENANT_ADMIN });
    renderGuard();
    expect(screen.getByText('tenant content')).toBeInTheDocument();
    expect(screen.queryByText('platform portal')).not.toBeInTheDocument();
  });

  it('treats a tenant owner (has tenant_id) as a tenant user, not a platform admin', () => {
    setAuth({ profile: TENANT_OWNER });
    renderGuard();
    expect(screen.getByText('tenant content')).toBeInTheDocument();
  });

  it('passes through when there is no profile yet (defers to ProtectedRoute)', () => {
    setAuth({ profile: null });
    renderGuard();
    expect(screen.getByText('tenant content')).toBeInTheDocument();
  });
});

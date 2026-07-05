import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';

vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }));
// MFAChallenge → mfaService → supabaseClient, whose module-load env check would
// throw in the test container (no .env). It's never called while just rendering.
vi.mock('../lib/supabaseClient', () => ({ supabase: {} }));
// PasswordChangeModal pulls in userManagementService → supabaseClient; only used
// on submit, not on render.
vi.mock('../lib/userManagementService', () => ({ userManagementService: { changePassword: vi.fn() } }));

const DEFAULTS = {
  user: { id: 'u1' },
  profile: null,
  session: null,
  loading: false,
  profileStatus: 'loading',
  passwordResetRequired: false,
  mfaPending: false,
  signIn: vi.fn(),
  signInWithGoogle: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  refreshProfile: vi.fn(),
  completeMFAChallenge: vi.fn(),
};

const APPROVED_PROFILE = {
  id: 'u1',
  full_name: 'Tester',
  role: 'admin',
  phone: null,
  avatar_url: null,
  is_active: true,
  last_login: null,
  password_reset_required: false,
  case_access_level: 'full',
  tenant_id: 't1',
};

function setAuth(over: Record<string, unknown>) {
  vi.mocked(useAuth).mockReturnValue({ ...DEFAULTS, ...over } as unknown as ReturnType<typeof useAuth>);
}

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={['/cases']}>
      <ProtectedRoute>
        <div>protected content</div>
      </ProtectedRoute>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => vi.mocked(useAuth).mockReset());

  it('shows the loading skeleton (not "Profile Error") during the logout transition (user set, profile null, status loading)', () => {
    // This is the reported bug: signOut clears profile before user, leaving
    // user=set, profile=null, profileStatus='loading', loading=false.
    setAuth({ user: { id: 'u1' }, profile: null, profileStatus: 'loading', loading: false });
    const { container } = renderRoute();

    expect(screen.queryByText('Profile Error')).not.toBeInTheDocument();
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('shows the "Profile Error" card only when profileStatus is genuinely error', () => {
    setAuth({ profile: null, profileStatus: 'error' });
    renderRoute();
    expect(screen.getByText('Profile Error')).toBeInTheDocument();
  });

  it('the Profile Error card offers recovery actions instead of dead-ending the user', () => {
    // Reported bug: the card had no actions at all, so a user with a dead
    // session was stranded — no retry, no way back to login — until they
    // cleared site data (the "only works in incognito" report).
    const refreshProfile = vi.fn();
    const signOut = vi.fn();
    setAuth({ profile: null, profileStatus: 'error', refreshProfile, signOut });
    renderRoute();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refreshProfile).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /log in again/i }));
    expect(signOut).toHaveBeenCalled();
  });

  it('renders the protected content when approved', () => {
    setAuth({ profile: APPROVED_PROFILE, profileStatus: 'approved' });
    renderRoute();
    expect(screen.getByText('protected content')).toBeInTheDocument();
  });

  it('renders the MFA challenge (not protected content) when mfaPending, even via deep link (C2)', () => {
    // Reported bypass: an MFA-pending session deep-linking to /cases rendered
    // the page because the challenge only existed on /login.
    setAuth({ profile: APPROVED_PROFILE, profileStatus: 'approved', mfaPending: true });
    renderRoute();
    expect(screen.getByText('Two-Factor Authentication')).toBeInTheDocument();
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
  });

  it('forces the password-change modal (not protected content) when passwordResetRequired, on any route (H5)', () => {
    // Forced rotation was only enforced on /login, so a deep link / refresh
    // walked straight into the app. Gate it in ProtectedRoute too.
    setAuth({ profile: APPROVED_PROFILE, profileStatus: 'approved', passwordResetRequired: true });
    renderRoute();
    expect(screen.getByText('Change Your Password')).toBeInTheDocument();
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
  });

  it('bounces a recovery-pending session to /reset-password instead of admitting it (deep-nav hijack guard)', () => {
    // A session minted from an email reset link is fully "logged in" — without
    // this gate a mid-flow navigation to any protected route would land in the
    // app with the old password still active.
    setAuth({ profile: APPROVED_PROFILE, profileStatus: 'approved', recoveryPending: true });
    render(
      <MemoryRouter initialEntries={['/cases']}>
        <Routes>
          <Route
            path="/cases"
            element={
              <ProtectedRoute>
                <div>protected content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/reset-password" element={<div>reset probe</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('reset probe')).toBeInTheDocument();
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
  });
});

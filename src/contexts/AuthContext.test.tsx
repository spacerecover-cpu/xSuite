import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';

// Controllable supabase + service mocks so we can drive the auth lifecycle.
let authStateCb: ((event: string, session: unknown) => void) | null = null;
let maybeSingleImpl: () => Promise<{ data: unknown; error: unknown }> = async () => ({ data: null, error: null });
let needsMFAImpl: () => Promise<boolean> = async () => false;
// Real supabase.auth.signOut() fires SIGNED_OUT only after a network round-trip;
// let tests suppress it to exercise the window between signOut() and SIGNED_OUT.
let autoFireSignedOut = true;
const signOutMock = vi.fn(async () => {
  if (autoFireSignedOut) authStateCb?.('SIGNED_OUT', null);
});

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { user: { id: 'u1' } } } })),
      onAuthStateChange: vi.fn((cb: (e: string, s: unknown) => void) => {
        authStateCb = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signOut: () => signOutMock(),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => maybeSingleImpl() }) }) }),
  },
}));
vi.mock('../lib/mfaService', () => ({ mfaService: { needsMFAVerification: () => needsMFAImpl() } }));
const clearPermissionCache = vi.fn();
vi.mock('../lib/rolePermissionsService', () => ({ rolePermissionsService: { clearCache: () => clearPermissionCache() } }));
const setSentryUser = vi.fn();
vi.mock('../lib/logger', () => ({ logger: { error: vi.fn() }, setSentryUser: (u: unknown) => setSentryUser(u) }));

const APPROVED = {
  id: 'u1', full_name: 'T', role: 'admin', is_active: true,
  password_reset_required: false, tenant_id: 't1',
};

function Harness() {
  const { profileStatus, loading, profile, mfaPending, signOut, refreshProfile } = useAuth();
  return (
    <div>
      <span data-testid="state">{`${profileStatus}|${loading}|${profile ? 'yes' : 'no'}`}</span>
      <span data-testid="mfa">{String(mfaPending)}</span>
      <button onClick={() => void signOut()}>logout</button>
      <button onClick={() => void refreshProfile()}>refresh</button>
    </div>
  );
}

const state = () => screen.getByTestId('state').textContent ?? '';

describe('AuthContext', () => {
  beforeEach(() => {
    authStateCb = null;
    maybeSingleImpl = async () => ({ data: null, error: null });
    needsMFAImpl = async () => false;
    autoFireSignedOut = true;
    signOutMock.mockClear();
    clearPermissionCache.mockClear();
    setSentryUser.mockClear();
  });

  it('loads an approved profile on boot', async () => {
    maybeSingleImpl = async () => ({ data: APPROVED, error: null });
    render(<AuthProvider><Harness /></AuthProvider>);
    await waitFor(() => expect(state()).toBe('approved|false|yes'));
  });

  it('does not write profile state from a fetch that resolves after signOut (H7 epoch guard)', async () => {
    let resolveQ: (v: { data: unknown; error: unknown }) => void = () => {};
    maybeSingleImpl = () => new Promise((res) => { resolveQ = res; });

    render(<AuthProvider><Harness /></AuthProvider>);
    await waitFor(() => expect(authStateCb).not.toBeNull()); // boot fetch in flight

    fireEvent.click(screen.getByText('logout'));
    await waitFor(() => expect(signOutMock).toHaveBeenCalled());

    // The in-flight boot fetch now resolves with an approved profile — but the
    // session is gone, so the epoch guard must drop it.
    await act(async () => {
      resolveQ({ data: APPROVED, error: null });
      await Promise.resolve();
    });

    expect(state()).not.toContain('approved');
    expect(state().endsWith('|no')).toBe(true);
  });

  it('does not flash profileStatus="error" when a fetch starts during sign-out and fails before SIGNED_OUT lands (A1 race)', async () => {
    maybeSingleImpl = async () => ({ data: APPROVED, error: null });
    render(<AuthProvider><Harness /></AuthProvider>);
    await waitFor(() => expect(state()).toBe('approved|false|yes'));

    // Real signOut fires SIGNED_OUT only after a network round-trip; suppress it
    // so the epoch is bumped just once (by signOut) — the residual window.
    autoFireSignedOut = false;
    // A poll (e.g. PendingApprovalScreen) refetches mid-logout; the torn-down
    // session makes it fail. Without the signingOut guard this surfaces 'error'.
    let refreshCalls = 0;
    maybeSingleImpl = async () => { refreshCalls += 1; return { data: null, error: new Error('session gone') }; };

    fireEvent.click(screen.getByText('logout'));
    await waitFor(() => expect(signOutMock).toHaveBeenCalled());
    fireEvent.click(screen.getByText('refresh')); // refreshProfile() starts AFTER signOut

    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(refreshCalls).toBe(0); // guard dropped the fetch before it could query
    expect(state()).not.toContain('error');
  });

  it('retries a transient profile-fetch failure before surfacing an error (H8)', async () => {
    let calls = 0;
    maybeSingleImpl = async () => {
      calls += 1;
      if (calls < 3) return { data: null, error: new Error('transient') };
      return { data: APPROVED, error: null };
    };
    render(<AuthProvider><Harness /></AuthProvider>);
    await waitFor(() => expect(state()).toBe('approved|false|yes'), { timeout: 3000 });
    expect(calls).toBe(3);
  });

  it('computes the MFA gate on boot, not only at sign-in (C1)', async () => {
    // Bug: mfaPending was set only inside signIn, so an MFA user reached the
    // app at aal1 after a browser refresh / second tab / OAuth.
    maybeSingleImpl = async () => ({ data: APPROVED, error: null });
    needsMFAImpl = async () => true;
    render(<AuthProvider><Harness /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('mfa').textContent).toBe('true'));
  });

  it('clears the MFA gate on sign-out', async () => {
    maybeSingleImpl = async () => ({ data: APPROVED, error: null });
    needsMFAImpl = async () => true;
    render(<AuthProvider><Harness /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('mfa').textContent).toBe('true'));

    fireEvent.click(screen.getByText('logout'));
    await waitFor(() => expect(screen.getByTestId('mfa').textContent).toBe('false'));
  });

  it('clears the role-permission cache on sign-out (H6 — no cross-tenant bleed on next login)', async () => {
    maybeSingleImpl = async () => ({ data: APPROVED, error: null });
    render(<AuthProvider><Harness /></AuthProvider>);
    await waitFor(() => expect(state()).toBe('approved|false|yes'));

    fireEvent.click(screen.getByText('logout'));
    await waitFor(() => expect(clearPermissionCache).toHaveBeenCalled());
  });

  it('flags an expired session (not a manual logout) for the login page (H4)', async () => {
    localStorage.removeItem('auth_session_expired');
    maybeSingleImpl = async () => ({ data: APPROVED, error: null });
    render(<AuthProvider><Harness /></AuthProvider>);
    await waitFor(() => expect(state()).toBe('approved|false|yes'));

    // Token-expiry / revoked refresh: SIGNED_OUT arrives with no preceding
    // signOut() — leave a breadcrumb so the login page can explain it.
    await act(async () => {
      authStateCb?.('SIGNED_OUT', null);
      await Promise.resolve();
    });
    expect(localStorage.getItem('auth_session_expired')).toBe('1');
  });

  it('does not flag a manual logout as an expired session (H4)', async () => {
    localStorage.removeItem('auth_session_expired');
    maybeSingleImpl = async () => ({ data: APPROVED, error: null });
    render(<AuthProvider><Harness /></AuthProvider>);
    await waitFor(() => expect(state()).toBe('approved|false|yes'));

    fireEvent.click(screen.getByText('logout'));
    await waitFor(() => expect(signOutMock).toHaveBeenCalled());
    expect(localStorage.getItem('auth_session_expired')).toBeNull();
  });

  it('refreshProfile() still fetches while a boot fetch is in flight (L8)', async () => {
    let calls = 0;
    // First fetch hangs (stays in flight); later calls resolve immediately.
    maybeSingleImpl = () => {
      calls += 1;
      if (calls === 1) return new Promise(() => {});
      return Promise.resolve({ data: APPROVED, error: null });
    };
    render(<AuthProvider><Harness /></AuthProvider>);
    await waitFor(() => expect(calls).toBe(1)); // boot fetch in flight

    fireEvent.click(screen.getByText('refresh'));
    // Without the force bypass the in-flight dedupe would drop this and calls
    // would stay at 1.
    await waitFor(() => expect(calls).toBe(2));
  });

  it('stamps Sentry with the user on profile load and clears it on sign-out (M8)', async () => {
    maybeSingleImpl = async () => ({ data: APPROVED, error: null });
    render(<AuthProvider><Harness /></AuthProvider>);
    await waitFor(() => expect(setSentryUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1', tenant_id: 't1', role: 'admin' }),
    ));

    fireEvent.click(screen.getByText('logout'));
    await waitFor(() => expect(setSentryUser).toHaveBeenCalledWith(null));
  });
});

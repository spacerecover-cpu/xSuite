import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';

// Controllable supabase + service mocks so we can drive the auth lifecycle.
let authStateCb: ((event: string, session: unknown) => void) | null = null;
let maybeSingleImpl: () => Promise<{ data: unknown; error: unknown }> = async () => ({ data: null, error: null });
let needsMFAImpl: () => Promise<boolean> = async () => false;
const signOutMock = vi.fn(async () => {
  authStateCb?.('SIGNED_OUT', null);
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
vi.mock('../lib/logger', () => ({ logger: { error: vi.fn() } }));

const APPROVED = {
  id: 'u1', full_name: 'T', role: 'admin', is_active: true,
  password_reset_required: false, tenant_id: 't1',
};

function Harness() {
  const { profileStatus, loading, profile, mfaPending, signOut } = useAuth();
  return (
    <div>
      <span data-testid="state">{`${profileStatus}|${loading}|${profile ? 'yes' : 'no'}`}</span>
      <span data-testid="mfa">{String(mfaPending)}</span>
      <button onClick={() => void signOut()}>logout</button>
    </div>
  );
}

const state = () => screen.getByTestId('state').textContent ?? '';

describe('AuthContext', () => {
  beforeEach(() => {
    authStateCb = null;
    maybeSingleImpl = async () => ({ data: null, error: null });
    needsMFAImpl = async () => false;
    signOutMock.mockClear();
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
});

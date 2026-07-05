import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { authStorageAdapter, AUTH_STORAGE_KEY, hasStoredAuthSession, resetSessionPersistence } from '../lib/authStorage';
import { watchInactivity } from '../lib/inactivity';
import { mfaService } from '../lib/mfaService';
import { rolePermissionsService } from '../lib/rolePermissionsService';
import { logger, setSentryUser } from '../lib/logger';

interface Profile {
  id: string;
  full_name: string;
  role: 'owner' | 'admin' | 'manager' | 'technician' | 'sales' | 'accounts' | 'hr' | 'viewer' | null;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  last_login: string | null;
  password_reset_required: boolean;
  case_access_level: 'restricted' | 'full';
  tenant_id: string | null;
  sidebar_preferences?: {
    collapsed_sections?: string[];
  } | null;
}

export type ProfileStatus = 'loading' | 'pending_approval' | 'approved' | 'inactive' | 'error';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  profileStatus: ProfileStatus;
  passwordResetRequired: boolean;
  mfaPending: boolean;
  recoveryPending: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  completeMFAChallenge: () => void;
  completePasswordRecovery: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// A profile-fetch failure that means "the server rejects this session's
// token" (as opposed to a transient network/RLS hiccup). PostgREST answers
// JWT problems with 401 + code PGRST301. When sessionRecovery could not fix
// it with a forced refresh, the session is dead — retrying or showing the
// error card just strands the user on it until they clear site data.
const isAuthDeadError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; message?: unknown; status?: unknown };
  if (e.code === 'PGRST301') return true;
  if (e.status === 401) return true;
  return typeof e.message === 'string' && /\bJWT\b/.test(e.message);
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>('loading');
  const [passwordResetRequired, setPasswordResetRequired] = useState(false);
  const [mfaPending, setMfaPending] = useState(false);
  // Armed by the PASSWORD_RECOVERY auth event (email reset link). Persisted in
  // sessionStorage (tab-scoped) so a mid-flow refresh of /reset-password keeps
  // the guard — the event itself only fires once, on link consumption.
  const [recoveryPending, setRecoveryPending] = useState(
    () => sessionStorage.getItem('auth_password_recovery') === '1'
  );
  const profileCache = useRef<Profile | null>(null);
  const profileFetchInFlight = useRef<string | null>(null);
  // Bumped on every sign-out (manual or expiry). A profile fetch snapshots it
  // at start and bails before any setState if it changed mid-flight, so a fetch
  // that resolves after logout can't flash the Profile Error card or resurrect
  // a stale profile.
  const authEpoch = useRef(0);
  // Set by signOut() so the SIGNED_OUT handler can tell a deliberate logout
  // apart from a token-expiry / revoked-refresh eject (H4) and leave the login
  // page a breadcrumb to explain the latter.
  const userInitiatedSignOut = useRef(false);
  // True from the moment signOut() is called until the next session is
  // established. fetchProfile checks it at resolve time (not just the epoch it
  // snapshotted at start), so a fetch that *starts* during the teardown — e.g.
  // the PendingApprovalScreen poll — can't surface 'error' / clear loading in
  // the window before SIGNED_OUT lands, which is what still flashed the card.
  const signingOut = useRef(false);

  const performSignOut = useCallback(async (scope: 'global' | 'local') => {
    // Invalidate any in-flight profile fetch and show the auth skeleton until
    // the SIGNED_OUT event redirects. Clearing `profile` while `user` is still
    // set and `loading` is false is what flashed the Profile Error card.
    authEpoch.current++;
    userInitiatedSignOut.current = true;
    signingOut.current = true;
    setLoading(true);
    profileCache.current = null;
    setProfile(null);
    setProfileStatus('loading');
    setMfaPending(false);
    rolePermissionsService.clearCache();
    localStorage.removeItem('tenant_id');
    try {
      // signOut REPORTS failure via its return value (it does not throw), and
      // auth-js skips the local session removal when the /logout round-trip
      // fails on a network error — ignoring the result left the dead session
      // in storage with the UI half torn down. Fall back to a local-only
      // sign-out, and as a last resort clear the stored session by hand.
      let { error } = await supabase.auth.signOut({ scope });
      if (error && scope === 'global') {
        logger.error('Global sign out failed; retrying with local scope:', error);
        ({ error } = await supabase.auth.signOut({ scope: 'local' }));
      }
      if (error) {
        logger.error('Local sign out failed; clearing the stored session directly:', error);
        authStorageAdapter.removeItem(AUTH_STORAGE_KEY);
        window.location.replace('/login');
      }
    } catch (e) {
      logger.error('Sign out error:', e);
      authStorageAdapter.removeItem(AUTH_STORAGE_KEY);
      window.location.replace('/login');
    }
  }, []);

  const fetchProfile = useCallback(async (userId: string, force = false) => {
    // Boot fires this twice (getSession() resolution AND the INITIAL_SESSION
    // auth event); dedupe concurrent fetches for the same user. An explicit
    // refreshProfile() passes force to bypass the guard (L8) so a manual
    // refresh isn't silently dropped while a boot fetch is still in flight.
    if (!force && profileFetchInFlight.current === userId) return;
    profileFetchInFlight.current = userId;
    const epoch = authEpoch.current;
    // Stale if the auth identity changed (epoch) OR we've begun signing out —
    // the latter catches a fetch that started *after* signOut bumped the epoch
    // but before SIGNED_OUT bumps it again.
    const isStale = () => authEpoch.current !== epoch || signingOut.current;
    try {
      // Retry transient failures (network / RLS hiccup) before surfacing the
      // dead-end error screen — a single blip shouldn't strand the user.
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (isStale()) return;
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();
          if (error) throw error;
          if (isStale()) return;

          const profileData = data as unknown as Profile | null;
          profileCache.current = profileData;
          setProfile(profileData);
          setPasswordResetRequired(profileData?.password_reset_required || false);

          if (data?.tenant_id) {
            localStorage.setItem('tenant_id', data.tenant_id);
          } else {
            localStorage.removeItem('tenant_id');
          }

          if (!data) {
            setProfileStatus('error');
          } else if (data.role === null) {
            setProfileStatus('pending_approval');
          } else if (!data.is_active) {
            setProfileStatus('inactive');
          } else {
            setProfileStatus('approved');
          }
          return;
        } catch (err) {
          lastError = err;
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
          }
        }
      }
      if (isStale()) return;
      if (isAuthDeadError(lastError)) {
        // The server rejects this session's token and the sessionRecovery
        // fetch layer could not refresh it — the persisted session is dead.
        // Eject to the login page with the session-expired breadcrumb instead
        // of stranding the user on the Profile Error card with a session that
        // only clearing site data would remove.
        logger.error('Profile fetch failed with a dead session token; ejecting to login:', lastError);
        localStorage.setItem('auth_session_expired', '1');
        await performSignOut('local');
        return;
      }
      logger.error('Error fetching profile (after retries):', lastError);
      setProfileStatus('error');
    } finally {
      profileFetchInFlight.current = null;
      if (!isStale()) setLoading(false);
    }
  }, [performSignOut]);

  const checkMFAStatus = useCallback(async () => {
    // Recomputed on every session establishment (boot, sign-in, refresh) — not
    // only at sign-in — so an MFA-enrolled session can never reach the app at
    // aal1 via refresh, a second tab, or OAuth. Snapshot the epoch so a result
    // that lands after sign-out can't re-arm the gate. needsMFAVerification
    // fails closed (see mfaService).
    const epoch = authEpoch.current;
    const needsMFA = await mfaService.needsMFAVerification();
    if (authEpoch.current !== epoch) return;
    setMfaPending(needsMFA);
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        signingOut.current = false;
        fetchProfile(session.user.id);
        checkMFAStatus();
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        if (!mounted) return;
        // Ghost-session guard: GoTrue's BroadcastChannel forwards auth events
        // cross-tab WITH the session object. In sessionStorage ("don't
        // remember me") mode a second tab can't read that session from
        // storage — acting on the broadcast would unlock the UI while REST
        // calls fall back to the anon key and fail RLS. Locally-originated
        // events always pass (GoTrue saves before it notifies).
        if (session?.user && !hasStoredAuthSession()) return;
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          // A fresh/restored session — clear the signing-out guard so the next
          // login's profile fetch isn't dropped.
          signingOut.current = false;
          // Email reset link consumed: the session is real but exists only to
          // set a new password. ProtectedRoute bounces this tab to
          // /reset-password until completePasswordRecovery() clears the flag.
          if (event === 'PASSWORD_RECOVERY') {
            sessionStorage.setItem('auth_password_recovery', '1');
            setRecoveryPending(true);
          }
          // TOKEN_REFRESHED fires roughly hourly for the SAME user; re-fetching
          // the profile then produced a new profile identity and re-rendered
          // every consumer for no data change. All other events (sign-in, user
          // switch, USER_UPDATED) keep the existing refetch behaviour so role /
          // deactivation changes still propagate.
          const sameUser = profileCache.current?.id === session.user.id;
          if (!(event === 'TOKEN_REFRESHED' && sameUser)) {
            await fetchProfile(session.user.id);
          }
          // AAL can change on any of these events — notably TOKEN_REFRESHED,
          // which fires when an MFA verify upgrades the session to aal2 — so
          // recompute the gate on every session establishment, not just sign-in.
          await checkMFAStatus();
        } else {
          // Signed out (manual, expiry, or revoked refresh token). Invalidate
          // in-flight fetches and reset status so it isn't left stale at
          // 'error'/'loading' from the previous session.
          authEpoch.current++;
          setProfile(null);
          profileCache.current = null;
          setProfileStatus('loading');
          setMfaPending(false);
          // An abandoned recovery must not haunt the next login in this tab.
          sessionStorage.removeItem('auth_password_recovery');
          setRecoveryPending(false);
          // A SIGNED_OUT with no preceding signOut() is an expiry / revoked
          // refresh token, not a deliberate logout — flag it so the login page
          // shows "session expired" instead of a silent eject (H4). INITIAL_SESSION
          // with no user (cold boot) is not a sign-out, so scope to SIGNED_OUT.
          if (event === 'SIGNED_OUT' && !userInitiatedSignOut.current) {
            localStorage.setItem('auth_session_expired', '1');
          }
          userInitiatedSignOut.current = false;
          // Drop the previous user's role-permission cache + tenant pointer so a
          // different user on the same device can't inherit them (H6, L5).
          rolePermissionsService.clearCache();
          localStorage.removeItem('tenant_id');
          // Back to the default so out-of-band session creation (recovery
          // links, future OAuth) lands persistent unless the user opts out
          // again at the next sign-in.
          resetSessionPersistence();
          setLoading(false);
        }
      })().catch((e) => logger.error('Auth state change handler failed:', e));
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile, checkMFAStatus]);

  // M8: attach the signed-in user to telemetry so captured errors / RLS
  // denials carry id + tenant + role context; clear it on sign-out.
  useEffect(() => {
    if (user && profile) {
      setSentryUser({ id: user.id, email: user.email, tenant_id: profile.tenant_id, role: profile.role });
    } else if (!user) {
      setSentryUser(null);
    }
  }, [user, profile]);

  const refreshProfile = useCallback(async () => {
    if (user) {
      await fetchProfile(user.id, true);
    }
  }, [user, fetchProfile]);

  const completeMFAChallenge = useCallback(() => {
    setMfaPending(false);
  }, []);

  const completePasswordRecovery = useCallback(() => {
    sessionStorage.removeItem('auth_password_recovery');
    setRecoveryPending(false);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    await checkMFAStatus();
  }, [checkMFAStatus]);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(() => performSignOut('global'), [performSignOut]);

  // Auto sign-out after inactivity. Keyed on user?.id (not the user object) so
  // an hourly TOKEN_REFRESHED — which mints a new User identity for the same
  // person — doesn't reset the idle clock (L2). watchInactivity tracks
  // activity across ALL tabs (shared localStorage stamp) and sees inner-panel
  // scrolling / mouse movement, so a background tab can no longer sign out a
  // session the user is actively working in. The eject is LOCAL scope: one
  // idle browser must not revoke the user's sessions on every other device.
  useEffect(() => {
    if (!user?.id) return;

    return watchInactivity({
      limitMs: 30 * 60 * 1000,
      onIdle: () => {
        // Breadcrumb so the login page explains the eject instead of
        // silently dropping the user at a blank form.
        localStorage.setItem('auth_session_expired', '1');
        void performSignOut('local');
      },
    });
  }, [user?.id, performSignOut]);

  // Memoized so the context only changes when auth state actually changes —
  // 59 files consume useAuth(), so an unstable value re-renders most of the app.
  const value = useMemo(
    () => ({ user, profile, session, loading, profileStatus, passwordResetRequired, mfaPending, recoveryPending, signIn, signInWithGoogle, signUp, signOut, refreshProfile, completeMFAChallenge, completePasswordRecovery }),
    [user, profile, session, loading, profileStatus, passwordResetRequired, mfaPending, recoveryPending, signIn, signInWithGoogle, signUp, signOut, refreshProfile, completeMFAChallenge, completePasswordRecovery]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

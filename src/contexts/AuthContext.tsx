import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { mfaService } from '../lib/mfaService';
import { logger } from '../lib/logger';

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
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  completeMFAChallenge: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>('loading');
  const [passwordResetRequired, setPasswordResetRequired] = useState(false);
  const [mfaPending, setMfaPending] = useState(false);
  const profileCache = useRef<Profile | null>(null);
  const profileFetchInFlight = useRef<string | null>(null);
  // Bumped on every sign-out (manual or expiry). A profile fetch snapshots it
  // at start and bails before any setState if it changed mid-flight, so a fetch
  // that resolves after logout can't flash the Profile Error card or resurrect
  // a stale profile.
  const authEpoch = useRef(0);

  const fetchProfile = useCallback(async (userId: string) => {
    // Boot fires this twice (getSession() resolution AND the INITIAL_SESSION
    // auth event); dedupe concurrent fetches for the same user. Sequential
    // calls (refreshProfile) still go through.
    if (profileFetchInFlight.current === userId) return;
    profileFetchInFlight.current = userId;
    const epoch = authEpoch.current;
    const isStale = () => authEpoch.current !== epoch;
    try {
      // Retry transient failures (network / RLS hiccup) before surfacing the
      // dead-end error screen — a single blip shouldn't strand the user.
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 3; attempt++) {
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
      logger.error('Error fetching profile (after retries):', lastError);
      setProfileStatus('error');
    } finally {
      profileFetchInFlight.current = null;
      if (!isStale()) setLoading(false);
    }
  }, []);

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
        fetchProfile(session.user.id);
        checkMFAStatus();
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        if (!mounted) return;
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
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
          setLoading(false);
        }
      })();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile, checkMFAStatus]);

  useEffect(() => {
    if (!user) return;

    const INACTIVITY_LIMIT = 30 * 60 * 1000;
    const WARNING_BEFORE = 5 * 60 * 1000;
    let lastActivity = Date.now();
    let warningShown = false;

    const resetTimer = () => {
      lastActivity = Date.now();
      warningShown = false;
    };

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const;
    events.forEach(e => window.addEventListener(e, resetTimer));

    const interval = setInterval(() => {
      const idle = Date.now() - lastActivity;
      if (idle >= INACTIVITY_LIMIT) {
        clearInterval(interval);
        events.forEach(e => window.removeEventListener(e, resetTimer));
        signOut();
      } else if (idle >= INACTIVITY_LIMIT - WARNING_BEFORE && !warningShown) {
        warningShown = true;
      }
    }, 60_000);

    return () => {
      clearInterval(interval);
      events.forEach(e => window.removeEventListener(e, resetTimer));
    };
  }, [user]);

  const refreshProfile = useCallback(async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  }, [user, fetchProfile]);

  const completeMFAChallenge = useCallback(() => {
    setMfaPending(false);
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

  const signOut = useCallback(async () => {
    // Invalidate any in-flight profile fetch and show the auth skeleton until
    // the SIGNED_OUT event redirects. Clearing `profile` while `user` is still
    // set and `loading` is false is what flashed the Profile Error card.
    authEpoch.current++;
    setLoading(true);
    profileCache.current = null;
    setProfile(null);
    setProfileStatus('loading');
    setMfaPending(false);
    localStorage.removeItem('tenant_id');
    try {
      await supabase.auth.signOut();
    } catch (e) {
      logger.error('Sign out error:', e);
      setLoading(false);
    }
  }, []);

  // Memoized so the context only changes when auth state actually changes —
  // 59 files consume useAuth(), so an unstable value re-renders most of the app.
  const value = useMemo(
    () => ({ user, profile, session, loading, profileStatus, passwordResetRequired, mfaPending, signIn, signInWithGoogle, signUp, signOut, refreshProfile, completeMFAChallenge }),
    [user, profile, session, loading, profileStatus, passwordResetRequired, mfaPending, signIn, signInWithGoogle, signUp, signOut, refreshProfile, completeMFAChallenge]
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

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
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

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;

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
    } catch (error) {
      logger.error('Error fetching profile:', error);
      setProfileStatus('error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        if (!mounted) return;
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchProfile(session.user.id);
        } else {
          setProfile(null);
          profileCache.current = null;
          setLoading(false);
        }
      })();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

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

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  const checkMFAStatus = useCallback(async () => {
    try {
      const needsMFA = await mfaService.needsMFAVerification();
      setMfaPending(needsMFA);
    } catch {
      setMfaPending(false);
    }
  }, []);

  const completeMFAChallenge = useCallback(() => {
    setMfaPending(false);
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    await checkMFAStatus();
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, fullName: string) => {
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
  };

  const signOut = async () => {
    profileCache.current = null;
    setProfile(null);
    setProfileStatus('loading');
    localStorage.removeItem('tenant_id');
    try {
      await supabase.auth.signOut();
    } catch (e) {
      logger.error('Sign out error:', e);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, session, loading, profileStatus, passwordResetRequired, mfaPending, signIn, signInWithGoogle, signUp, signOut, refreshProfile, completeMFAChallenge }}>
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

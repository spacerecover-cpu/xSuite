import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { checkRateLimit, RATE_LIMITS } from '../lib/rateLimiter';
import { getPortalSettings } from '../lib/portalUrlService';
import { logger } from '../lib/logger';

interface PortalCustomer {
  id: string;
  tenant_id: string;
  customer_number: string;
  customer_name: string;
  email: string | null;
  mobile_number: string | null;
  profile_photo_url: string | null;
  // Q3 per-recipient comms language (returned by authenticate_portal_customer).
  // Optional for back-compat with sessions stored before this field existed.
  preferred_language?: string | null;
}

interface PortalSession {
  customer: PortalCustomer;
  last_activity_at: number;
}

interface PortalAuthContextType {
  customer: PortalCustomer | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
}

const PortalAuthContext = createContext<PortalAuthContextType | undefined>(undefined);

const SESSION_STORAGE_KEY = 'portal_session';
// Default timeout used when portal_settings is unreachable. In minutes.
const DEFAULT_TIMEOUT_MINUTES = 1440;

export const usePortalAuth = () => {
  const context = useContext(PortalAuthContext);
  if (!context) {
    throw new Error('usePortalAuth must be used within a PortalAuthProvider');
  }
  return context;
};

function isValidPortalCustomer(data: unknown): data is PortalCustomer {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.tenant_id === 'string' &&
    typeof obj.customer_number === 'string' &&
    typeof obj.customer_name === 'string' &&
    (obj.email === null || typeof obj.email === 'string') &&
    (obj.mobile_number === null || typeof obj.mobile_number === 'string') &&
    (obj.profile_photo_url === null || typeof obj.profile_photo_url === 'string') &&
    (obj.preferred_language === undefined ||
      obj.preferred_language === null ||
      typeof obj.preferred_language === 'string')
  );
}

function readSession(): PortalSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.last_activity_at === 'number' &&
      isValidPortalCustomer(parsed.customer)
    ) {
      return parsed as PortalSession;
    }
    return null;
  } catch {
    return null;
  }
}

function writeSession(session: PortalSession): void {
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function clearSession(): void {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

// Read tenant_id directly from sessionStorage without subscribing to context.
// Used by other providers (ThemeContext, TenantConfigContext) that mount above
// PortalAuthProvider and therefore cannot use the hook.
export function getPortalTenantIdFromSession(): string | null {
  const session = readSession();
  return session?.customer.tenant_id ?? null;
}

export const PortalAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [customer, setCustomer] = useState<PortalCustomer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeoutMinutes, setTimeoutMinutes] = useState<number>(DEFAULT_TIMEOUT_MINUTES);
  const location = useLocation();

  // Resolve session-timeout from tenant portal settings; refreshed when login
  // happens. getPortalSettings has its own 5-minute cache.
  const refreshTimeout = useCallback(async () => {
    try {
      const settings = await getPortalSettings();
      const minutes = settings?.portal_session_timeout;
      if (typeof minutes === 'number' && minutes > 0) {
        setTimeoutMinutes(minutes);
      } else {
        setTimeoutMinutes(DEFAULT_TIMEOUT_MINUTES);
      }
    } catch (err) {
      logger.error('Failed to load portal session timeout setting:', err);
      setTimeoutMinutes(DEFAULT_TIMEOUT_MINUTES);
    }
  }, []);

  useEffect(() => {
    const session = readSession();
    if (session) {
      const ageMs = Date.now() - session.last_activity_at;
      // Initial check uses default; refreshTimeout will recheck after settings load.
      if (ageMs > DEFAULT_TIMEOUT_MINUTES * 60_000) {
        clearSession();
      } else {
        setCustomer(session.customer);
      }
    }
    refreshTimeout().finally(() => setLoading(false));
  }, [refreshTimeout]);

  // On every route change, validate the timeout and refresh last_activity_at.
  useEffect(() => {
    if (!customer) return;
    const session = readSession();
    if (!session) {
      setCustomer(null);
      return;
    }
    const ageMs = Date.now() - session.last_activity_at;
    const limitMs = timeoutMinutes * 60_000;
    if (ageMs > limitMs) {
      clearSession();
      setCustomer(null);
      setError('Your session has expired. Please log in again.');
      return;
    }
    writeSession({ ...session, last_activity_at: Date.now() });
    // intentionally only on pathname change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const login = async (email: string, password: string): Promise<boolean> => {
    setLoading(true);
    setError(null);

    // Client-side rate limit (in addition to DB-side lockout).
    const rl = checkRateLimit({ ...RATE_LIMITS.PORTAL_LOGIN, key: `portal_login:${email}` });
    if (!rl.allowed) {
      setError(rl.message);
      setLoading(false);
      return false;
    }

    try {
      const { data, error: rpcError } = await supabase.rpc('authenticate_portal_customer', {
        p_email: email,
        p_password: password,
      });

      if (rpcError || !data) {
        // DB returns NULL when password is wrong, account locked, or account
        // missing. We cannot distinguish without leaking info; show generic.
        if (rpcError) logger.error('Authentication error:', rpcError);
        setError('Invalid email or password. After several failed attempts, the account will be locked for 15 minutes.');
        return false;
      }

      if (!isValidPortalCustomer(data)) {
        logger.error('authenticate_portal_customer returned malformed data');
        setError('Login failed. Please contact support.');
        return false;
      }

      // Server-side gate: a tenant can disable the Customer Portal entirely. Only an
      // explicit `false` denies — a missing key / errored check fails open so a
      // transient issue never locks customers out.
      const { data: portalOn } = await supabase.rpc('tenant_feature_enabled', {
        p_tenant_id: data.tenant_id,
        p_key: 'portal.customer',
      });
      if (portalOn === false) {
        setError('The customer portal is not available for this account. Please contact us directly.');
        return false;
      }

      const session: PortalSession = {
        customer: data,
        last_activity_at: Date.now(),
      };
      writeSession(session);
      setCustomer(data);
      setError(null);
      // Refresh session-timeout in case settings changed.
      void refreshTimeout();
      return true;
    } catch (err) {
      logger.error('Login error:', err);
      setError('Failed to login. Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string): Promise<boolean> => {
    if (!customer?.id) {
      setError('Not authenticated');
      return false;
    }

    try {
      const { data, error: rpcError } = await supabase.rpc('change_portal_password', {
        p_customer_id: customer.id,
        p_current_password: currentPassword,
        p_new_password: newPassword,
      });

      if (rpcError) {
        logger.error('Password change error:', rpcError);
        setError('Failed to change password');
        return false;
      }

      if (!data) {
        setError('Current password is incorrect');
        return false;
      }

      return true;
    } catch (err) {
      logger.error('Password change error:', err);
      setError('Failed to change password');
      return false;
    }
  };

  const logout = () => {
    clearSession();
    setCustomer(null);
    setError(null);
  };

  return (
    <PortalAuthContext.Provider value={{ customer, loading, error, login, logout, changePassword }}>
      {children}
    </PortalAuthContext.Provider>
  );
};

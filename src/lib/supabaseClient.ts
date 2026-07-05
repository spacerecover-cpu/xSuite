import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.types';
import { authStorageAdapter, AUTH_STORAGE_KEY } from './authStorage';
import { bindSessionRecoveryClient, createSessionRecoveryFetch } from './sessionRecovery';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Connection pooling is managed by Supabase infrastructure (PgBouncer in transaction mode).
// The REST API (PostgREST) and Realtime connections are automatically pooled.
// Edge functions use per-request clients with persistSession: false (stateless, no pool leaks).
// For direct Postgres connections (e.g., migrations), use the pooler connection string
// from Supabase Dashboard > Settings > Database > Connection Pooling.
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    // Real "Remember me": sessions route to localStorage (persist) or
    // sessionStorage (die with the browser) per the user's login choice.
    // storageKey matches supabase-js's own default so pre-existing sessions
    // keep working. See src/lib/authStorage.ts.
    storage: authStorageAdapter,
    storageKey: AUTH_STORAGE_KEY,
  },
  db: {
    schema: 'public',
  },
  global: {
    headers: {
      'X-Client-Info': 'xsuite-web',
    },
    // Self-heals server-rejected JWTs (401 → forced refresh → one retry) so a
    // dead persisted session can never strand the app in a permanent 401 loop.
    // See src/lib/sessionRecovery.ts.
    fetch: createSessionRecoveryFetch(supabaseAnonKey),
  },
});

bindSessionRecoveryClient(supabase);

export const getTenantId = (): string | null => {
  return localStorage.getItem('tenant_id');
};

export const setTenantId = (tenantId: string | null): void => {
  if (tenantId) {
    localStorage.setItem('tenant_id', tenantId);
  } else {
    localStorage.removeItem('tenant_id');
  }
};

export const clearTenantId = (): void => {
  localStorage.removeItem('tenant_id');
};

/**
 * Canonical async resolver for the current tenant id. Prefers the value mirrored
 * into localStorage by AuthContext on sign-in, falling back to the
 * get_current_tenant_id() RPC. Throws if no tenant can be resolved. Tenant-scoped
 * inserts are stamped server-side by the set_*_tenant_and_audit trigger regardless,
 * so this value is for client convenience, not the source of isolation.
 */
export const resolveTenantId = async (): Promise<string> => {
  const cached = getTenantId();
  if (cached) return cached;
  const { data, error } = await supabase.rpc('get_current_tenant_id');
  if (error || !data) throw new Error('Unable to resolve current tenant');
  setTenantId(data);
  return data;
};

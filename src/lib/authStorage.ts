// Real "Remember me": a Supabase auth-storage adapter that routes the session
// between localStorage (persists across browser restarts) and sessionStorage
// (dies with the browser/tab) based on a preference flag written by the login
// form BEFORE signInWithPassword. supabase-js accepts a plain synchronous
// storage object (SupportedStorage allows sync or promised methods) and reads
// it lazily per call, so a flag written just before sign-in governs where that
// session lands. The adapter routes ALL auth keys generically — GoTrue writes
// the session key plus `<key>-code-verifier` and `<key>-user` variants.
//
// Non-browser environments (node tests, SSR) have no Web Storage — fall back
// to an in-memory map, mirroring GoTrue's own built-in resilience.

/** Preference flag. Always lives in localStorage; '1' (default) = persist. */
export const PERSIST_FLAG = 'xsuite_auth_persist';

/**
 * Derived exactly like supabase-js does internally
 * (`sb-${new URL(url).hostname.split('.')[0]}-auth-token`) and passed
 * explicitly as `auth.storageKey` — identical value to today's default, so
 * existing sessions survive this deploy with zero logouts.
 */
export const AUTH_STORAGE_KEY = (() => {
  try {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    if (!url) return 'sb-auth-token';
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  } catch {
    return 'sb-auth-token';
  }
})();

const memory = new Map<string, string>();

const localStore = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

const sessionStore = (): Storage | null => {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
};

const safeGet = (store: Storage | null, key: string): string | null => {
  try {
    return store ? store.getItem(key) : null;
  } catch {
    return null;
  }
};

const safeSet = (store: Storage | null, key: string, value: string): boolean => {
  try {
    if (!store) return false;
    store.setItem(key, value);
    return true;
  } catch {
    return false; // storage unavailable (private mode / quota)
  }
};

const safeRemove = (store: Storage | null, key: string): void => {
  try {
    store?.removeItem(key);
  } catch {
    /* ignore */
  }
};

export const shouldPersistSession = (): boolean =>
  (safeGet(localStore(), PERSIST_FLAG) ?? memory.get(PERSIST_FLAG)) !== '0';

export const setSessionPersistence = (persist: boolean): void => {
  const value = persist ? '1' : '0';
  if (!safeSet(localStore(), PERSIST_FLAG, value)) memory.set(PERSIST_FLAG, value);
};

export const resetSessionPersistence = (): void => {
  setSessionPersistence(true);
};

/**
 * Synchronous storage adapter for `createClient({ auth: { storage } })`.
 * setItem writes to the chosen store AND evicts the other, so flipping the
 * choice can never leave a stale copy that resurrects the session. getItem
 * checks localStorage first (pre-deploy sessions live there), then
 * sessionStorage. removeItem clears everything (sign-out must be total).
 */
export const authStorageAdapter = {
  getItem: (key: string): string | null =>
    safeGet(localStore(), key) ?? safeGet(sessionStore(), key) ?? memory.get(key) ?? null,
  setItem: (key: string, value: string): void => {
    const persisted = shouldPersistSession()
      ? safeSet(localStore(), key, value) && (safeRemove(sessionStore(), key), true)
      : safeSet(sessionStore(), key, value) && (safeRemove(localStore(), key), true);
    if (!persisted) memory.set(key, value);
  },
  removeItem: (key: string): void => {
    safeRemove(localStore(), key);
    safeRemove(sessionStore(), key);
    memory.delete(key);
  },
};

/**
 * True when THIS tab can actually read a stored auth session. Guards against
 * GoTrue's cross-tab BroadcastChannel: in sessionStorage mode another tab's
 * SIGNED_IN broadcast carries a session object this tab cannot read from
 * storage — acting on it would "unlock" the UI while REST calls fall back to
 * the anon key and fail RLS.
 */
export const hasStoredAuthSession = (): boolean =>
  authStorageAdapter.getItem(AUTH_STORAGE_KEY) !== null;

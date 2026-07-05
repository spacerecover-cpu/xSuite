// Self-healing for server-rejected JWTs. supabase-js decides whether a stored
// access token is still valid using ONLY the local clock (auth-js
// __loadSession compares expires_at against Date.now()) and never reacts to a
// PostgREST/Storage/Functions 401. So any session the SERVER rejects — skewed
// device clock, refresh-token family revoked from another device, rotated
// signing keys — is served on every request, across every reload, forever:
// the app dies in a permanent 401 loop that only clearing site data fixes.
//
// This wrapper is installed as `global.fetch` on the Supabase client. On a
// 401 that carried a real user token, it forces a server-validated
// refreshSession() (single-flight; auth-js also dedupes via its own
// refreshingDeferred) and retries the request once with the fresh token. If
// the refresh fails non-retryably, auth-js itself removes the session and
// fires SIGNED_OUT, which AuthContext turns into a clean "session expired"
// login redirect — the one recovery path that previously did not exist.
//
// supabase-js passes `global.fetch` RAW to GoTrueClient too, so auth endpoint
// calls flow through here — they are excluded by URL to avoid recursing a
// refresh into itself.

import { hasStoredAuthSession } from './authStorage';
import { logger } from './logger';

export interface SessionRecoveryAuthClient {
  auth: {
    refreshSession: () => Promise<{
      data: { session: { access_token: string } | null };
      error: { name: string; message: string } | null;
    }>;
  };
}

let client: SessionRecoveryAuthClient | null = null;

/** Late binding: the client needs this fetch at construction time. */
export const bindSessionRecoveryClient = (c: SessionRecoveryAuthClient): void => {
  client = c;
};

let refreshInFlight: Promise<string | null> | null = null;

/**
 * Force a server-validated token rotation, deduped so a burst of 401s (every
 * query on a page load) triggers exactly one refresh. Resolves to the fresh
 * access token, or null when the refresh failed — in the non-retryable case
 * auth-js has already removed the session and emitted SIGNED_OUT.
 */
const forceRefresh = (): Promise<string | null> => {
  if (!client) return Promise.resolve(null);
  if (!refreshInFlight) {
    refreshInFlight = client.auth
      .refreshSession()
      .then(({ data, error }) => {
        if (error || !data.session) {
          logger.error('Session recovery: forced refresh failed', error);
          return null;
        }
        return data.session.access_token;
      })
      .catch((e) => {
        logger.error('Session recovery: forced refresh threw', e);
        return null;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
};

const requestUrl = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
};

const sentBearerToken = (input: RequestInfo | URL, init?: RequestInit): string | null => {
  const fromInit = new Headers(init?.headers).get('Authorization');
  const header =
    fromInit ?? (input instanceof Request ? input.headers.get('Authorization') : null);
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : null;
};

/**
 * Build the `global.fetch` for createClient. `rawFetch` is injectable for
 * tests; production resolves the ambient fetch lazily per call.
 */
export const createSessionRecoveryFetch = (
  anonKey: string,
  rawFetch?: typeof fetch
): typeof fetch => {
  const doFetch: typeof fetch = (...args) =>
    rawFetch ? rawFetch(...args) : fetch(...args);

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const response = await doFetch(input, init);
    if (response.status !== 401) return response;

    // Auth endpoints answer 401/400 as part of their own protocol; recovering
    // there would recurse the refresh into itself.
    if (requestUrl(input).includes('/auth/v1/')) return response;

    // Only recover requests that actually carried a user session token. A 401
    // on an anon-key request (bad apikey, misconfig) cannot be fixed by a
    // refresh, and a logged-out tab has nothing to refresh.
    const sentToken = sentBearerToken(input, init);
    if (!sentToken || sentToken === anonKey) return response;
    if (!hasStoredAuthSession()) return response;

    const freshToken = await forceRefresh();
    // No fresh token: auth-js already ejected (non-retryable) or the refresh
    // endpoint is unreachable (retryable) — surface the original 401 either way.
    if (!freshToken || freshToken === sentToken) return response;

    logger.warn(
      'Session recovery: server rejected a locally-valid access token; retried with a refreshed token',
      { url: requestUrl(input) }
    );

    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${freshToken}`);
    return doFetch(input, { ...init, headers });
  };
};

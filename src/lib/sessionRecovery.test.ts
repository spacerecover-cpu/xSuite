// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createSessionRecoveryFetch,
  bindSessionRecoveryClient,
  type SessionRecoveryAuthClient,
} from './sessionRecovery';
import { AUTH_STORAGE_KEY } from './authStorage';

const ANON_KEY = 'anon-key';
const REST_URL = 'https://proj.supabase.co/rest/v1/profiles?select=*';
const AUTH_URL = 'https://proj.supabase.co/auth/v1/token?grant_type=refresh_token';

const jsonResponse = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status });

const bearerInit = (token: string): RequestInit => ({
  method: 'GET',
  headers: new Headers({ apikey: ANON_KEY, Authorization: `Bearer ${token}` }),
});

const storeSession = () => {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ access_token: 'stale' }));
};

const makeAuth = (
  refreshImpl: () => Promise<{
    data: { session: { access_token: string } | null };
    error: { name: string; message: string } | null;
  }>
): SessionRecoveryAuthClient => ({
  auth: { refreshSession: vi.fn(refreshImpl) },
});

const refreshedOk = (token = 'fresh-token') =>
  makeAuth(async () => ({ data: { session: { access_token: token } }, error: null }));

describe('createSessionRecoveryFetch', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('passes non-401 responses through without touching auth', async () => {
    const client = refreshedOk();
    bindSessionRecoveryClient(client);
    const raw = vi.fn(async () => jsonResponse(200, [{ id: 1 }]));
    const fetchWithRecovery = createSessionRecoveryFetch(ANON_KEY, raw);

    const res = await fetchWithRecovery(REST_URL, bearerInit('user-jwt'));

    expect(res.status).toBe(200);
    expect(raw).toHaveBeenCalledTimes(1);
    expect(client.auth.refreshSession).not.toHaveBeenCalled();
  });

  it('on a 401 with a user token and a stored session: refreshes, retries once with the new token, returns the retry', async () => {
    storeSession();
    const client = refreshedOk('fresh-token');
    bindSessionRecoveryClient(client);
    const raw = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const auth = new Headers(init?.headers).get('Authorization');
      return auth === 'Bearer fresh-token'
        ? jsonResponse(200, [{ id: 1 }])
        : jsonResponse(401, { code: 'PGRST301', message: 'JWT expired' });
    });
    const fetchWithRecovery = createSessionRecoveryFetch(ANON_KEY, raw);

    const res = await fetchWithRecovery(REST_URL, bearerInit('expired-jwt'));

    expect(res.status).toBe(200);
    expect(client.auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(raw).toHaveBeenCalledTimes(2);
    const retryHeaders = new Headers((raw.mock.calls[1][1] as RequestInit).headers);
    expect(retryHeaders.get('Authorization')).toBe('Bearer fresh-token');
    // apikey must survive the header rewrite
    expect(retryHeaders.get('apikey')).toBe(ANON_KEY);
  });

  it('deduplicates concurrent 401 recoveries into a single refreshSession call', async () => {
    storeSession();
    let resolveRefresh!: (v: {
      data: { session: { access_token: string } | null };
      error: null;
    }) => void;
    const client = makeAuth(
      () => new Promise((resolve) => { resolveRefresh = resolve; })
    );
    bindSessionRecoveryClient(client);
    const raw = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const auth = new Headers(init?.headers).get('Authorization');
      return auth === 'Bearer fresh-token' ? jsonResponse(200) : jsonResponse(401);
    });
    const fetchWithRecovery = createSessionRecoveryFetch(ANON_KEY, raw);

    const p1 = fetchWithRecovery(REST_URL, bearerInit('expired-jwt'));
    const p2 = fetchWithRecovery(REST_URL, bearerInit('expired-jwt'));
    await Promise.resolve();
    resolveRefresh({ data: { session: { access_token: 'fresh-token' } }, error: null });
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(client.auth.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('never intercepts auth endpoint calls (no recursion into /auth/v1/)', async () => {
    storeSession();
    const client = refreshedOk();
    bindSessionRecoveryClient(client);
    const raw = vi.fn(async () => jsonResponse(401, { error: 'invalid_grant' }));
    const fetchWithRecovery = createSessionRecoveryFetch(ANON_KEY, raw);

    const res = await fetchWithRecovery(AUTH_URL, { method: 'POST' });

    expect(res.status).toBe(401);
    expect(raw).toHaveBeenCalledTimes(1);
    expect(client.auth.refreshSession).not.toHaveBeenCalled();
  });

  it('does not attempt recovery for anon-key-only requests', async () => {
    storeSession();
    const client = refreshedOk();
    bindSessionRecoveryClient(client);
    const raw = vi.fn(async () => jsonResponse(401));
    const fetchWithRecovery = createSessionRecoveryFetch(ANON_KEY, raw);

    const res = await fetchWithRecovery(REST_URL, bearerInit(ANON_KEY));

    expect(res.status).toBe(401);
    expect(raw).toHaveBeenCalledTimes(1);
    expect(client.auth.refreshSession).not.toHaveBeenCalled();
  });

  it('does not attempt recovery when no session is stored (logged-out tab)', async () => {
    const client = refreshedOk();
    bindSessionRecoveryClient(client);
    const raw = vi.fn(async () => jsonResponse(401));
    const fetchWithRecovery = createSessionRecoveryFetch(ANON_KEY, raw);

    const res = await fetchWithRecovery(REST_URL, bearerInit('user-jwt'));

    expect(res.status).toBe(401);
    expect(client.auth.refreshSession).not.toHaveBeenCalled();
  });

  it('returns the original 401 when the refresh fails (auth-js handles the eject)', async () => {
    storeSession();
    const client = makeAuth(async () => ({
      data: { session: null },
      error: { name: 'AuthApiError', message: 'Invalid Refresh Token: Already Used' },
    }));
    bindSessionRecoveryClient(client);
    const raw = vi.fn(async () => jsonResponse(401, { code: 'PGRST301' }));
    const fetchWithRecovery = createSessionRecoveryFetch(ANON_KEY, raw);

    const res = await fetchWithRecovery(REST_URL, bearerInit('expired-jwt'));

    expect(res.status).toBe(401);
    expect(client.auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(raw).toHaveBeenCalledTimes(1); // no retry without a fresh token
  });

  it('retries at most once per request even if the retry also 401s', async () => {
    storeSession();
    const client = refreshedOk('fresh-token');
    bindSessionRecoveryClient(client);
    const raw = vi.fn(async () => jsonResponse(401));
    const fetchWithRecovery = createSessionRecoveryFetch(ANON_KEY, raw);

    const res = await fetchWithRecovery(REST_URL, bearerInit('expired-jwt'));

    expect(res.status).toBe(401);
    expect(raw).toHaveBeenCalledTimes(2);
    expect(client.auth.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('skips the retry when the refreshed token is the one the request already sent', async () => {
    storeSession();
    const client = refreshedOk('same-token');
    bindSessionRecoveryClient(client);
    const raw = vi.fn(async () => jsonResponse(401));
    const fetchWithRecovery = createSessionRecoveryFetch(ANON_KEY, raw);

    const res = await fetchWithRecovery(REST_URL, bearerInit('same-token'));

    expect(res.status).toBe(401);
    expect(raw).toHaveBeenCalledTimes(1);
  });

  it('survives refreshSession throwing (returns the original 401)', async () => {
    storeSession();
    const client = makeAuth(async () => {
      throw new Error('lock timeout');
    });
    bindSessionRecoveryClient(client);
    const raw = vi.fn(async () => jsonResponse(401));
    const fetchWithRecovery = createSessionRecoveryFetch(ANON_KEY, raw);

    const res = await fetchWithRecovery(REST_URL, bearerInit('expired-jwt'));

    expect(res.status).toBe(401);
    expect(raw).toHaveBeenCalledTimes(1);
  });
});

// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  authStorageAdapter,
  hasStoredAuthSession,
  setSessionPersistence,
  resetSessionPersistence,
  shouldPersistSession,
  AUTH_STORAGE_KEY,
  PERSIST_FLAG,
} from './authStorage';

const KEY = AUTH_STORAGE_KEY;

describe('authStorage adapter', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('defaults to persistent (localStorage) when the flag was never set', () => {
    expect(shouldPersistSession()).toBe(true);
    authStorageAdapter.setItem(KEY, 'session-a');
    expect(localStorage.getItem(KEY)).toBe('session-a');
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('routes to sessionStorage when persistence is off, evicting any localStorage copy', () => {
    localStorage.setItem(KEY, 'old-persistent-session');
    setSessionPersistence(false);
    authStorageAdapter.setItem(KEY, 'session-b');
    expect(sessionStorage.getItem(KEY)).toBe('session-b');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('flipping back to persistent evicts the sessionStorage copy', () => {
    setSessionPersistence(false);
    authStorageAdapter.setItem(KEY, 'session-c');
    setSessionPersistence(true);
    authStorageAdapter.setItem(KEY, 'session-d');
    expect(localStorage.getItem(KEY)).toBe('session-d');
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('getItem prefers localStorage (pre-deploy sessions) then falls back to sessionStorage', () => {
    sessionStorage.setItem(KEY, 'tab-scoped');
    expect(authStorageAdapter.getItem(KEY)).toBe('tab-scoped');
    localStorage.setItem(KEY, 'persistent');
    expect(authStorageAdapter.getItem(KEY)).toBe('persistent');
  });

  it('removeItem clears both stores (sign-out must be total)', () => {
    localStorage.setItem(KEY, 'a');
    sessionStorage.setItem(KEY, 'b');
    authStorageAdapter.removeItem(KEY);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('routes suffixed auth keys (-code-verifier, -user) identically', () => {
    setSessionPersistence(false);
    authStorageAdapter.setItem(`${KEY}-code-verifier`, 'pkce');
    authStorageAdapter.setItem(`${KEY}-user`, 'cached-user');
    expect(sessionStorage.getItem(`${KEY}-code-verifier`)).toBe('pkce');
    expect(sessionStorage.getItem(`${KEY}-user`)).toBe('cached-user');
    expect(localStorage.getItem(`${KEY}-code-verifier`)).toBeNull();
  });

  it('hasStoredAuthSession reflects both modes', () => {
    expect(hasStoredAuthSession()).toBe(false);
    localStorage.setItem(KEY, 's');
    expect(hasStoredAuthSession()).toBe(true);
    localStorage.removeItem(KEY);
    sessionStorage.setItem(KEY, 's');
    expect(hasStoredAuthSession()).toBe(true);
  });

  it('resetSessionPersistence restores the persistent default', () => {
    setSessionPersistence(false);
    expect(localStorage.getItem(PERSIST_FLAG)).toBe('0');
    resetSessionPersistence();
    expect(shouldPersistSession()).toBe(true);
  });
});

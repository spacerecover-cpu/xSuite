import { lazy } from 'react';
import type React from 'react';
import { logger } from './logger';
import { isChunkLoadError } from './chunkError';

// Shared by both helpers below. On a stale-deploy chunk failure, reload once
// (throttled) to pull the fresh index.html + hashes; otherwise rethrow so the
// nearest error boundary / route errorElement handles it. Returning the
// never-resolving promise keeps Suspense (or the router navigation) pending
// across the reload instead of flashing an error screen.
function recoverChunkError<T>(error: unknown, context: string): Promise<T> {
  if (isChunkLoadError(error)) {
    const key = 'chunk_reload_at';
    const last = Number(sessionStorage.getItem(key) || 0);
    const now = Date.now();
    // Throttle to once per 20s so a genuinely broken deploy can't trap the
    // user in a reload loop; after that we fall through to the ErrorBoundary,
    // which shows a clear "new version available" recovery screen.
    if (now - last > 20000) {
      sessionStorage.setItem(key, String(now));
      window.location.reload();
      return new Promise<T>(() => {});
    }
  }
  logger.error(`Failed to load ${context}`, error);
  throw error;
}

/**
 * React.lazy with stale-deploy recovery, for in-page split points
 * (e.g. CaseDetail tabs).
 *
 * A failed dynamic import is almost always a stale chunk after a new deploy:
 * the running tab references a content hash that no longer exists on the
 * server. The no-store header on index.html (public/_headers) guarantees the
 * recovery reload isn't served from a stale edge/browser cache.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(() =>
    factory().catch((error: unknown) => recoverChunkError<{ default: T }>(error, 'chunk'))
  );
}

/**
 * Route-level `lazy` with the same stale-deploy recovery, for the data router
 * (App.tsx). The router resolves this DURING navigation, so the previous page
 * stays interactive and useNavigation() reports 'loading' while the chunk
 * downloads — that state drives NavigationProgress and the sidebar pending
 * indicators.
 */
export function lazyRouteWithRetry<M extends Record<string, unknown>>(
  factory: () => Promise<M>,
  exportName: keyof M & string
) {
  return async (): Promise<{ Component: React.ComponentType }> => {
    try {
      const m = await factory();
      return { Component: m[exportName] as React.ComponentType };
    } catch (error) {
      return recoverChunkError<{ Component: React.ComponentType }>(error, `route module (${exportName})`);
    }
  };
}

import { lazy } from 'react';
import type React from 'react';
import { logger } from './logger';
import { isChunkLoadError } from './chunkError';

/**
 * React.lazy with stale-deploy recovery, shared by route-level chunks (App.tsx)
 * and in-page split points (e.g. CaseDetail tabs).
 *
 * A failed dynamic import is almost always a stale chunk after a new deploy:
 * the running tab references a content hash that no longer exists on the
 * server. Reload once to pull the fresh index.html + new hashes. The no-store
 * header on index.html (public/_headers) guarantees the reload itself isn't
 * served from a stale edge/browser cache.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(() =>
    factory().catch((error: unknown) => {
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
          // Keep Suspense pending across the reload instead of flashing the
          // error boundary with a transient import failure.
          return new Promise<{ default: T }>(() => {});
        }
      }
      logger.error('Failed to load chunk', error);
      throw error;
    })
  );
}

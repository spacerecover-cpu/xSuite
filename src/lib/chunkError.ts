// Detects failures to load a lazily-imported route chunk. After a new deploy,
// Vite emits new content-hashed chunk filenames; a tab still running the old
// build requests a hash that no longer exists, so the dynamic import() rejects
// (404, or an HTML SPA-fallback served with the wrong MIME type). The message
// wording differs per browser, so match all known variants.
//
// Used by the lazy-route retry wrapper (App.tsx), the global rejection handlers
// (main.tsx), and the ErrorBoundary so a stale-deploy failure is recovered with
// a reload and tagged distinctly in telemetry instead of surfacing as a cryptic
// runtime error.
export function isChunkLoadError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === 'string'
        ? error
        : '';

  if (!message) return false;

  return (
    /failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /importing a module script failed/i.test(message) ||
    /unable to (preload|load) .*module/i.test(message) ||
    /loading chunk [\d]+ failed/i.test(message) ||
    /expected a javascript[ -]?module script but the server responded/i.test(message)
  );
}

import { useRouteError } from 'react-router-dom';
import { ErrorFallbackScreen } from './ErrorBoundary';

/**
 * errorElement for the data router. Route-level failures (lazy route modules
 * that still fail after the stale-chunk retry, or render errors with no closer
 * class boundary) land here instead of react-router's default error page.
 * "Try again" reloads: unlike a class boundary reset, a failed route module
 * can only be recovered by re-fetching it.
 */
export function RouteErrorFallback() {
  const error = useRouteError();
  return (
    <ErrorFallbackScreen
      error={error instanceof Error ? error : null}
      onRetry={() => window.location.reload()}
    />
  );
}

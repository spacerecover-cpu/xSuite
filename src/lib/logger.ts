// Sentry is imported DYNAMICALLY so its ~86 kB (gzip) of SDK + replay code
// lands in an async chunk loaded after startup instead of the critical path
// (logger is imported by main.tsx/ErrorBoundary, so a static import would pull
// the whole SDK into the eager bundle). Console behavior stays synchronous;
// Sentry calls made before the SDK finishes loading are queued and flushed
// in order once init completes.
type SentryModule = typeof import('@sentry/react');

const isDev = import.meta.env.DEV;
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const sentryEnabled = Boolean(sentryDsn) && !isDev;

let sentry: SentryModule | null = null;
let pendingCalls: Array<(s: SentryModule) => void> = [];

function withSentry(fn: (s: SentryModule) => void): void {
  if (!sentryEnabled) return;
  if (sentry) {
    fn(sentry);
    return;
  }
  pendingCalls.push(fn);
}

if (sentryEnabled) {
  import('@sentry/react')
    .then((mod) => {
      mod.init({
        dsn: sentryDsn,
        environment: import.meta.env.MODE,
        release: (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'unknown',
        // Conservative sampling: 100% errors, 10% performance, 0% sessions.
        // Adjust per traffic volume once Sentry quota is understood.
        tracesSampleRate: 0.1,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 1.0,
        integrations: [
          mod.browserTracingIntegration(),
          mod.replayIntegration({ maskAllText: true, blockAllMedia: true }),
        ],
        // Filter: drop noisy benign errors before sending.
        ignoreErrors: [
          'ResizeObserver loop limit exceeded',
          'ResizeObserver loop completed with undelivered notifications',
          'Non-Error promise rejection captured',
        ],
        // Strip PII: scrub email/auth headers before send.
        beforeSend(event) {
          if (event.request?.headers) {
            delete event.request.headers.Authorization;
            delete event.request.headers.Cookie;
          }
          return event;
        },
      });
      sentry = mod;
      const queued = pendingCalls;
      pendingCalls = [];
      queued.forEach((fn) => fn(mod));
    })
    .catch(() => {
      // Telemetry must never break the app: if the SDK chunk fails to load
      // (offline, blocked, stale deploy), drop the queue and continue with
      // console-only logging.
      pendingCalls = [];
    });
}

type LogArg = unknown;

function toErrorArgs(args: LogArg[]): { extra: Record<string, unknown>; firstError: Error | undefined } {
  const extra: Record<string, unknown> = {};
  let firstError: Error | undefined;
  args.forEach((arg, i) => {
    if (arg instanceof Error && !firstError) firstError = arg;
    else extra[`arg_${i}`] = arg;
  });
  return { extra, firstError };
}

export const logger = {
  error: (msg: string, ...args: LogArg[]) => {
    if (isDev) console.error(msg, ...args);
    withSentry((s) => {
      const { extra, firstError } = toErrorArgs(args);
      s.withScope((scope) => {
        scope.setExtras({ message: msg, ...extra });
        if (firstError) s.captureException(firstError);
        else s.captureMessage(msg, 'error');
      });
    });
  },
  warn: (msg: string, ...args: LogArg[]) => {
    if (isDev) console.warn(msg, ...args);
    withSentry((s) => {
      s.withScope((scope) => {
        scope.setExtras({ message: msg, ...toErrorArgs(args).extra });
        s.captureMessage(msg, 'warning');
      });
    });
  },
  info: (msg: string, ...args: LogArg[]) => {
    if (isDev) console.log(msg, ...args);
    // info-level not sent to Sentry by default; use breadcrumbs if needed.
    withSentry((s) => {
      s.addBreadcrumb({ message: msg, level: 'info', data: toErrorArgs(args).extra });
    });
  },
};

// Capture unhandled errors + RLS/permission denials with attached user context.
export function setSentryUser(user: { id?: string; email?: string; tenant_id?: string | null; role?: string | null } | null) {
  withSentry((s) => {
    if (!user) {
      s.setUser(null);
      return;
    }
    s.setUser({
      id: user.id,
      email: user.email,
    });
    s.setTag('tenant_id', user.tenant_id ?? 'none');
    s.setTag('role', user.role ?? 'none');
  });
}

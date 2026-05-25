import * as Sentry from '@sentry/react';

const isDev = import.meta.env.DEV;
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const sentryEnabled = Boolean(sentryDsn) && !isDev;

if (sentryEnabled) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    release: (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'unknown',
    // Conservative sampling: 100% errors, 10% performance, 0% sessions.
    // Adjust per traffic volume once Sentry quota is understood.
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
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
    if (sentryEnabled) {
      const { extra, firstError } = toErrorArgs(args);
      Sentry.withScope((scope) => {
        scope.setExtras({ message: msg, ...extra });
        if (firstError) Sentry.captureException(firstError);
        else Sentry.captureMessage(msg, 'error');
      });
    }
  },
  warn: (msg: string, ...args: LogArg[]) => {
    if (isDev) console.warn(msg, ...args);
    if (sentryEnabled) {
      Sentry.withScope((scope) => {
        scope.setExtras({ message: msg, ...toErrorArgs(args).extra });
        Sentry.captureMessage(msg, 'warning');
      });
    }
  },
  info: (msg: string, ...args: LogArg[]) => {
    if (isDev) console.log(msg, ...args);
    // info-level not sent to Sentry by default; use breadcrumbs if needed.
    if (sentryEnabled) {
      Sentry.addBreadcrumb({ message: msg, level: 'info', data: toErrorArgs(args).extra });
    }
  },
};

// Capture unhandled errors + RLS/permission denials with attached user context.
export function setSentryUser(user: { id?: string; email?: string; tenant_id?: string | null; role?: string | null } | null) {
  if (!sentryEnabled) return;
  if (!user) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({
    id: user.id,
    email: user.email,
  });
  Sentry.setTag('tenant_id', user.tenant_id ?? 'none');
  Sentry.setTag('role', user.role ?? 'none');
}

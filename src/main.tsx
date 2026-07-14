import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { installDomTranslationGuard } from './lib/domTranslationGuard';
import { THEMES } from './types/tenantConfig';
import { logger } from './lib/logger';
import { isChunkLoadError } from './lib/chunkError';
import './index.css';
import './lib/i18n';

// Make React's DOM commits tolerant of browser page-translation (Google Translate
// et al.) re-parenting nodes, which otherwise crashes the app with a removeChild
// NotFoundError. Installed before any DOM work. See domTranslationGuard.ts.
installDomTranslationGuard();

// Global safety net. React error boundaries only catch render-phase errors, so
// failures in async paths (floating promise rejections, event handlers, dynamic
// imports) otherwise vanish silently — a major reason a broken navigation can
// leave the UI inert with no visible error. Route everything to the logger.
// Chunk-load failures are tagged at warn-level so a stale-deploy freeze is
// distinguishable from genuine app errors in telemetry.
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  if (isChunkLoadError(reason)) {
    logger.warn('Unhandled dynamic-import rejection (likely stale deploy)', reason);
  } else {
    logger.error('Unhandled promise rejection', reason);
  }
});

window.addEventListener('error', (event) => {
  if (!event.error) return;
  if (isChunkLoadError(event.error)) {
    logger.warn('Script error from dynamic import (likely stale deploy)', event.error);
  } else {
    logger.error('Uncaught error', event.error);
  }
});

// Anti-flash: apply the user's last-seen theme synchronously before React mounts,
// so returning visitors don't see a Royal-default paint before their saved theme loads.
// First-time visitors fall through to the :root default (Royal) in index.css.
// The whitelist derives from THEMES so a newly added theme can never be
// silently dropped here again (that regression = a wrong-theme flash).
const themeHint = localStorage.getItem('xsuite_theme_hint');
if (themeHint && (THEMES as readonly string[]).includes(themeHint)) {
  document.documentElement.dataset.theme = themeHint;
}

// Anti-flash (sibling of the theme block): apply the user's last-seen locale direction
// synchronously before React mounts, so returning RTL tenants paint RTL instead of
// flashing the index.html `<html lang="en">` LTR default. LocaleProvider owns the
// runtime writes; this only pre-seeds the first paint. First-timers / LTR languages
// fall through to the index.html default. CSP forbids inline scripts, so this bundled
// module is the only pre-render hook (same constraint as the theme block above).
//
// Direction is decided from a bundled RTL base-language set rather than a hardcoded
// `=== 'ar'` — the app supports additional geo_languages (RTL_LANGS in locale.ts is
// hydrated at runtime), so any RTL language (Hebrew, Urdu, Farsi, …) must pre-seed RTL
// here too, otherwise it flashes LTR→RTL on every reload. The set covers the standard
// Unicode RTL scripts; we key off the base subtag so region tags (e.g. ar-OM) still match.
const RTL_BASE_LANGS = new Set<string>([
  'ar', 'arc', 'ckb', 'dv', 'fa', 'he', 'iw', 'ji', 'ks', 'nqo',
  'ps', 'sd', 'syr', 'ug', 'ur', 'yi',
]);
const localeHint = localStorage.getItem('xsuite_locale_hint');
if (localeHint) {
  const baseLang = localeHint.toLowerCase().split(/[-_]/)[0];
  if (RTL_BASE_LANGS.has(baseLang)) {
    document.documentElement.dir = 'rtl';
    document.documentElement.lang = localeHint;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60000,
      // refetchOnMount must stay at the default (true): invalidateQueries only
      // refetches ACTIVE queries, so screens you are not currently on are merely
      // marked stale and rely on the next mount to refetch. With it false, every
      // cross-screen invalidation was silently lost and the UI needed a manual
      // browser refresh. Same reasoning for window focus in a multi-user lab.
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: 0,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
);

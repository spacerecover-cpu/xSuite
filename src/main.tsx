import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';
import './lib/i18n';

// Anti-flash: apply the user's last-seen theme synchronously before React mounts,
// so returning visitors don't see a Royal-default paint before their saved theme loads.
// First-time visitors fall through to the :root default (Royal) in index.css.
const themeHint = localStorage.getItem('xsuite_theme_hint');
if (themeHint === 'royal' || themeHint === 'burgundy' || themeHint === 'scarlet') {
  document.documentElement.dataset.theme = themeHint;
}

// Anti-flash (sibling of the theme block): apply the user's last-seen locale direction
// synchronously before React mounts, so returning Arabic tenants paint RTL instead of
// flashing the index.html `<html lang="en">` LTR default. LocaleProvider owns the
// runtime writes; this only pre-seeds the first paint. First-timers / 'en' fall through
// to the index.html default. CSP forbids inline scripts, so this bundled module is the
// only pre-render hook (same constraint as the theme block above).
const localeHint = localStorage.getItem('xsuite_locale_hint');
if (localeHint === 'ar') {
  document.documentElement.dir = 'rtl';
  document.documentElement.lang = 'ar';
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
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

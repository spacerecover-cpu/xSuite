import React from 'react';

/**
 * Non-blocking loading indicator for the content region only. Mounted inside the
 * layout's <Outlet> Suspense boundary so navigating to a not-yet-loaded lazy
 * route keeps the sidebar/header in place and shows the spinner just in the main
 * area — instead of the full-screen fallback blanking the whole app.
 */
export const ContentLoadingFallback: React.FC = () => (
  <div
    className="flex flex-col items-center justify-center py-24 text-center"
    role="status"
    aria-live="polite"
  >
    <span className="inline-block w-9 h-9 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
    <span className="sr-only">Loading…</span>
  </div>
);

export default ContentLoadingFallback;

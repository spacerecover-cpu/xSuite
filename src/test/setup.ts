import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import '../lib/i18n';

// jsdom lacks ResizeObserver, which ConfigurableDataTable (and anything that
// measures its container to fit-to-width) instantiates on mount. A no-op stub
// keeps those components mountable in tests; widths fall back to their defaults.
if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
}

// jsdom's getContext() logs a noisy "Not implemented" error on every call.
// Decorative canvases (AuthWaveField) already null-guard the context; return
// null quietly so auth-page tests don't spam the console.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
}

afterEach(cleanup);

import { describe, it, expect } from 'vitest';
import { isChunkLoadError } from './chunkError';

describe('isChunkLoadError', () => {
  it('matches the Chrome dynamic-import failure message', () => {
    const err = new TypeError(
      'Failed to fetch dynamically imported module: https://app.example/assets/CasesList-BN4ZFH_X.js',
    );
    expect(isChunkLoadError(err)).toBe(true);
  });

  it('matches the Firefox dynamic-import failure message', () => {
    const err = new Error(
      'error loading dynamically imported module: https://app.example/assets/CaseDetail-Ds.js',
    );
    expect(isChunkLoadError(err)).toBe(true);
  });

  it('matches the Safari module-script failure message', () => {
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
  });

  it('matches the MIME-type mismatch from an SPA HTML fallback', () => {
    const err = new Error(
      "Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of text/html.",
    );
    expect(isChunkLoadError(err)).toBe(true);
  });

  it('accepts a raw string message', () => {
    expect(isChunkLoadError('Failed to fetch dynamically imported module: /assets/x.js')).toBe(true);
  });

  it('does not match unrelated runtime errors', () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(false);
    expect(isChunkLoadError(new Error('Network request failed'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError({})).toBe(false);
  });
});

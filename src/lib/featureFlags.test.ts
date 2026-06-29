import { describe, it, expect, vi, afterEach } from 'vitest';
import { isDocStudioEnabled } from './featureFlags';

afterEach(() => { vi.unstubAllEnvs(); });

describe('isDocStudioEnabled (opt-out)', () => {
  it('defaults ON when the var is unset', () => { expect(isDocStudioEnabled()).toBe(true); });
  it('is OFF only when explicitly "false"', () => { vi.stubEnv('VITE_DOC_STUDIO', 'false'); expect(isDocStudioEnabled()).toBe(false); });
  it('is ON for any other value', () => { vi.stubEnv('VITE_DOC_STUDIO', 'true'); expect(isDocStudioEnabled()).toBe(true); });
});

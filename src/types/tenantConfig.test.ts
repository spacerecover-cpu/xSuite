import { describe, it, expect } from 'vitest';
import { REQUIRED_SENTINEL, DEFAULT_TENANT_CONFIG, isResolvedConfig } from './tenantConfig';

describe('fail-loud config sentinel (D2)', () => {
  it('REQUIRED_SENTINEL is a unique non-value, never a real string', () => {
    expect(typeof REQUIRED_SENTINEL).toBe('symbol');
    expect(String(REQUIRED_SENTINEL)).not.toContain('USD');
  });
  it('DEFAULT_TENANT_CONFIG no longer fabricates a US currency/locale', () => {
    expect(DEFAULT_TENANT_CONFIG.currency.code).toBe(REQUIRED_SENTINEL);
    expect(DEFAULT_TENANT_CONFIG.locale.localeCode).toBe(REQUIRED_SENTINEL);
  });
  it('isResolvedConfig is false when a required field is still the sentinel', () => {
    expect(isResolvedConfig(DEFAULT_TENANT_CONFIG)).toBe(false);
  });
  it('isResolvedConfig is true for a genuinely resolved config', () => {
    const resolved = {
      ...DEFAULT_TENANT_CONFIG,
      currency: { ...DEFAULT_TENANT_CONFIG.currency, code: 'OMR' },
      locale: { ...DEFAULT_TENANT_CONFIG.locale, localeCode: 'ar-OM' },
    };
    expect(isResolvedConfig(resolved)).toBe(true);
  });
});

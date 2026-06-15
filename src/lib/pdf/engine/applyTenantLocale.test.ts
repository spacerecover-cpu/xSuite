import { describe, it, expect } from 'vitest';
import { applyTenantLocale } from './applyTenantLocale';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../templateConfig';
import type { CompanySettingsData } from '../types';

const settings = {} as CompanySettingsData; // english-only path

describe('applyTenantLocale', () => {
  it('preserves applyTenantLanguage behaviour (english-only by default)', () => {
    const out = applyTenantLocale(BUILT_IN_TEMPLATE_CONFIGS.invoice, settings, { dateFormat: 'DD/MM/YYYY' });
    expect(out.language.mode).toBe('en');
  });
  it('stamps the resolved date format onto config.locale', () => {
    const out = applyTenantLocale(BUILT_IN_TEMPLATE_CONFIGS.invoice, settings, { dateFormat: 'DD/MM/YYYY' });
    expect(out.locale?.dateFormat).toBe('DD/MM/YYYY');
  });
  it('is non-mutating (input config untouched)', () => {
    applyTenantLocale(BUILT_IN_TEMPLATE_CONFIGS.invoice, settings, { dateFormat: 'DD/MM/YYYY' });
    expect(BUILT_IN_TEMPLATE_CONFIGS.invoice.locale).toBeUndefined();
  });
  it('leaves locale absent when no resolved locale is supplied (back-compat)', () => {
    const out = applyTenantLocale(BUILT_IN_TEMPLATE_CONFIGS.invoice, settings, undefined);
    expect(out.locale).toBeUndefined();
  });
});

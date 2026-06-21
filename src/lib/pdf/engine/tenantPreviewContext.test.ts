import { describe, it, expect } from 'vitest';
import { buildTenantPreviewContext } from './tenantPreviewContext';
import type { CompanySettingsData } from '../types';

const cs = (docLang: unknown): CompanySettingsData =>
  ({ localization: { document_language_settings: docLang } } as unknown as CompanySettingsData);

describe('buildTenantPreviewContext', () => {
  it('is English/LTR for an english_only tenant', () => {
    const ctx = buildTenantPreviewContext(cs({ mode: 'english_only', secondary_language: null }));
    expect(ctx.isBilingual).toBe(false);
    expect(ctx.isRTL).toBe(false);
    expect(ctx.languageCode).toBeNull();
  });

  it('falls back to English when language settings are missing', () => {
    const ctx = buildTenantPreviewContext({} as CompanySettingsData);
    expect(ctx.isBilingual).toBe(false);
    expect(ctx.languageCode).toBeNull();
  });

  it('is bilingual + RTL for a bilingual Arabic tenant', () => {
    const ctx = buildTenantPreviewContext(cs({ mode: 'bilingual', secondary_language: 'ar' }));
    expect(ctx.isBilingual).toBe(true);
    expect(ctx.isRTL).toBe(true);
    expect(ctx.languageCode).toBe('ar');
  });

  it('stays English when bilingual is chosen without a secondary language', () => {
    // Mirrors createTranslationContext: isBilingual requires a non-null languageCode.
    const ctx = buildTenantPreviewContext(cs({ mode: 'bilingual', secondary_language: null }));
    expect(ctx.isBilingual).toBe(false);
  });
});

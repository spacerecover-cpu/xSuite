import { describe, it, expect } from 'vitest';
import {
  BUILT_IN_TEMPLATE_CONFIGS,
  resolveTemplateConfig,
  resolveSecondary,
} from '../templateConfig';
import { applyTenantLanguage } from './applyTenantLanguage';
import { ctxFromLanguageConfig } from '../translationContext';
import type { CompanySettingsData } from '../types';

describe('repro: non-Arabic Studio preview', () => {
  it('a French template language survives applyTenantLanguage over an Arabic tenant', () => {
    const builtIn = BUILT_IN_TEMPLATE_CONFIGS.invoice;
    const resolved = resolveTemplateConfig(builtIn, undefined, {
      language: { mode: 'bilingual_stacked', secondary: 'fr', primary: 'en' },
    });
    // After the cascade, the picker's French must be present.
    expect(resolveSecondary(resolved.language)).toBe('fr');

    // Tenant default is Arabic-bilingual (the common case).
    const cs = {
      localization: { document_language_settings: { mode: 'bilingual', secondary_language: 'ar' } },
    } as unknown as CompanySettingsData;

    const eff = applyTenantLanguage(resolved, cs);
    // The per-template French MUST win over the tenant Arabic.
    expect(resolveSecondary(eff.language)).toBe('fr');

    const ctx = ctxFromLanguageConfig(eff.language);
    expect(ctx.languageCode).toBe('fr');
    expect(ctx.isBilingual).toBe(true);
    // A core invoice label must come back bilingual (English | French).
    const out = ctx.t('customerInformation', 'Customer Information');
    expect(out).toContain('|');
    expect(out).not.toBe('Customer Information');
  });
});

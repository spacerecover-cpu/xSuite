import { describe, it, expect } from 'vitest';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../templateConfig';
import type { TranslationPolicyConfig } from '../templateConfig';
import { renderTemplate } from './renderTemplate';
import { buildPreviewEngineData } from './sampleData';
import type { TranslationContext } from '../types';

const ctx: TranslationContext = { t: (_k, en) => en, isRTL: false, isBilingual: false, languageCode: null, fontFamily: 'Roboto' };

const render = (policy?: TranslationPolicyConfig) => {
  const base = BUILT_IN_TEMPLATE_CONFIGS.invoice;
  const config = { ...base, language: { mode: 'bilingual_stacked' as const, primary: 'ar' as const }, translationPolicy: policy };
  return JSON.stringify(renderTemplate(config, buildPreviewEngineData('invoice', config), ctx, null, null));
};

// The sample invoice is Arabic-primary bilingual_stacked, so a SUPPRESSED field
// label collapses to the primary language (Arabic) and DROPS the English — the
// bilingual stacked join `<ar>\nName:` is therefore the true "is this label
// bilingual?" discriminator (the lone Arabic `الاسم` survives suppression and is
// not a valid signal). The box TITLE is always bilingual, so its Arabic
// (`معلومات العميل`) must persist regardless of policy.
describe('translationPolicy — field-label suppression', () => {
  // NB: substrings are matched against the JSON-serialized doc-definition, so the
  // stacked-bilingual newline appears as the two-char escape `\n` (`\\nName:`).
  it('all → the customer "Name" field label is bilingual (EN+AR stacked present)', () => {
    expect(render({ mode: 'all' })).toContain('\\nName:');
  });
  it('system_only → the customer field label is primary-only (no bilingual "\\nName:")', () => {
    expect(render({ mode: 'system_only' })).not.toContain('\\nName:');
  });
  it('system_only → a SYSTEM label (customer box TITLE) stays bilingual', () => {
    expect(render({ mode: 'system_only' })).toContain('معلومات العميل');
  });
  it('custom parties:false → parties field label suppressed', () => {
    expect(render({ mode: 'custom', groups: { parties: false } })).not.toContain('\\nName:');
  });
});

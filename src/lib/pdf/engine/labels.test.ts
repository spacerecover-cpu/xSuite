import { describe, it, expect } from 'vitest';
import { fieldLabelsBilingual, fieldLabelLanguage } from './labels';
import type { LanguageConfig } from '../templateConfig';

const BI: LanguageConfig = { mode: 'bilingual_stacked', primary: 'ar' };
const EN: LanguageConfig = { mode: 'en', primary: 'en' };

describe('fieldLabelsBilingual', () => {
  it('all (or undefined) → true for any group', () => {
    expect(fieldLabelsBilingual(undefined, 'parties')).toBe(true);
    expect(fieldLabelsBilingual({ mode: 'all' }, 'parties')).toBe(true);
  });
  it('system_only → false for any group', () => {
    expect(fieldLabelsBilingual({ mode: 'system_only' }, 'parties')).toBe(false);
  });
  it('custom → per-group, default true', () => {
    const p = { mode: 'custom' as const, groups: { parties: false } };
    expect(fieldLabelsBilingual(p, 'parties')).toBe(false);
    expect(fieldLabelsBilingual(p, 'meta')).toBe(true);
  });
});

describe('fieldLabelLanguage', () => {
  it('returns the bilingual config when the group is bilingual', () => {
    expect(fieldLabelLanguage(BI, { mode: 'all' }, 'parties')).toEqual(BI);
  });
  it('returns a primary-only config (ar) when suppressed and primary is ar', () => {
    expect(fieldLabelLanguage(BI, { mode: 'system_only' }, 'parties')).toEqual({ mode: 'ar', primary: 'ar' });
  });
  it('returns the original config unchanged for a single-language document', () => {
    expect(fieldLabelLanguage(EN, { mode: 'system_only' }, 'parties')).toEqual(EN);
  });
});

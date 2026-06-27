import { describe, it, expect } from 'vitest';
import {
  SECONDARY_LANGUAGE_OPTIONS,
  languageName,
  layoutOptions,
  primaryFor,
  patchForSecondary,
  patchForLayout,
} from './languageOptions';

// Pure mapping tests for the Studio language picker. They lock the (mode,
// secondary, primary) derivation that persists into the saved config: any of the
// 13 secondaries, RTL auto from the secondary, no hardcoded Arabic.

describe('languageName', () => {
  it('maps a code to its display name and null to English Only', () => {
    expect(languageName('fr')).toBe('French');
    expect(languageName('ko')).toBe('Korean');
    expect(languageName(null)).toBe('English Only');
  });
});

describe('SECONDARY_LANGUAGE_OPTIONS', () => {
  it('offers English Only + the 13 secondaries (14 total)', () => {
    expect(SECONDARY_LANGUAGE_OPTIONS).toHaveLength(14);
    expect(SECONDARY_LANGUAGE_OPTIONS[0]).toEqual({ value: '', label: 'English Only' });
    expect(SECONDARY_LANGUAGE_OPTIONS.map((o) => o.value)).toContain('fr');
    expect(SECONDARY_LANGUAGE_OPTIONS.map((o) => o.value)).toContain('th');
  });
});

describe('layoutOptions — neutral, language-aware labels', () => {
  it('uses the chosen language name, not a hardcoded "Arabic"', () => {
    const opts = layoutOptions('fr');
    expect(opts.map((o) => o.value)).toEqual(['ar', 'bilingual_stacked', 'bilingual_sidebyside']);
    expect(opts[0].label).toBe('French only');
    expect(opts[1].label).toBe('Bilingual — stacked (English over French)');
    expect(opts[2].label).toBe('Bilingual — side by side (English | French)');
  });
});

describe('primaryFor — secondary leads only when RTL', () => {
  it('returns "ar" (secondary leads) for an RTL secondary, "en" otherwise', () => {
    expect(primaryFor('ar')).toBe('ar');
    expect(primaryFor('fr')).toBe('en');
    expect(primaryFor('ko')).toBe('en');
    expect(primaryFor(null)).toBe('en');
  });
});

describe('patchForSecondary', () => {
  it('English Only resets mode/primary and clears the secondary', () => {
    expect(patchForSecondary(null, 'bilingual_stacked')).toEqual({
      mode: 'en',
      primary: 'en',
      secondary: undefined,
    });
  });

  it('picking a language from English defaults the layout to stacked', () => {
    expect(patchForSecondary('fr', 'en')).toEqual({
      mode: 'bilingual_stacked',
      secondary: 'fr',
      primary: 'en',
    });
  });

  it('picking a language keeps the current layout when already bilingual', () => {
    expect(patchForSecondary('ar', 'bilingual_sidebyside')).toEqual({
      mode: 'bilingual_sidebyside',
      secondary: 'ar',
      primary: 'ar', // RTL ⇒ secondary leads
    });
  });
});

describe('patchForLayout', () => {
  it('sets the mode and recomputes primary from the (fixed) secondary', () => {
    expect(patchForLayout('bilingual_stacked', 'fr')).toEqual({ mode: 'bilingual_stacked', primary: 'en' });
    expect(patchForLayout('ar', 'ar')).toEqual({ mode: 'ar', primary: 'ar' });
  });
});

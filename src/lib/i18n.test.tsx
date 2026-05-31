import { describe, it, expect, afterEach, vi } from 'vitest';
import i18n from './i18n';

describe('ui i18n keys', () => {
  it('resolves the new ui.* keys in English', () => {
    expect(i18n.t('ui.noData')).toBe('No data available');
    expect(i18n.t('ui.processing')).toBe('Processing...');
    expect(i18n.t('ui.close')).toBe('Close');
    expect(i18n.t('ui.noOptions')).toBe('No options available');
  });

  it('resolves the Arabic translations', async () => {
    await i18n.changeLanguage('ar');
    expect(i18n.t('ui.noData')).toBe('لا توجد بيانات');
    await i18n.changeLanguage('en');
  });

  it('interpolates selectedCount', () => {
    expect(i18n.t('ui.selectedCount', { selected: 2, total: 5 })).toBe('2 of 5 selected');
  });
});

describe('phase 1 overlay ui keys', () => {
  it('resolves new overlay keys in English', () => {
    expect(i18n.t('ui.dialog')).toBe('Dialog');
    expect(i18n.t('ui.cropImage')).toBe('Crop Image');
    expect(i18n.t('ui.applyCrop')).toBe('Apply Crop');
    expect(i18n.t('ui.photoViewerClose')).toBe('Close photo viewer');
  });
});

// Phase 4a: i18n is un-pinned — `lng` reads the synchronous anti-flash hint
// (`xsuite_locale_hint`) at module init so the very first React render is correct for
// returning Arabic tenants. The static `dir`/`lang` writes were deleted; LocaleProvider
// (and the main.tsx pre-render block) now own all DOM direction state.
describe('i18n init lng (anti-flash hint)', () => {
  afterEach(async () => {
    // The hint-driven init runs in fresh module registries; also reset the shared
    // singleton's plural state so it does not leak into the rest of the suite.
    vi.resetModules();
    localStorage.clear();
    await i18n.changeLanguage('en');
  });

  it('reads lng = ar when the locale hint is "ar" before import', async () => {
    vi.resetModules();
    localStorage.setItem('xsuite_locale_hint', 'ar');
    const fresh = (await import('./i18n')).default;
    expect(fresh.language).toBe('ar');
  });

  it('defaults lng to en when no locale hint is present', async () => {
    vi.resetModules();
    localStorage.removeItem('xsuite_locale_hint');
    const fresh = (await import('./i18n')).default;
    expect(fresh.language).toBe('en');
  });

  it('defaults lng to en for an unknown hint value', async () => {
    vi.resetModules();
    localStorage.setItem('xsuite_locale_hint', 'de');
    const fresh = (await import('./i18n')).default;
    expect(fresh.language).toBe('en');
  });

  it('does not force-write documentElement dir/lang at import', async () => {
    vi.resetModules();
    localStorage.setItem('xsuite_locale_hint', 'ar');
    document.documentElement.removeAttribute('dir');
    document.documentElement.removeAttribute('lang');
    await import('./i18n');
    // The module no longer owns DOM direction — LocaleProvider / main.tsx do.
    expect(document.documentElement.getAttribute('dir')).toBeNull();
    expect(document.documentElement.getAttribute('lang')).toBeNull();
  });
});

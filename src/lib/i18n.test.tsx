import { describe, it, expect, afterEach, afterAll, vi } from 'vitest';
import i18n from './i18n';

// CLDR plural categories Arabic exercises. A plural-base key in `en` (detected by an
// `_one`/`_other` suffixed sibling) must carry the full Arabic set in `ar`.
const CLDR_PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;
const PLURAL_SUFFIX_RE = /_(zero|one|two|few|many|other)$/;

type LeafTree = Record<string, string>;

// Flatten a nested translation resource into dot-path -> leaf-string entries.
function flattenLeafKeys(obj: unknown, prefix = '', out: LeafTree = {}): LeafTree {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      flattenLeafKeys(value, path, out);
    }
  } else {
    out[prefix] = String(obj);
  }
  return out;
}

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

// Phase 4a (spec §9 / §10.8): lock the en/ar dictionary in its complete state so any
// future PR that adds an `en` key without its `ar` counterpart — or adds a plural-base
// key without the full Arabic CLDR set — fails CI. The dictionary is complete on main,
// so this guard PASSES today and only goes red on a desync.
describe('i18n en/ar dictionary parity guard', () => {
  // Read the live resource trees straight off the initialized singleton (no source
  // change): getResourceBundle returns the full nested `translation` namespace object.
  const enBundle = i18n.getResourceBundle('en', 'translation') as Record<string, unknown>;
  const arBundle = i18n.getResourceBundle('ar', 'translation') as Record<string, unknown>;
  const enKeys = flattenLeafKeys(enBundle);
  const arKeys = flattenLeafKeys(arBundle);

  // Reading bundles is read-only, but be a good citizen and leave the singleton on 'en'
  // so plural-rule state never leaks into the rest of the suite.
  afterAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('exposes non-empty en and ar resource bundles', () => {
    expect(Object.keys(enKeys).length).toBeGreaterThan(0);
    expect(Object.keys(arKeys).length).toBeGreaterThan(0);
  });

  // portal.* is the Country Engine Phase 2 portal slice (A3): en-authoritative with a
  // reused-verified Arabic SUBSET + English fallback (fallbackLng:'en'), pending human
  // Arabic translation (the plan forbids machine-translating statutory portal copy).
  // It is intentionally exempt from full en/ar parity here — re-include it once the
  // portal Arabic is human-verified. All other namespaces remain fully bilingual.
  const isPortal = (key: string) => key.startsWith('portal.');

  it('has zero en leaf keys missing from ar (excluding the en-fallback portal slice)', () => {
    const missing = Object.keys(enKeys).filter((key) => !isPortal(key) && !(key in arKeys));
    expect(missing).toEqual([]);
  });

  it('every portal Arabic key is a real portal English key (no orphan ar)', () => {
    const orphans = Object.keys(arKeys).filter((key) => isPortal(key) && !(key in enKeys));
    expect(orphans).toEqual([]);
  });

  it('has the full Arabic CLDR plural set for every en plural-base key', () => {
    // A plural base is the dot-path with its CLDR suffix stripped. en ships English
    // plurals (_one/_other); we require ar to carry _zero/_one/_two/_few/_many/_other.
    const pluralBases = new Set<string>();
    for (const key of Object.keys(enKeys)) {
      if (isPortal(key)) continue; // portal slice exempt (en-fallback; see parity note above)
      if (PLURAL_SUFFIX_RE.test(key)) {
        pluralBases.add(key.replace(PLURAL_SUFFIX_RE, ''));
      }
    }

    // Guard the guard: the known plural-base keys must be discovered, or a refactor that
    // silently drops plurals would let this assertion pass vacuously.
    expect(pluralBases.size).toBeGreaterThanOrEqual(3);

    const incomplete: Record<string, string[]> = {};
    for (const base of pluralBases) {
      const missingVariants = CLDR_PLURAL_SUFFIXES.filter(
        (suffix) => !(`${base}_${suffix}` in arKeys),
      );
      if (missingVariants.length > 0) {
        incomplete[base] = missingVariants;
      }
    }
    expect(incomplete).toEqual({});
  });
});

import { StrictMode, useState } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import i18n from '../lib/i18n';
import { DEFAULT_TENANT_CONFIG } from '../types/tenantConfig';
import type { TenantConfig } from '../types/tenantConfig';

// Drive the provider by mocking the tenant-config source of truth. The provider
// reads config.locale.languageCode + refreshConfig via useTenantConfig().
const refreshConfig = vi.fn(async () => {});
let mockConfig: TenantConfig = DEFAULT_TENANT_CONFIG;
let mockIsLoading = false;

vi.mock('./TenantConfigContext', () => ({
  useTenantConfig: () => ({
    config: mockConfig,
    isLoading: mockIsLoading,
    refreshConfig,
  }),
}));

// setLocale now persists the choice to the tenant. Mock the service write so the
// test stays hermetic and importing it does not pull in the real Supabase client.
// vi.hoisted initialises the spy before the hoisted vi.mock factory runs.
const { updateTenantUiLanguage } = vi.hoisted(() => ({
  updateTenantUiLanguage: vi.fn(async (_tenantId: string, _lang: string) => {}),
}));
vi.mock('../lib/tenantConfigService', () => ({ updateTenantUiLanguage }));

// LocaleProvider hydrates the supported-language set from geo_languages on mount;
// mock the service so the test stays hermetic and does not pull in the real
// Supabase client. The provider only calls .then(hydrateLanguages) with the result.
vi.mock('../lib/languageService', () => ({ fetchActiveLanguages: vi.fn(async () => []) }));

// Import after the mocks are registered.
import { LocaleProvider, useLocale } from './LocaleContext';

function configWithLang(languageCode: string): TenantConfig {
  return {
    ...DEFAULT_TENANT_CONFIG,
    tenantId: 'tenant-1',
    locale: { ...DEFAULT_TENANT_CONFIG.locale, languageCode },
  };
}

function SetLocaleButton() {
  const { setLocale } = useLocale();
  return (
    <button onClick={() => setLocale('ar')}>flip-to-ar</button>
  );
}

// Surfaces whether setLocale rejected, so a swallowed persistence error is observable.
function SetLocaleProbe() {
  const { setLocale } = useLocale();
  const [outcome, setOutcome] = useState('');
  return (
    <button
      data-testid="outcome"
      data-outcome={outcome}
      onClick={async () => {
        try {
          await setLocale('ar');
          setOutcome('resolved');
        } catch {
          setOutcome('rejected');
        }
      }}
    >
      flip-to-ar
    </button>
  );
}

beforeEach(() => {
  refreshConfig.mockClear();
  updateTenantUiLanguage.mockClear();
  // A successful persist writes the tenant's ui_language; refreshConfig then makes
  // it authoritative. Model that here so clearing the optimistic value resolves to
  // the newly-persisted language rather than the pre-change mock config.
  updateTenantUiLanguage.mockImplementation(async (_tenantId: string, lang: string) => {
    mockConfig = configWithLang(lang);
  });
  mockConfig = DEFAULT_TENANT_CONFIG;
  mockIsLoading = false;
  localStorage.clear();
  document.documentElement.dir = '';
  document.documentElement.lang = '';
});

afterEach(async () => {
  // Reset shared i18n/plural state so it does not leak into the rest of the suite.
  await i18n.changeLanguage('en');
});

describe('LocaleContext', () => {
  it('applies ar config to i18n, dir, lang and the anti-flash hint', async () => {
    mockConfig = configWithLang('ar');
    await act(async () => {
      render(
        <LocaleProvider>
          <span>child</span>
        </LocaleProvider>
      );
    });

    expect(i18n.language).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    expect(localStorage.getItem('xsuite_locale_hint')).toBe('ar');
  });

  it('applies en config to i18n, dir, lang and the hint', async () => {
    mockConfig = configWithLang('en');
    await act(async () => {
      render(
        <LocaleProvider>
          <span>child</span>
        </LocaleProvider>
      );
    });

    expect(i18n.language).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('xsuite_locale_hint')).toBe('en');
  });

  it('guards an unsupported language (de) to en / ltr', async () => {
    mockConfig = configWithLang('de');
    await act(async () => {
      render(
        <LocaleProvider>
          <span>child</span>
        </LocaleProvider>
      );
    });

    expect(i18n.language).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('xsuite_locale_hint')).toBe('en');
  });

  it('guards an unsupported language (fr) to en / ltr', async () => {
    mockConfig = configWithLang('fr');
    await act(async () => {
      render(
        <LocaleProvider>
          <span>child</span>
        </LocaleProvider>
      );
    });

    expect(i18n.language).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en');
  });

  it('setLocale optimistically flips dir/lang/hint and persists to the tenant', async () => {
    mockConfig = configWithLang('en');
    await act(async () => {
      render(
        <LocaleProvider>
          <SetLocaleButton />
        </LocaleProvider>
      );
    });

    expect(document.documentElement.dir).toBe('ltr');

    await act(async () => {
      screen.getByText('flip-to-ar').click();
    });

    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    expect(i18n.language).toBe('ar');
    expect(localStorage.getItem('xsuite_locale_hint')).toBe('ar');
    // Now persistent: setLocale writes the tenant's ui_language then refreshes config.
    expect(updateTenantUiLanguage).toHaveBeenCalledWith('tenant-1', 'ar');
    expect(refreshConfig).toHaveBeenCalled();
  });

  it('rethrows and reverts the optimistic flip when persistence fails', async () => {
    mockConfig = configWithLang('en');
    updateTenantUiLanguage.mockRejectedValueOnce(new Error('RLS denied'));

    await act(async () => {
      render(
        <LocaleProvider>
          <SetLocaleProbe />
        </LocaleProvider>
      );
    });

    expect(document.documentElement.dir).toBe('ltr');

    await act(async () => {
      screen.getByTestId('outcome').click();
    });

    // The caller must see the rejection (so it can show an error toast), not a
    // silently-swallowed success.
    expect(screen.getByTestId('outcome')).toHaveAttribute('data-outcome', 'rejected');
    // Optimistic state is reverted to the persisted tenant language.
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en');
    expect(i18n.language).toBe('en');
    expect(localStorage.getItem('xsuite_locale_hint')).toBe('en');
    // refreshConfig is never reached because the write threw first.
    expect(refreshConfig).not.toHaveBeenCalled();
  });

  it('clears optimistic state after a successful persist so refreshed config is authoritative', async () => {
    mockConfig = configWithLang('en');

    await act(async () => {
      render(
        <LocaleProvider>
          <SetLocaleProbe />
        </LocaleProvider>
      );
    });

    await act(async () => {
      screen.getByTestId('outcome').click();
    });

    expect(screen.getByTestId('outcome')).toHaveAttribute('data-outcome', 'resolved');
    expect(updateTenantUiLanguage).toHaveBeenCalledWith('tenant-1', 'ar');
    expect(refreshConfig).toHaveBeenCalled();
  });

  it('useLocale exposes the effective locale', async () => {
    mockConfig = configWithLang('ar');
    function Probe() {
      const { locale } = useLocale();
      return <span data-testid="locale">{locale}</span>;
    }
    await act(async () => {
      render(
        <LocaleProvider>
          <Probe />
        </LocaleProvider>
      );
    });
    expect(screen.getByTestId('locale')).toHaveTextContent('ar');
  });

  it('preserves the pre-seeded RTL hint during tenant-config load instead of flashing LTR', async () => {
    // main.tsx synchronously pre-seeds this for a returning Arabic tenant before
    // React mounts, so the first paint is RTL.
    localStorage.setItem('xsuite_locale_hint', 'ar');
    document.documentElement.dir = 'rtl';
    document.documentElement.lang = 'ar';
    await i18n.changeLanguage('ar');
    // Pre-profile auth window: tenantId is still undefined so loadConfig short-circuits
    // with isLoading=false while config stays DEFAULT_TENANT_CONFIG (unresolved 'en').
    // This is the dominant part of a hard reload and the exact window the flash occurs in;
    // the guard must key off isResolvedConfig(config), not isLoading.
    mockIsLoading = false;
    mockConfig = DEFAULT_TENANT_CONFIG;

    let rerender!: ReturnType<typeof render>['rerender'];
    await act(async () => {
      const r = render(
        <LocaleProvider>
          <span>child</span>
        </LocaleProvider>
      );
      rerender = r.rerender;
    });

    // The loading window must NOT clobber the pre-seeded RTL direction with the
    // DEFAULT 'en'/LTR — that would be the visible LTR reflow flash on every reload.
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    expect(i18n.language).toBe('ar');

    // Once the real Arabic tenant config resolves, it stays RTL (fix doesn't pin to the hint).
    mockIsLoading = false;
    mockConfig = configWithLang('ar');
    await act(async () => {
      rerender(
        <LocaleProvider>
          <span>child</span>
        </LocaleProvider>
      );
    });

    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    expect(i18n.language).toBe('ar');
  });

  it('is idempotent under StrictMode double-invoke', async () => {
    mockConfig = configWithLang('ar');
    await act(async () => {
      render(
        <StrictMode>
          <LocaleProvider>
            <span>child</span>
          </LocaleProvider>
        </StrictMode>
      );
    });

    expect(i18n.language).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
  });
});

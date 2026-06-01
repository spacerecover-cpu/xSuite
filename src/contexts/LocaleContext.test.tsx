import { StrictMode } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import i18n from '../lib/i18n';
import { DEFAULT_TENANT_CONFIG } from '../types/tenantConfig';
import type { TenantConfig } from '../types/tenantConfig';

// Drive the provider by mocking the tenant-config source of truth. The provider
// reads config.locale.languageCode + refreshConfig via useTenantConfig().
const refreshConfig = vi.fn(async () => {});
let mockConfig: TenantConfig = DEFAULT_TENANT_CONFIG;

vi.mock('./TenantConfigContext', () => ({
  useTenantConfig: () => ({
    config: mockConfig,
    isLoading: false,
    refreshConfig,
  }),
}));

// setLocale now persists the choice to the tenant. Mock the service write so the
// test stays hermetic and importing it does not pull in the real Supabase client.
// vi.hoisted initialises the spy before the hoisted vi.mock factory runs.
const { updateTenantUiLanguage } = vi.hoisted(() => ({
  updateTenantUiLanguage: vi.fn(async () => {}),
}));
vi.mock('../lib/tenantConfigService', () => ({ updateTenantUiLanguage }));

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

beforeEach(() => {
  refreshConfig.mockClear();
  updateTenantUiLanguage.mockClear();
  mockConfig = DEFAULT_TENANT_CONFIG;
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

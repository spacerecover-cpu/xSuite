import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import i18n from '../lib/i18n';
import { isRTLLanguage, normalizeLang, hydrateLanguages } from '../lib/locale';
import { fetchActiveLanguages } from '../lib/languageService';
import { useTenantConfig } from './TenantConfigContext';
import { isResolvedConfig } from '../types/tenantConfig';
import { updateTenantUiLanguage } from '../lib/tenantConfigService';
import { logger } from '../lib/logger';

const LOCALE_HINT_KEY = 'xsuite_locale_hint';

// Config-driven: any code in the hydrated SUPPORTED_LANGS (geo_languages), not a
// compile-pinned 'en'|'ar' union. Direction comes from isRTLLanguage(locale).
type Locale = string;

interface LocaleContextType {
  locale: Locale;
  setLocale: (locale: Locale) => Promise<void>;
}

const LocaleContext = createContext<LocaleContextType>({
  locale: 'en',
  setLocale: async () => {},
});

function applyLocaleToDOM(lang: Locale): void {
  i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = isRTLLanguage(lang) ? 'rtl' : 'ltr';
}

function persistLocaleHint(lang: Locale): void {
  try {
    localStorage.setItem(LOCALE_HINT_KEY, lang);
  } catch {
    // Ignore quota / privacy-mode errors — the hint is just an anti-flash optimization.
  }
}

function readLocaleHint(): string | null {
  try {
    return localStorage.getItem(LOCALE_HINT_KEY);
  } catch {
    return null;
  }
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const { config, refreshConfig } = useTenantConfig();
  const tenantLang = normalizeLang(config.locale.languageCode);
  const tenantId = config.tenantId;

  const [optimisticLang, setOptimisticLang] = useState<Locale | null>(null);

  // Snapshot the anti-flash hint main.tsx pre-seeded (read once — it holds the
  // pre-mount value; we overwrite it ourselves via persistLocaleHint below).
  const hintLang = useMemo<Locale | null>(() => {
    const raw = readLocaleHint();
    return raw ? normalizeLang(raw) : null;
  }, []);

  // Until the real tenant config resolves, `config` is DEFAULT_TENANT_CONFIG
  // (languageCode 'en'). Adopting that would force dir='ltr' + English i18n and
  // clobber the RTL direction main.tsx pre-seeded from the persisted hint — a full
  // LTR→RTL→LTR reflow flash for returning Arabic tenants on every reload. Guard on
  // isResolvedConfig(), not isLoading: during the pre-profile auth window tenantId
  // is undefined so loadConfig short-circuits with isLoading=false while config is
  // still DEFAULT — that whole window would otherwise flash LTR. Prefer the persisted
  // hint until the config actually resolves. An in-flight optimistic change (setLocale)
  // still wins so its flip is never suppressed.
  const effectiveLang = optimisticLang ?? (isResolvedConfig(config) ? tenantLang : (hintLang ?? tenantLang));

  useEffect(() => {
    applyLocaleToDOM(effectiveLang);
    persistLocaleHint(effectiveLang);
  }, [effectiveLang]);

  // Widen the supported-language + RTL sets from geo_languages once on mount.
  // No-op until the table carries more than the {en,ar} bootstrap; a failed read
  // returns [] so the bootstrap is preserved.
  useEffect(() => {
    fetchActiveLanguages().then(hydrateLanguages);
  }, []);

  // Optimistically flip the UI now (DOM + i18n via the effect above), then persist
  // the choice on the tenant and refresh config so it survives reloads and applies
  // on every device. Country continues to drive currency/date/number formats.
  const setLocale = useCallback(async (next: Locale) => {
    setOptimisticLang(next);
    if (!tenantId) return;
    try {
      await updateTenantUiLanguage(tenantId, next);
      await refreshConfig();
      setOptimisticLang(null);
    } catch (err) {
      logger.error('Failed to persist UI language; reverting:', err);
      setOptimisticLang(null);
      throw err;
    }
  }, [tenantId, refreshConfig]);

  const value = useMemo(() => ({
    locale: effectiveLang,
    setLocale,
  }), [effectiveLang, setLocale]);

  return (
    <LocaleContext.Provider value={value}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextType {
  return useContext(LocaleContext);
}

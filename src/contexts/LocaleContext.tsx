import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import i18n from '../lib/i18n';
import { isRTLLanguage, normalizeLang } from '../lib/locale';
import { useTenantConfig } from './TenantConfigContext';
import { updateTenantUiLanguage } from '../lib/tenantConfigService';
import { logger } from '../lib/logger';

const LOCALE_HINT_KEY = 'xsuite_locale_hint';

type Locale = 'en' | 'ar';

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

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const { config, refreshConfig } = useTenantConfig();
  const tenantLang = normalizeLang(config.locale.languageCode);
  const tenantId = config.tenantId;

  const [optimisticLang, setOptimisticLang] = useState<Locale | null>(null);

  const effectiveLang = optimisticLang ?? tenantLang;

  useEffect(() => {
    applyLocaleToDOM(effectiveLang);
    persistLocaleHint(effectiveLang);
  }, [effectiveLang]);

  // Optimistically flip the UI now (DOM + i18n via the effect above), then persist
  // the choice on the tenant and refresh config so it survives reloads and applies
  // on every device. Country continues to drive currency/date/number formats.
  const setLocale = useCallback(async (next: Locale) => {
    setOptimisticLang(next);
    if (!tenantId) return;
    try {
      await updateTenantUiLanguage(tenantId, next);
      await refreshConfig();
    } catch (err) {
      logger.error('Failed to persist UI language:', err);
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

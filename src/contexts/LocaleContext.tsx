import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import i18n from '../lib/i18n';
import { isRTLLanguage, normalizeLang } from '../lib/locale';
import { useTenantConfig } from './TenantConfigContext';

const LOCALE_HINT_KEY = 'xsuite_locale_hint';

type Locale = 'en' | 'ar';

interface LocaleContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextType>({
  locale: 'en',
  setLocale: () => {},
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
  const { config } = useTenantConfig();
  const tenantLang = normalizeLang(config.locale.languageCode);

  const [optimisticLang, setOptimisticLang] = useState<Locale | null>(null);

  const effectiveLang = optimisticLang ?? tenantLang;

  useEffect(() => {
    applyLocaleToDOM(effectiveLang);
    persistLocaleHint(effectiveLang);
  }, [effectiveLang]);

  // 4a is plumbing-only: setLocale is optimistic + persists the anti-flash hint.
  // The per-tenant override (service write + refreshConfig) is a future additive change.
  const setLocale = useCallback((next: Locale) => {
    setOptimisticLang(next);
  }, []);

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

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import type { Theme } from '../types/tenantConfig';
import { DEFAULT_THEME, THEMES } from '../types/tenantConfig';
import { useTenantConfig } from './TenantConfigContext';
import { updateTenantTheme } from '../lib/tenantThemeService';
import { logger } from '../lib/logger';

const THEME_HINT_KEY = 'xsuite_theme_hint';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => Promise<void>;
  isUpdating: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: DEFAULT_THEME,
  setTheme: async () => {},
  isUpdating: false,
});

function applyThemeToDOM(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

function persistThemeHint(theme: Theme): void {
  try {
    localStorage.setItem(THEME_HINT_KEY, theme);
  } catch {
    // Ignore quota / privacy-mode errors — the hint is just an anti-flash optimization.
  }
}

function readThemeHint(): Theme | null {
  try {
    const hint = localStorage.getItem(THEME_HINT_KEY);
    if (hint && (THEMES as readonly string[]).includes(hint)) {
      return hint as Theme;
    }
  } catch {
    // Ignore privacy-mode / disabled-storage errors — fall back to the config theme.
  }
  return null;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { config, isLoading, refreshConfig } = useTenantConfig();
  const tenantTheme = config.theme;
  const tenantId = config.tenantId;

  const [optimisticTheme, setOptimisticTheme] = useState<Theme | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  // Snapshot of the pre-mounted anti-flash theme (main.tsx stamps this onto
  // document.documentElement from the persisted hint before React mounts).
  const [hintTheme] = useState<Theme | null>(() => readThemeHint());

  // While the tenant config is still loading, TenantConfigProvider serves
  // DEFAULT_TENANT_CONFIG (theme: 'royal'). Applying that to the DOM would clobber
  // the hint main.tsx already stamped and flash returning non-royal tenants to
  // Royal on every full reload. Keep the pre-mounted hint until the real config
  // resolves, then switch to the tenant's actual theme.
  const effectiveTheme = optimisticTheme ?? (isLoading ? (hintTheme ?? tenantTheme) : tenantTheme);

  useEffect(() => {
    applyThemeToDOM(effectiveTheme);
    persistThemeHint(effectiveTheme);
  }, [effectiveTheme]);

  const setTheme = useCallback(async (next: Theme) => {
    if (!THEMES.includes(next)) {
      throw new Error(`Invalid theme: ${next}`);
    }
    if (!tenantId) {
      throw new Error('Cannot set theme: no active tenant');
    }
    if (next === effectiveTheme) return;

    setOptimisticTheme(next);
    setIsUpdating(true);
    try {
      await updateTenantTheme(tenantId, next);
      await refreshConfig();
      setOptimisticTheme(null);
    } catch (err) {
      logger.error('setTheme failed; reverting:', err);
      setOptimisticTheme(null);
      throw err;
    } finally {
      setIsUpdating(false);
    }
  }, [tenantId, effectiveTheme, refreshConfig]);

  const value = useMemo(() => ({
    theme: effectiveTheme,
    setTheme,
    isUpdating,
  }), [effectiveTheme, setTheme, isUpdating]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  return useContext(ThemeContext);
}

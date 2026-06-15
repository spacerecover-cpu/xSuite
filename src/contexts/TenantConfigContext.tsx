import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import type { TenantConfig, CurrencyConfig, TaxConfig, DateTimeConfig, LocaleConfig } from '../types/tenantConfig';
import { DEFAULT_TENANT_CONFIG, isResolvedConfig } from '../types/tenantConfig';
import { getTenantConfig, invalidateTenantConfigCache } from '../lib/tenantConfigService';
import { useAuth } from './AuthContext';
import { getPortalTenantIdFromSession } from './PortalAuthContext';
import { logger } from '../lib/logger';
import { isFeatureEnabled } from '../lib/features/registry';
import { CountryConfigError } from '../lib/country/resolveCountryConfig';

interface TenantConfigContextType {
  config: TenantConfig;
  isLoading: boolean;
  refreshConfig: () => Promise<void>;
}

const TenantConfigContext = createContext<TenantConfigContextType>({
  config: DEFAULT_TENANT_CONFIG,
  isLoading: true,
  refreshConfig: async () => {},
});

export function TenantConfigProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  // Resolve tenant_id from staff profile first, falling back to the portal
  // customer session so portal routes inherit tenant config & theme. The
  // portal session is read from sessionStorage so we re-check on focus to
  // pick up login/logout from the portal auth provider that mounts below us.
  const [portalTenantId, setPortalTenantId] = useState<string | null>(() =>
    getPortalTenantIdFromSession()
  );

  useEffect(() => {
    const sync = () => setPortalTenantId(getPortalTenantIdFromSession());
    window.addEventListener('storage', sync);
    window.addEventListener('focus', sync);
    // Re-check on a short interval at startup to catch the login event
    // (sessionStorage writes do not fire 'storage' in the same tab).
    const intervalId = window.setInterval(sync, 1000);
    const stopAfter = window.setTimeout(() => window.clearInterval(intervalId), 30_000);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('focus', sync);
      window.clearInterval(intervalId);
      window.clearTimeout(stopAfter);
    };
  }, []);

  const tenantId = profile?.tenant_id ?? portalTenantId ?? undefined;
  const [config, setConfig] = useState<TenantConfig>(DEFAULT_TENANT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    if (!tenantId) {
      setConfig(DEFAULT_TENANT_CONFIG);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setConfigError(null);
      const tenantConfig = await getTenantConfig(tenantId);
      if (!isResolvedConfig(tenantConfig)) {
        // Required jurisdiction keys never resolved → block, don't render US (D2/D3).
        setConfigError('This tenant is not configured for its country.');
        setConfig(DEFAULT_TENANT_CONFIG);
        return;
      }
      setConfig(tenantConfig);
    } catch (err) {
      if (err instanceof CountryConfigError) {
        logger.error('Tenant country config unresolved (fail-loud):', err);
        setConfigError('This tenant is not configured for its country.');
        setConfig(DEFAULT_TENANT_CONFIG);
        return;
      }
      logger.error('Failed to load tenant config:', err);
      setConfig(DEFAULT_TENANT_CONFIG);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const refreshConfig = useCallback(async () => {
    if (tenantId) {
      invalidateTenantConfigCache(tenantId);
    }
    await loadConfig();
  }, [tenantId, loadConfig]);

  const value = useMemo(() => ({
    config,
    isLoading,
    refreshConfig,
  }), [config, isLoading, refreshConfig]);

  if (configError && tenantId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-6 text-center">
        <div className="max-w-md">
          <h1 className="text-lg font-semibold text-danger">Tenant not configured</h1>
          <p className="mt-2 text-sm text-surface-muted">{configError}</p>
        </div>
      </div>
    );
  }

  return (
    <TenantConfigContext.Provider value={value}>
      {children}
    </TenantConfigContext.Provider>
  );
}

export function useTenantConfig(): TenantConfigContextType {
  return useContext(TenantConfigContext);
}

export function useCurrencyConfig(): CurrencyConfig {
  const { config } = useTenantConfig();
  return config.currency;
}

export function useTaxConfig(): TaxConfig {
  const { config } = useTenantConfig();
  return config.tax;
}

export function useDateTimeConfig(): DateTimeConfig {
  const { config } = useTenantConfig();
  return config.dateTime;
}

export function useLocaleConfig(): LocaleConfig {
  const { config } = useTenantConfig();
  return config.locale;
}

/**
 * Tenant Feature Management — resolve a single feature key against this tenant's
 * overrides + the code registry defaults. Distinct from the plan-entitlement
 * `useFeature` in hooks/useFeatureGate.ts. Defaults on (backward compatible)
 * for any feature the tenant hasn't explicitly disabled.
 */
export function useTenantFeature(key: string): boolean {
  const { config } = useTenantConfig();
  return isFeatureEnabled(config.featureFlags, key);
}

export function useTenantFeatures(): {
  isEnabled: (key: string) => boolean;
  flags: Record<string, boolean>;
  isLoading: boolean;
} {
  const { config, isLoading } = useTenantConfig();
  return useMemo(
    () => ({
      isEnabled: (key: string) => isFeatureEnabled(config.featureFlags, key),
      flags: config.featureFlags,
      isLoading,
    }),
    [config.featureFlags, isLoading],
  );
}

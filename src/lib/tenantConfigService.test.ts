import { describe, it, expect, vi } from 'vitest';

// mapRowToConfig is pure, but importing tenantConfigService.ts pulls in
// supabaseClient (which throws without env vars). Mock it so the pure mapper is
// importable in the node test project — same pattern as the sibling service tests.
vi.mock('./supabaseClient', () => ({ supabase: {} }));
vi.mock('./logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { mapRowToConfig, resolveTenantConfigFromLayers } from './tenantConfigService';
import { REQUIRED_SENTINEL } from '../types/tenantConfig';
import { CountryConfigError } from './country/resolveCountryConfig';
import { buildConfigLayers } from './country/buildConfigLayers';

describe('mapRowToConfig fail-loud (D2/D3)', () => {
  it('uses REQUIRED_SENTINEL — not USD/en-US — when currency/locale are absent', () => {
    const cfg = mapRowToConfig({ id: 't1', name: 'Lab', country: null }, null);
    expect(cfg.currency.code).toBe(REQUIRED_SENTINEL);
    expect(cfg.locale.localeCode).toBe(REQUIRED_SENTINEL);
  });
  it('passes through real resolved values', () => {
    const cfg = mapRowToConfig(
      { id: 't1', name: 'Lab', currency_code: 'OMR', locale_code: 'ar-OM', country: { code: 'OM', name: 'Oman' } },
      null,
    );
    expect(cfg.currency.code).toBe('OMR');
    expect(cfg.locale.localeCode).toBe('ar-OM');
  });
});

describe('resolveTenantConfigFromLayers — engine path (fail-loud, no US literals)', () => {
  const baseRow = { id: 't1', name: 'Lab', theme: 'royal' };

  it('resolves OMR/VAT for a configured Oman tenant via the snapshot bag', () => {
    const layers = buildConfigLayers(
      {
        resolved_country_config: {
          'currency.code': 'OMR',
          'tax.label': 'VAT',
          'tax.default_rate': 5,
          'number_format.amount_in_words_minor_units': 3,
          'locale.code': 'ar-OM',
          'datetime.date_format': 'dd/MM/yyyy',
          'datetime.timezone': 'Asia/Muscat',
        },
        country_config_overrides: {},
      },
      null,
    );
    const cfg = resolveTenantConfigFromLayers(baseRow, layers);
    expect(cfg.currency.code).toBe('OMR');
    expect(cfg.tax.label).toBe('VAT');
    expect(cfg.locale.localeCode).toBe('ar-OM');
  });

  it('THROWS CountryConfigError (not USD/$) when the required currency.code is unresolved', () => {
    const layers = buildConfigLayers({ resolved_country_config: {}, country_config_overrides: {} }, null);
    expect(() => resolveTenantConfigFromLayers(baseRow, layers)).toThrow(CountryConfigError);
  });

  it('a tenant DISPLAY override beats the country snapshot for a tenant-chosen key', () => {
    const layers = buildConfigLayers(
      {
        resolved_country_config: {
          'currency.code': 'OMR', 'tax.label': 'VAT', 'tax.default_rate': 5,
          'number_format.amount_in_words_minor_units': 3, 'locale.code': 'ar-OM',
          'datetime.date_format': 'dd/MM/yyyy', 'datetime.timezone': 'Asia/Muscat',
        },
        country_config_overrides: { 'datetime.date_format': 'yyyy-MM-dd' },
      },
      null,
    );
    expect(resolveTenantConfigFromLayers(baseRow, layers).dateTime.dateFormat).toBe('yyyy-MM-dd');
  });
});

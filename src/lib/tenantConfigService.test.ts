import { describe, it, expect, vi, beforeEach } from 'vitest';

// mapRowToConfig is pure, but importing tenantConfigService.ts pulls in
// supabaseClient (which throws without env vars). Mock it so the pure mapper is
// importable in the node test project — same pattern as the sibling service tests.
// rpc is a vi.fn so the override-writer tests can assert the call.
vi.mock('./supabaseClient', () => ({ supabase: { rpc: vi.fn() } }));
vi.mock('./logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  mapRowToConfig,
  resolveTenantConfigFromLayers,
  setTenantConfigOverrides,
  resetTenantConfigOverrides,
} from './tenantConfigService';
import { supabase } from './supabaseClient';
import { REQUIRED_SENTINEL } from '../types/tenantConfig';
import { CountryConfigError } from './country/resolveCountryConfig';
import { buildConfigLayers } from './country/buildConfigLayers';

const rpcMock = supabase.rpc as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => {
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: {}, error: null });
});

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
    );
    const cfg = resolveTenantConfigFromLayers(baseRow, layers);
    expect(cfg.currency.code).toBe('OMR');
    expect(cfg.tax.label).toBe('VAT');
    expect(cfg.locale.localeCode).toBe('ar-OM');
  });

  it("resolves digitGrouping '3;2' from the number_format.digit_grouping snapshot key (IN)", () => {
    const layers = buildConfigLayers({
      resolved_country_config: {
        'currency.code': 'INR', 'tax.label': 'GST', 'tax.default_rate': 18,
        'locale.code': 'en-IN', 'datetime.date_format': 'dd/MM/yyyy', 'datetime.timezone': 'Asia/Kolkata',
        'number_format.digit_grouping': '3;2',
      },
      country_config_overrides: {},
    });
    const cfg = resolveTenantConfigFromLayers(baseRow, layers);
    expect(cfg.currency.digitGrouping).toBe('3;2');
  });

  it("defaults digitGrouping to '3' when the snapshot lacks the key (legacy tenants)", () => {
    const layers = buildConfigLayers({
      resolved_country_config: {
        'currency.code': 'OMR', 'tax.label': 'VAT', 'tax.default_rate': 5,
        'locale.code': 'ar-OM', 'datetime.date_format': 'dd/MM/yyyy', 'datetime.timezone': 'Asia/Muscat',
      },
      country_config_overrides: {},
    });
    const cfg = resolveTenantConfigFromLayers(baseRow, layers);
    expect(cfg.currency.digitGrouping).toBe('3');
  });

  it('THROWS CountryConfigError (not USD/$) when the required currency.code is unresolved', () => {
    const layers = buildConfigLayers({ resolved_country_config: {}, country_config_overrides: {} });
    expect(() => resolveTenantConfigFromLayers(baseRow, layers)).toThrow(CountryConfigError);
  });

  it('falls back to the embedded geo_countries row for country name/code when the snapshot lacks country.* keys', () => {
    const layers = buildConfigLayers(
      {
        resolved_country_config: {
          'currency.code': 'OMR', 'tax.label': 'VAT', 'tax.default_rate': 5,
          'number_format.amount_in_words_minor_units': 3, 'locale.code': 'ar-OM',
          'datetime.date_format': 'dd/MM/yyyy', 'datetime.timezone': 'Asia/Muscat',
        },
        country_config_overrides: {},
      },
    );
    const cfg = resolveTenantConfigFromLayers(
      { ...baseRow, country: { code: 'OM', name: 'Oman' } },
      layers,
    );
    expect(cfg.countryCode).toBe('OM');
    expect(cfg.countryName).toBe('Oman');
  });

  it('falls back to the embedded geo_countries row for tax number placeholder + postal code label when the snapshot lacks those keys', () => {
    // The _apply_country_config snapshot builder writes tax.number_format but never
    // tax.number_placeholder, and never address.postal_code_label — so those must
    // resolve from the joined geo_countries row, not the generic fallbacks.
    const layers = buildConfigLayers(
      {
        resolved_country_config: {
          'currency.code': 'INR', 'tax.label': 'GST', 'tax.default_rate': 18,
          'number_format.amount_in_words_minor_units': 2, 'locale.code': 'en-IN',
          'datetime.date_format': 'dd/MM/yyyy', 'datetime.timezone': 'Asia/Kolkata',
        },
        country_config_overrides: {},
      },
    );
    const cfg = resolveTenantConfigFromLayers(
      {
        ...baseRow,
        country: {
          code: 'IN', name: 'India',
          tax_number_placeholder: '22AAAAA0000A1Z5',
          postal_code_label: 'PIN Code',
        },
      },
      layers,
    );
    expect(cfg.tax.numberPlaceholder).toBe('22AAAAA0000A1Z5');
    expect(cfg.locale.postalCodeLabel).toBe('PIN Code');
  });

  it('defaults currency display preferences to symbol/minus when no layer sets them', () => {
    const layers = buildConfigLayers(
      {
        resolved_country_config: {
          'currency.code': 'OMR', 'tax.label': 'VAT', 'tax.default_rate': 5,
          'number_format.amount_in_words_minor_units': 3, 'locale.code': 'ar-OM',
          'datetime.date_format': 'dd/MM/yyyy', 'datetime.timezone': 'Asia/Muscat',
        },
        country_config_overrides: {},
      },
    );
    const cfg = resolveTenantConfigFromLayers(baseRow, layers);
    expect(cfg.currency.displayMode).toBe('symbol');
    expect(cfg.currency.negativeFormat).toBe('minus');
  });

  it('threads a tenant currency.display_mode / negative_format override into cfg.currency', () => {
    const layers = buildConfigLayers(
      {
        resolved_country_config: {
          'currency.code': 'OMR', 'tax.label': 'VAT', 'tax.default_rate': 5,
          'number_format.amount_in_words_minor_units': 3, 'locale.code': 'ar-OM',
          'datetime.date_format': 'dd/MM/yyyy', 'datetime.timezone': 'Asia/Muscat',
        },
        country_config_overrides: {
          'currency.display_mode': 'symbol_code',
          'currency.negative_format': 'parentheses',
        },
      },
    );
    const cfg = resolveTenantConfigFromLayers(baseRow, layers);
    expect(cfg.currency.displayMode).toBe('symbol_code');
    expect(cfg.currency.negativeFormat).toBe('parentheses');
  });

  it('resolves the 7 cosmetic keys from the country snapshot (byte-identical to raw reads)', () => {
    const layers = buildConfigLayers(
      {
        resolved_country_config: {
          'currency.code': 'OMR', 'tax.label': 'VAT', 'tax.default_rate': 5,
          'number_format.amount_in_words_minor_units': 3, 'locale.code': 'ar-OM',
          'datetime.date_format': 'dd/MM/yyyy', 'datetime.timezone': 'Asia/Muscat',
          'currency.position': 'after', 'currency.decimal_places': 3,
          'currency.decimal_separator': '.', 'currency.thousands_separator': ' ',
          'datetime.time_format': '12h', 'datetime.week_starts_on': 6, 'datetime.fiscal_year_start': '04-01',
        },
        country_config_overrides: {},
      },
    );
    const cfg = resolveTenantConfigFromLayers(baseRow, layers);
    expect(cfg.currency.position).toBe('after');
    expect(cfg.currency.decimalPlaces).toBe(3);
    expect(cfg.currency.thousandsSeparator).toBe(' ');
    expect(cfg.dateTime.timeFormat).toBe('12h');
    expect(cfg.dateTime.weekStartsOn).toBe(6);
    expect(cfg.dateTime.fiscalYearStart).toBe('04-01');
  });

  it('falls back to coded defaults when the snapshot omits a cosmetic key (no throw)', () => {
    const layers = buildConfigLayers(
      {
        resolved_country_config: {
          'currency.code': 'OMR', 'tax.label': 'VAT', 'tax.default_rate': 5,
          'number_format.amount_in_words_minor_units': 3, 'locale.code': 'ar-OM',
          'datetime.date_format': 'dd/MM/yyyy', 'datetime.timezone': 'Asia/Muscat',
        },
        country_config_overrides: {},
      },
    );
    const cfg = resolveTenantConfigFromLayers(baseRow, layers);
    expect(cfg.currency.position).toBe('before');
    expect(cfg.currency.decimalPlaces).toBe(2);
    expect(cfg.dateTime.timeFormat).toBe('24h');
    expect(cfg.dateTime.weekStartsOn).toBe(0);
    expect(cfg.dateTime.fiscalYearStart).toBe('01-01');
  });

  it('a tenant override of a cosmetic key wins over the snapshot', () => {
    const layers = buildConfigLayers(
      {
        resolved_country_config: {
          'currency.code': 'OMR', 'tax.label': 'VAT', 'tax.default_rate': 5,
          'number_format.amount_in_words_minor_units': 3, 'locale.code': 'ar-OM',
          'datetime.date_format': 'dd/MM/yyyy', 'datetime.timezone': 'Asia/Muscat',
          'currency.position': 'before',
        },
        country_config_overrides: { 'currency.position': 'after', 'datetime.time_format': '12h' },
      },
    );
    const cfg = resolveTenantConfigFromLayers(baseRow, layers);
    expect(cfg.currency.position).toBe('after');
    expect(cfg.dateTime.timeFormat).toBe('12h');
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
    );
    expect(resolveTenantConfigFromLayers(baseRow, layers).dateTime.dateFormat).toBe('yyyy-MM-dd');
  });
});

describe('setTenantConfigOverrides — validated write path', () => {
  it('rejects an unknown registry key before calling the RPC', async () => {
    await expect(setTenantConfigOverrides('t1', { 'nope.nope': 1 })).rejects.toThrow(/unknown/i);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('rejects a locked (statutory/required) key', async () => {
    await expect(setTenantConfigOverrides('t1', { 'currency.code': 'EUR' })).rejects.toThrow(/locked|statutory|required/i);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('rejects a value failing the registry schema', async () => {
    await expect(setTenantConfigOverrides('t1', { 'currency.position': 'left' })).rejects.toThrow(/invalid/i);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('calls the merge RPC with the validated batch', async () => {
    await setTenantConfigOverrides('t1', { 'currency.position': 'after', 'currency.display_mode': 'iso_code' });
    expect(rpcMock).toHaveBeenCalledWith('set_tenant_country_config_overrides', {
      p_tenant_id: 't1',
      p_overrides: { 'currency.position': 'after', 'currency.display_mode': 'iso_code' },
    });
  });

  it('throws when the RPC returns an error', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(setTenantConfigOverrides('t1', { 'currency.position': 'after' })).rejects.toBeTruthy();
  });
});

describe('resetTenantConfigOverrides', () => {
  it('calls the reset RPC with the keys', async () => {
    await resetTenantConfigOverrides('t1', ['currency.position', 'datetime.time_format']);
    expect(rpcMock).toHaveBeenCalledWith('reset_tenant_country_config_overrides', {
      p_tenant_id: 't1',
      p_keys: ['currency.position', 'datetime.time_format'],
    });
  });
});

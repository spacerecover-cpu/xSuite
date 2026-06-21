import { describe, it, expect } from 'vitest';
import { REQUIRED_SENTINEL } from '../../types/tenantConfig';
import { buildConfigLayers } from './buildConfigLayers';

describe('buildConfigLayers — snapshot (country) + overrides (tenant), no accounting_locale fold', () => {
  it('puts resolved_country_config in the country layer and country_config_overrides in the tenant layer', () => {
    const layers = buildConfigLayers({
      resolved_country_config: { 'datetime.date_format': 'DD/MM/YYYY', 'currency.code': 'OMR' },
      country_config_overrides: { 'datetime.date_format': 'YYYY.MM.DD' }, // tenant deliberately overrode display
    });
    expect(layers.country).toEqual({ 'datetime.date_format': 'DD/MM/YYYY', 'currency.code': 'OMR' });
    expect(layers.tenant).toEqual({ 'datetime.date_format': 'YYYY.MM.DD' });
  });

  it('tenant layer is EXACTLY the overrides (the accounting_locale fold has been removed)', () => {
    const layers = buildConfigLayers({
      resolved_country_config: { 'currency.code': 'OMR' },
      country_config_overrides: { 'currency.display_mode': 'iso_code', 'currency.position': 'after' },
    });
    expect(layers.tenant).toEqual({ 'currency.display_mode': 'iso_code', 'currency.position': 'after' });
  });

  it('an empty snapshot yields an empty country layer (required key → REQUIRED_SENTINEL → resolver throws)', () => {
    const layers = buildConfigLayers({ resolved_country_config: {}, country_config_overrides: {} });
    expect(layers.country).toEqual({});
    expect(layers.tenant).toEqual({});
    expect(REQUIRED_SENTINEL).toBeTypeOf('symbol');
  });

  it('treats missing/invalid bags as empty objects', () => {
    const layers = buildConfigLayers({ resolved_country_config: null, country_config_overrides: undefined });
    expect(layers.country).toEqual({});
    expect(layers.tenant).toEqual({});
  });
});

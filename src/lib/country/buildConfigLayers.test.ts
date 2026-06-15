import { describe, it, expect } from 'vitest';
import { REQUIRED_SENTINEL } from '../../types/tenantConfig';
import { buildConfigLayers } from './buildConfigLayers';

describe('buildConfigLayers — snapshot-vs-live split (DISPLAY config only)', () => {
  it('folds resolved_country_config into the country layer and country_config_overrides into the tenant layer', () => {
    const layers = buildConfigLayers(
      {
        resolved_country_config: { 'datetime.date_format': 'DD/MM/YYYY', 'currency.code': 'OMR' },
        country_config_overrides: { 'datetime.date_format': 'YYYY.MM.DD' }, // tenant deliberately overrode display
      },
      null,
    );
    expect(layers.country).toEqual({ 'datetime.date_format': 'DD/MM/YYYY', 'currency.code': 'OMR' });
    expect(layers.tenant).toMatchObject({ 'datetime.date_format': 'YYYY.MM.DD' });
  });

  it('folds the default accounting_locale at the TENANT altitude (above country, below explicit overrides)', () => {
    const layers = buildConfigLayers(
      { resolved_country_config: { 'currency.code': 'OMR' }, country_config_overrides: {} },
      { currency_code: 'EUR', date_format: 'DD-MM-YYYY', locale_code: 'de-DE' },
    );
    // accounting_locale projects into the tenant layer as a synthetic override map
    expect(layers.tenant).toMatchObject({
      'currency.code': 'EUR',
      'datetime.date_format': 'DD-MM-YYYY',
      'locale.code': 'de-DE',
    });
  });

  it('an explicit country_config_override beats the folded accounting_locale (override is most-specific within the tenant layer)', () => {
    const layers = buildConfigLayers(
      {
        resolved_country_config: { 'currency.code': 'OMR' },
        country_config_overrides: { 'datetime.date_format': 'OVERRIDE' },
      },
      { date_format: 'FROM_LOCALE' },
    );
    expect(layers.tenant?.['datetime.date_format']).toBe('OVERRIDE');
  });

  it('an empty snapshot yields an empty country layer (so a required key resolves to REQUIRED_SENTINEL → resolver throws)', () => {
    const layers = buildConfigLayers({ resolved_country_config: {}, country_config_overrides: {} }, null);
    expect(layers.country).toEqual({});
    // currency.code unresolved ⇒ REQUIRED_SENTINEL is the coded default; the resolver
    // (Task A) throws — asserted in resolveCountryConfig.test.ts, referenced here.
    expect(REQUIRED_SENTINEL).toBeTypeOf('symbol');
  });
});

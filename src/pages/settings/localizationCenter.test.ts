import { describe, it, expect } from 'vitest';
import {
  CURRENCY_KEYS,
  DATETIME_KEYS,
  EDITABLE_KEYS,
  collectDirtyOverrides,
  buildPreviewCurrencyConfig,
  type DraftValues,
} from './localizationCenter';
import { REGISTRY_BY_KEY, isConfigKeyLocked } from '../../lib/country/registry';
import type { CurrencyConfig } from '../../types/tenantConfig';

const RESOLVED: DraftValues = {
  'currency.display_mode': 'symbol',
  'currency.negative_format': 'minus',
  'currency.position': 'before',
  'currency.decimal_places': 3,
  'currency.decimal_separator': '.',
  'currency.thousands_separator': ',',
  'datetime.date_format': 'dd/MM/yyyy',
  'datetime.time_format': '24h',
  'datetime.week_starts_on': 0,
  'datetime.fiscal_year_start': '01-01',
  'datetime.timezone': 'Asia/Muscat',
};

const baseCurrency: CurrencyConfig = {
  code: 'OMR',
  symbol: 'ر.ع.',
  name: 'Omani Rial',
  decimalPlaces: 3,
  decimalSeparator: '.',
  thousandsSeparator: ',',
  position: 'before',
  displayMode: 'symbol',
  negativeFormat: 'minus',
};

describe('Localization Center — editable key set integrity', () => {
  it('every editable key is a real registry key (catches typos / renames)', () => {
    for (const key of EDITABLE_KEYS) {
      expect(REGISTRY_BY_KEY[key], `missing registry key ${key}`).toBeTruthy();
    }
  });

  it('no editable key is locked (statutory/required) — never offer a write the server rejects', () => {
    for (const key of EDITABLE_KEYS) {
      expect(isConfigKeyLocked(key), `${key} must be tenant-overridable`).toBe(false);
    }
  });

  it('groups currency and datetime keys without overlap', () => {
    expect(EDITABLE_KEYS).toEqual([...CURRENCY_KEYS, ...DATETIME_KEYS]);
    expect(new Set(EDITABLE_KEYS).size).toBe(EDITABLE_KEYS.length);
  });
});

describe('collectDirtyOverrides', () => {
  it('returns an empty batch when the draft equals the resolved config', () => {
    expect(collectDirtyOverrides(RESOLVED, RESOLVED)).toEqual({});
  });

  it('emits only the keys whose value changed', () => {
    const draft: DraftValues = {
      ...RESOLVED,
      'currency.display_mode': 'symbol_code',
      'currency.position': 'after',
    };
    expect(collectDirtyOverrides(draft, RESOLVED)).toEqual({
      'currency.display_mode': 'symbol_code',
      'currency.position': 'after',
    });
  });

  it('emits numeric keys (decimal_places, week_starts_on) as numbers, not strings', () => {
    const draft: DraftValues = {
      ...RESOLVED,
      'currency.decimal_places': 2,
      'datetime.week_starts_on': 6,
    };
    const batch = collectDirtyOverrides(draft, RESOLVED);
    expect(batch['currency.decimal_places']).toBe(2);
    expect(typeof batch['currency.decimal_places']).toBe('number');
    expect(batch['datetime.week_starts_on']).toBe(6);
    expect(typeof batch['datetime.week_starts_on']).toBe('number');
  });
});

describe('buildPreviewCurrencyConfig', () => {
  it('overlays the currency portion of the draft onto the resolved base', () => {
    const draft: DraftValues = {
      ...RESOLVED,
      'currency.display_mode': 'iso_code',
      'currency.negative_format': 'parentheses',
      'currency.position': 'after',
      'currency.decimal_places': 2,
      'currency.decimal_separator': ',',
      'currency.thousands_separator': '.',
    };
    const preview = buildPreviewCurrencyConfig(baseCurrency, draft);
    expect(preview).toMatchObject({
      code: 'OMR',
      symbol: 'ر.ع.',
      displayMode: 'iso_code',
      negativeFormat: 'parentheses',
      position: 'after',
      decimalPlaces: 2,
      decimalSeparator: ',',
      thousandsSeparator: '.',
    });
  });

  it('keeps the immutable identity fields (code/symbol/name) from the base', () => {
    const draft: DraftValues = { ...RESOLVED, 'currency.display_mode': 'symbol_code' };
    const preview = buildPreviewCurrencyConfig(baseCurrency, draft);
    expect(preview.code).toBe(baseCurrency.code);
    expect(preview.symbol).toBe(baseCurrency.symbol);
    expect(preview.name).toBe(baseCurrency.name);
  });
});

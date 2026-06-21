import { describe, it, expect } from 'vitest';
import { assertOnboardableCountry, ProvisionGuardError } from './provisionGuards';

const READY = {
  name: 'Oman',
  currency_code: 'OMR',
  locale_code: 'ar-OM',
  date_format: 'DD/MM/YYYY',
  timezone: 'Asia/Muscat',
  config_status: 'formatting_ready',
};

describe('assertOnboardableCountry', () => {
  it('passes a formatting-ready country with all required formatting fields', () => {
    expect(() => assertOnboardableCountry(READY)).not.toThrow();
  });

  it('throws 422 when config_status is still a stub (no US fabrication)', () => {
    try {
      assertOnboardableCountry({ ...READY, config_status: 'stub' });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ProvisionGuardError);
      expect((e as ProvisionGuardError).status).toBe(422);
    }
  });

  it('throws 422 when currency is missing or malformed', () => {
    expect(() => assertOnboardableCountry({ ...READY, currency_code: null })).toThrow(ProvisionGuardError);
    expect(() => assertOnboardableCountry({ ...READY, currency_code: '' })).toThrow(ProvisionGuardError);
    expect(() => assertOnboardableCountry({ ...READY, currency_code: '$' })).toThrow(ProvisionGuardError);
  });

  it('throws 422 when locale / date / timezone is missing', () => {
    expect(() => assertOnboardableCountry({ ...READY, locale_code: null })).toThrow(ProvisionGuardError);
    expect(() => assertOnboardableCountry({ ...READY, date_format: null })).toThrow(ProvisionGuardError);
    expect(() => assertOnboardableCountry({ ...READY, timezone: null })).toThrow(ProvisionGuardError);
  });

  it('throws 422 with the not-yet-available message when the whole row is null', () => {
    try {
      assertOnboardableCountry(null);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ProvisionGuardError);
      expect((e as ProvisionGuardError).status).toBe(422);
      expect((e as ProvisionGuardError).message).toMatch(/not yet available/i);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { shouldEmitZatcaQr } from './einvoiceRouting';

describe('shouldEmitZatcaQr (D11)', () => {
  it('emits only for a Saudi VAT entity', () => {
    expect(shouldEmitZatcaQr({ taxSystem: 'VAT', countryCode: 'SA' })).toBe(true);
  });
  it('never emits for a non-Saudi country even with a manual tax bar enabled', () => {
    expect(shouldEmitZatcaQr({ taxSystem: 'VAT', countryCode: 'OM' })).toBe(false);
    expect(shouldEmitZatcaQr({ taxSystem: 'VAT', countryCode: 'AE' })).toBe(false);
  });
  it('never emits for a non-VAT system', () => {
    expect(shouldEmitZatcaQr({ taxSystem: 'SALES_TAX', countryCode: 'SA' })).toBe(false);
  });
});

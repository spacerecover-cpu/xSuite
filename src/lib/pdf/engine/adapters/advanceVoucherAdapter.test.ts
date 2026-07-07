import { describe, it, expect } from 'vitest';
import { toAdvanceVoucherEngineData } from './advanceVoucherAdapter';
import type { DocumentTemplateConfig } from '../../templateConfig';

const config = {
  sections: [{ key: 'lineItems', columns: [{ key: 'description', visible: true, label: 'Description' }] }],
  locale: { decimalPlaces: 2, decimalSeparator: '.', thousandsSeparator: ',' },
} as unknown as DocumentTemplateConfig;

describe('toAdvanceVoucherEngineData', () => {
  it('maps a receipt voucher into engine data with the voucher number + taxable/tax rows', () => {
    const data = toAdvanceVoucherEngineData({
      voucher_type: 'receipt', voucher_number: 'RV/25-26/0001', voucher_date: '2026-04-10',
      currency_symbol: '₹', currency_position: 'before', decimal_places: 2,
      customer_name: 'Acme Data', taxable_amount: 4237.29, tax_amount: 762.71, total_amount: 5000,
      original_voucher_number: null,
    }, config);
    expect(data.documentTitle.en).toBe('RECEIPT VOUCHER');
    expect(data.meta.some((m) => m.value === 'RV/25-26/0001')).toBe(true);
    expect(data.totals?.some((t) => t.value.includes('5,000'))).toBe(true);
  });

  it('titles a refund voucher and shows the original receipt-voucher reference', () => {
    const data = toAdvanceVoucherEngineData({
      voucher_type: 'refund', voucher_number: 'RFV/25-26/0001', voucher_date: '2026-05-01',
      currency_symbol: '₹', currency_position: 'before', decimal_places: 2,
      customer_name: 'Acme Data', taxable_amount: 4237.29, tax_amount: 762.71, total_amount: 5000,
      original_voucher_number: 'RV/25-26/0001',
    }, config);
    expect(data.documentTitle.en).toBe('REFUND VOUCHER');
    expect(data.meta.some((m) => m.value === 'RV/25-26/0001')).toBe(true);
  });
});

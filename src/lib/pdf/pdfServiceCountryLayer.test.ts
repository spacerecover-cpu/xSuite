import { describe, it, expect, vi } from 'vitest';

vi.mock('./engine/profileResolver', () => ({
  resolveComplianceRenderInputs: vi.fn(async () => ({
    facts: {
      code: 'OM', taxSystem: 'VAT', taxLabel: 'VAT', taxNumberLabel: 'VATIN',
      taxInvoiceRequired: true, languageCode: 'ar', decimalPlaces: 3,
      dateFormat: 'DD/MM/YYYY', decimalSeparator: '.', thousandsSeparator: ',', digitGrouping: '3',
    },
    profile: (await import('../regimes/gcc_tax_invoice')).gccTaxInvoiceProfile,
    sellerRegistered: true,
    sellerTaxNumber: 'OM1100000000',
  })),
  clearComplianceRenderCache: vi.fn(),
}));

import { resolveCountryLayer } from './pdfService';
import { resolveComplianceRenderInputs } from './engine/profileResolver';

describe('pdfService country layer (R4)', () => {
  it('builds a profile-titled override for financial doc types', async () => {
    const layer = await resolveCountryLayer('invoice');
    expect(layer?.labels?.documentTitle).toEqual({ en: 'TAX INVOICE', ar: 'فاتورة ضريبية' });
    expect(layer?.taxBar?.enabled).toBe(true);
    expect(layer?.locale?.decimalPlaces).toBe(3);
  });

  it('builds a facts-only override for non-financial doc types', async () => {
    const layer = await resolveCountryLayer(null);
    expect(layer?.labels?.documentTitle).toBeUndefined();
    expect(layer?.locale?.dateFormat).toBe('DD/MM/YYYY');
  });

  it('returns undefined (identity layer) when the tenant has no resolvable country', async () => {
    vi.mocked(resolveComplianceRenderInputs).mockResolvedValueOnce({
      facts: null,
      profile: (await import('../regimes/gcc_tax_invoice')).gccTaxInvoiceProfile,
      sellerRegistered: false,
      sellerTaxNumber: null,
    });

    const layer = await resolveCountryLayer('invoice');
    expect(layer).toBeUndefined();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../lib/pdf/engine/profileResolver', () => ({
  resolveComplianceRenderInputs: vi.fn(async () => ({
    facts: {
      code: 'OM', taxSystem: 'VAT', taxLabel: 'VAT', taxNumberLabel: 'VATIN',
      taxInvoiceRequired: true, languageCode: 'ar', decimalPlaces: 3,
      dateFormat: 'DD/MM/YYYY', decimalSeparator: '.', thousandsSeparator: ',', digitGrouping: '3',
    },
    profile: (await vi.importActual<typeof import('../lib/regimes/gcc_tax_invoice')>('../lib/regimes/gcc_tax_invoice')).gccTaxInvoiceProfile,
    sellerRegistered: true, sellerTaxNumber: 'OM1100000000',
  })),
  clearComplianceRenderCache: vi.fn(),
}));
vi.mock('../lib/pdf/dataFetcher', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchDocumentTaxLines: vi.fn(async () => [{
    line_item_id: null, component_code: 'VAT', component_label: 'VAT 5%', rate: 5,
    taxable_base: 1440, tax_amount: 72, tax_treatment: 'standard',
    treatment_reason_code: null, sequence: 0, backfilled: false, rule_trace: null,
  }]),
}));

import { useDocumentCompliance } from './useDocumentCompliance';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('useDocumentCompliance', () => {
  it('exposes the profile title, band label and one tax row per component', async () => {
    const { result } = renderHook(
      () => useDocumentCompliance('invoice', 'inv-1', { taxRate: 5, taxAmount: 72 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.title.en).toBe('TAX INVOICE');
    expect(result.current.taxBandLabel).toBe('VATIN');
    expect(result.current.sellerTaxNumber).toBe('OM1100000000');
    expect(result.current.taxRows).toEqual([{ label: 'VAT 5%', amount: 72 }]);
  });

  it('falls back to the stored header scalar for drafts/legacy docs', async () => {
    const { fetchDocumentTaxLines } = await import('../lib/pdf/dataFetcher');
    vi.mocked(fetchDocumentTaxLines).mockResolvedValueOnce([]);
    const { result } = renderHook(
      () => useDocumentCompliance('invoice', 'inv-legacy', { taxRate: 5, taxAmount: 4.75 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.taxRows).toEqual([{ label: 'VAT 5%', amount: 4.75 }]);
  });

  it('derives the title and band from countryTemplateOverride, not profile.documentTitle directly', async () => {
    // AD-2 choke-point proof: same facts/profile/sellerRegistered fed straight into
    // countryTemplateOverride (the Task 6 choke point) must equal what the hook exposes.
    const { countryTemplateOverride } = await import('../lib/pdf/engine/countryConfig');
    const { resolveComplianceRenderInputs } = await import('../lib/pdf/engine/profileResolver');
    const inputs = await resolveComplianceRenderInputs();
    const expectedOverride = countryTemplateOverride(inputs.facts!, {
      profile: inputs.profile,
      sellerRegistered: inputs.sellerRegistered,
      docType: 'invoice',
    });

    const { result } = renderHook(
      () => useDocumentCompliance('invoice', 'inv-1', { taxRate: 5, taxAmount: 72 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.title.en).toBe(expectedOverride.labels!.documentTitle!.en);
    expect(result.current.title.ar).toBe(expectedOverride.labels!.documentTitle!.ar);
    expect(result.current.taxBandLabel).toBe(expectedOverride.taxBar!.label!.en);
  });
});

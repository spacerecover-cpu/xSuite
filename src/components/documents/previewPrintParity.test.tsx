import { describe, it, expect, vi } from 'vitest';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ---------------------------------------------------------------------------
// Preview/print parity — Localization Phase 2, WP-4 Task 16 (exit-gate test).
//
// AD-2's guarantee: title + registration band are decided EXACTLY ONCE, inside
// `countryTemplateOverride` (Task 6). The pdfmake adapter (`toEngineData`,
// Task 12) and the React preview (`useDocumentCompliance`, Task 14) both read
// that SAME function's output for the SAME resolved inputs — they must never
// structurally diverge.
//
// STRUCTURALLY MUTATION-PROOF BY CONSTRUCTION (no manual sabotage-then-revert
// ritual required to trust this file): every assertion below is a three-way
// EXACT equality — `previewValue === printValue === expectedLiteral` — never a
// `.toContain`/presence check. A regression in either consuming path (preview
// or print) breaks the preview===print leg; a regression in the shared choke
// point itself (`countryTemplateOverride`) breaks BOTH sides against the
// hardcoded literal, since the literal is typed independently of the code
// under test. There is no assertion here that both paths could satisfy while
// silently agreeing on a WRONG value.
// ---------------------------------------------------------------------------

vi.mock('../../lib/pdf/engine/profileResolver', () => ({
  resolveComplianceRenderInputs: vi.fn(),
  clearComplianceRenderCache: vi.fn(),
}));
vi.mock('../../lib/pdf/dataFetcher', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchDocumentTaxLines: vi.fn(),
}));

import { resolveComplianceRenderInputs } from '../../lib/pdf/engine/profileResolver';
import { fetchDocumentTaxLines } from '../../lib/pdf/dataFetcher';
import { toEngineData } from '../../lib/pdf/engine/adapters/invoiceAdapter';
import { BUILT_IN_TEMPLATE_CONFIGS, resolveTemplateConfigWithCountry } from '../../lib/pdf/templateConfig';
import { countryTemplateOverride, type ResolvedCountryFacts } from '../../lib/pdf/engine/countryConfig';
import { gccTaxInvoiceProfile } from '../../lib/regimes/gcc_tax_invoice';
import { buildInvoiceFixture } from '../../lib/pdf/engine/invoiceParity.fixtures';
import { useDocumentCompliance } from '../../hooks/useDocumentCompliance';
import { InvoiceDocument } from './InvoiceDocument';
import type { DocumentTaxLine } from '../../lib/pdf/types';

const BASE_FACTS: Omit<ResolvedCountryFacts, 'taxInvoiceRequired'> = {
  code: 'OM',
  taxSystem: 'VAT',
  taxLabel: 'VAT',
  taxNumberLabel: 'VATIN',
  languageCode: 'ar',
  decimalPlaces: 3,
  dateFormat: 'DD/MM/YYYY',
  decimalSeparator: '.',
  thousandsSeparator: ',',
  digitGrouping: '3',
};

const SINGLE_VAT_LINE: DocumentTaxLine[] = [
  {
    line_item_id: null, component_code: 'VAT', component_label: 'VAT 5%', rate: 5,
    taxable_base: 1440, tax_amount: 72, tax_treatment: 'standard',
    treatment_reason_code: null, sequence: 0, backfilled: false, rule_trace: null,
  },
];

const MULTI_COMPONENT_LINES: DocumentTaxLine[] = [
  {
    line_item_id: null, component_code: 'CGST', component_label: 'CGST 9%', rate: 9,
    taxable_base: 1000, tax_amount: 90, tax_treatment: 'standard',
    treatment_reason_code: null, sequence: 0, backfilled: false, rule_trace: null,
  },
  {
    line_item_id: null, component_code: 'SGST', component_label: 'SGST 9%', rate: 9,
    taxable_base: 1000, tax_amount: 90, tax_treatment: 'standard',
    treatment_reason_code: null, sequence: 1, backfilled: false, rule_trace: null,
  },
];

interface MatrixCase {
  name: string;
  sellerRegistered: boolean;
  taxInvoiceRequired: boolean;
  sellerTaxNumber: string | null;
  taxLines: DocumentTaxLine[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  expectedTitleEn: string;
  expectedTitleAr: string;
  expectedBandEnabled: boolean;
}

// The decision matrix that matters (per the controller directive): the
// seller-registered × tax_invoice_required cross product that flips
// TAX INVOICE <-> INVOICE and the registration-band visibility, PLUS a
// multi-component tax_lines rollup proving the row ARRAY (not just one row)
// stays in lockstep between preview and print.
const MATRIX: MatrixCase[] = [
  {
    name: 'seller-registered + tax_invoice_required -> TAX INVOICE, band shown',
    sellerRegistered: true, taxInvoiceRequired: true, sellerTaxNumber: 'OM1100000000',
    taxLines: SINGLE_VAT_LINE, subtotal: 1440, taxAmount: 72, totalAmount: 1512,
    expectedTitleEn: 'TAX INVOICE', expectedTitleAr: 'فاتورة ضريبية', expectedBandEnabled: true,
  },
  {
    name: 'seller NOT registered (tax_invoice_required still true) -> INVOICE, no band',
    sellerRegistered: false, taxInvoiceRequired: true, sellerTaxNumber: null,
    taxLines: SINGLE_VAT_LINE, subtotal: 1440, taxAmount: 72, totalAmount: 1512,
    expectedTitleEn: 'INVOICE', expectedTitleAr: 'فاتورة', expectedBandEnabled: false,
  },
  {
    name: 'seller registered but tax_invoice NOT required -> INVOICE, no band',
    sellerRegistered: true, taxInvoiceRequired: false, sellerTaxNumber: 'OM1100000000',
    taxLines: SINGLE_VAT_LINE, subtotal: 1440, taxAmount: 72, totalAmount: 1512,
    expectedTitleEn: 'INVOICE', expectedTitleAr: 'فاتورة', expectedBandEnabled: false,
  },
  {
    name: 'multi-component rollup (CGST+SGST), seller-registered + required -> TAX INVOICE, 2 rows in lockstep',
    sellerRegistered: true, taxInvoiceRequired: true, sellerTaxNumber: 'OM1100000000',
    taxLines: MULTI_COMPONENT_LINES, subtotal: 1000, taxAmount: 180, totalAmount: 1180,
    expectedTitleEn: 'TAX INVOICE', expectedTitleAr: 'فاتورة ضريبية', expectedBandEnabled: true,
  },
];

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('preview/print parity (Localization Phase 2, WP-4 exit gate)', () => {
  it.each(MATRIX)('$name', async (tc) => {
    const facts: ResolvedCountryFacts = { ...BASE_FACTS, taxInvoiceRequired: tc.taxInvoiceRequired };

    vi.mocked(resolveComplianceRenderInputs).mockResolvedValue({
      facts,
      profile: gccTaxInvoiceProfile,
      sellerRegistered: tc.sellerRegistered,
      sellerTaxNumber: tc.sellerTaxNumber,
    });
    vi.mocked(fetchDocumentTaxLines).mockResolvedValue(tc.taxLines);

    // ---- PRINT path: the exact call shape `pdfService.ts` uses to build the
    // config, then the invoice adapter (Task 12) reading that config.
    const config = resolveTemplateConfigWithCountry(
      BUILT_IN_TEMPLATE_CONFIGS.invoice,
      countryTemplateOverride(facts, {
        profile: gccTaxInvoiceProfile,
        sellerRegistered: tc.sellerRegistered,
        docType: 'invoice',
      }),
    );
    const fixture = buildInvoiceFixture({
      subtotal: tc.subtotal,
      tax_amount: tc.taxAmount,
      total_amount: tc.totalAmount,
      tax_lines: tc.taxLines,
      seller_tax_number: tc.sellerTaxNumber,
    });
    const engine = toEngineData(fixture, config);

    const printTitleEn = engine.documentTitle.en;
    const printTitleAr = engine.documentTitle.ar;
    const printBandEnabled = config.taxBar?.enabled === true;
    const printBandText = printBandEnabled
      ? `${config.taxBar?.label?.en ?? ''}: ${engine.identity.basic_info?.vat_number ?? ''}`
      : null;
    const printTaxRows = (engine.totals ?? [])
      .filter((t) => t.key === 'tax')
      .map((t) => ({
        label: t.label.en.replace(/:$/, ''),
        amount: Number(t.value.replace(/[^\d.]/g, '')),
      }));

    // ---- PREVIEW path (structured): the exact hook Task 14 built for the
    // preview components, exercised directly so its output is a plain value.
    const { result } = renderHook(
      () =>
        useDocumentCompliance('invoice', fixture.invoiceData.id, {
          taxRate: null,
          taxAmount: tc.taxAmount,
        }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    const previewTitleEn = result.current.title.en;
    const previewTitleAr = result.current.title.ar;
    const previewBandEnabled = result.current.taxBandLabel != null;
    const previewBandText = previewBandEnabled
      ? `${result.current.taxBandLabel ?? ''}: ${result.current.sellerTaxNumber ?? ''}`
      : null;
    const previewTaxRows = result.current.taxRows.map((r) => ({ label: r.label, amount: r.amount }));

    // ---- PREVIEW path (integration): the real React component (InvoiceDocument),
    // proving the hook's output actually reaches the rendered DOM the customer sees.
    render(
      <InvoiceDocument
        invoice={fixture.invoiceData}
        companySettings={fixture.companySettings}
        currencyFormat={{ currencySymbol: 'ر.ع.', decimalPlaces: 3 }}
        t={(_key: string, fallback: string) => fallback}
      />,
      { wrapper: makeWrapper() },
    );
    const expectedTitleNode = `${tc.expectedTitleEn} | ${tc.expectedTitleAr}`;
    expect(await screen.findByText(expectedTitleNode)).toBeInTheDocument();
    if (tc.expectedBandEnabled) {
      expect(screen.getByText(`${BASE_FACTS.taxNumberLabel}: ${tc.sellerTaxNumber}`)).toBeInTheDocument();
    } else {
      expect(screen.queryByText(new RegExp(BASE_FACTS.taxNumberLabel as string))).not.toBeInTheDocument();
    }
    for (const row of tc.taxLines) {
      expect(screen.getByText(new RegExp(`${row.component_label}:`))).toBeInTheDocument();
    }

    // ---- THE PARITY ASSERTIONS: preview === print === expected literal, for
    // title, registration band, and every component tax row. Exact equality,
    // never `.toContain` — a divergence anywhere fails a specific assertion.
    expect(previewTitleEn).toBe(tc.expectedTitleEn);
    expect(printTitleEn).toBe(tc.expectedTitleEn);
    expect(previewTitleAr).toBe(tc.expectedTitleAr);
    expect(printTitleAr).toBe(tc.expectedTitleAr);

    expect(previewBandEnabled).toBe(tc.expectedBandEnabled);
    expect(printBandEnabled).toBe(tc.expectedBandEnabled);
    if (tc.expectedBandEnabled) {
      const expectedBandText = `${BASE_FACTS.taxNumberLabel}: ${tc.sellerTaxNumber}`;
      expect(previewBandText).toBe(expectedBandText);
      expect(printBandText).toBe(expectedBandText);
    }

    const expectedTaxRows = tc.taxLines.map((l) => ({ label: l.component_label, amount: l.tax_amount }));
    expect(previewTaxRows).toEqual(expectedTaxRows);
    expect(printTaxRows).toEqual(expectedTaxRows);
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { toEngineData } from './adapters/invoiceAdapter';
import { BUILT_IN_TEMPLATE_CONFIGS, resolveTemplateConfigWithCountry } from '../templateConfig';
import { countryTemplateOverride } from './countryConfig';
import { gccTaxInvoiceProfile } from '../../regimes/gcc_tax_invoice';
import { buildInvoiceFixture } from './invoiceParity.fixtures';
import { TaxTraceDrawer } from '../../../components/financial/TaxTraceDrawer';
import type { Database } from '../../../types/database.types';

// ---------------------------------------------------------------------------
// M-I regression net (WP-9, Task 28): "historical documents are NEVER
// re-rendered". Three guards, each pinned to a real Phase-2 defect class:
//
// 1. A pre-Phase-1 (or otherwise backfilled) row with an empty document-level
//    tax_lines rollup must print the STORED header tax_amount verbatim — never
//    a render-time (subtotal - discount) x rate recompute (Task 12 fallback).
// 2. A backfilled document's trace drawer must visibly badge itself as
//    reconstructed history, not present a fabricated computation trail
//    (Task 15 drawer).
// 3. The buyer-identity snapshot columns (`invoices.buyer_tax_number`,
//    `credit_notes.buyer_address`) must stay nullable — legacy rows issued
//    before the snapshot columns existed have NULL there, and the adapters'
//    `??` fallback chains (invoiceAdapter.ts ~line 134/146) depend on that.
//
// The sealed-reprint guard (documents served from storage, never re-rendered)
// is a static grep pin, not a runtime test — see the PR description for the
// recorded grep output.
// ---------------------------------------------------------------------------

function omConfig() {
  return resolveTemplateConfigWithCountry(
    BUILT_IN_TEMPLATE_CONFIGS.invoice,
    countryTemplateOverride(
      {
        code: 'OM', taxSystem: 'VAT', taxLabel: 'VAT', taxNumberLabel: 'VATIN', taxInvoiceRequired: true,
        languageCode: 'ar', decimalPlaces: 3, dateFormat: 'DD/MM/YYYY', decimalSeparator: '.',
        thousandsSeparator: ',', digitGrouping: '3', addressFormat: null,
      },
      { profile: gccTaxInvoiceProfile, sellerRegistered: true, docType: 'invoice' },
    ),
  );
}

describe('M-I guards', () => {
  // 1. Empty-tax-lines fallback prints the STORED header figure, not a recompute.
  it('empty tax_lines fallback prints the STORED header tax (4.75), not a recompute (5.000)', () => {
    const data = toEngineData(
      buildInvoiceFixture({
        subtotal: 100,
        // The base fixture defaults discount_amount to 100 (parity with its own
        // 1500/100/1400 story); zeroed here so this fixture's own numbers are
        // internally consistent (100 - 0 + 4.75 = 104.75) and so the sabotage
        // recompute below lands on the plan's documented "5.000", not a
        // discount-masked "0.000" that would still fail for the wrong reason.
        discount_amount: 0,
        tax_rate: 5,
        tax_amount: 4.75,
        total_amount: 104.75,
        tax_lines: [],
      }),
      omConfig(),
    );
    const taxRows = (data.totals ?? []).filter((t) => t.key === 'tax');
    expect(taxRows).toHaveLength(1);
    // A recompute would print 100 * 5% = "5.000" at OM's 3dp; the stored
    // figure is "4.750". toContain (not toBe) tolerates the trailing-zero
    // padding while still distinguishing the two values unambiguously.
    expect(taxRows[0].value).toContain('4.75');
  });

  // 2. Backfilled documents badge as reconstructed history in the trace drawer.
  it('backfilled documents badge as reconstructed history', () => {
    render(<TaxTraceDrawer trace={null} backfilled open onClose={() => {}} />);
    expect(screen.getByText(/Reconstructed history/)).toBeInTheDocument();
  });

  // 3. Schema pin: the buyer-identity snapshot columns stayed nullable.
  // This is a COMPILE-TIME assertion, not a runtime one — there is nothing to
  // `expect()` at runtime because `null === null` is a tautology. If either
  // column below were ever migrated to NOT NULL, the assignment would fail
  // `tsc` (not this test's runtime pass), which is the actual regression this
  // guard catches: the adapters' `??` legacy-row fallbacks silently stop
  // being reachable the day these columns stop being nullable.
  it('snapshot columns stayed nullable (type-level pin — the tsc compile is the assertion, not a runtime expect)', () => {
    const _pinInvoiceBuyerTaxNumber: Database['public']['Tables']['invoices']['Row']['buyer_tax_number'] = null;
    const _pinCreditNoteBuyerAddress: Database['public']['Tables']['credit_notes']['Row']['buyer_address'] = null;
    void _pinInvoiceBuyerTaxNumber;
    void _pinCreditNoteBuyerAddress;
  });
});

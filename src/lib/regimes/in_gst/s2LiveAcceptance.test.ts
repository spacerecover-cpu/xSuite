// @vitest-environment jsdom
//
// LIVE acceptance for WP-S2 (spec §4-S2): the create-time BUYER-SEAM threading that
// WP-S2 actually owns — the GSTIN format-validation chokepoint and the derived
// place-of-supply persisted onto the real invoice column — proven end-to-end on the
// disposable IN test tenant. Gated on IN_S2_LIVE=1 (skipped in CI); requires
// IN_S2_EMAIL / IN_S2_PASSWORD. NOT tax math — the tenant computes simple_vat until WP-S3.
//
// SCOPE NOTE (why the plan's dry-run issuance-gate assertions are not asserted here):
// the issuance gate (issue_tax_document) refuses proformas and evaluates only issued
// tax invoices — and a NULL-number tax_invoice draft is not insertable
// (invoices_number_required, mig 20260610094542), so a document must reach the gate via
// proforma -> convert_proforma_invoice_to_tax_invoice. That conversion RPC does NOT copy
// place_of_supply_subdivision_id, so the converted invoice loses the S2-threaded field.
// Both the gate and the convert path are issuance-side surfaces beyond WP-S2's
// create/update scope; the convert-path place-of-supply gap is a WP-S3 carry-forward.
// The gate's requirement evaluation itself is covered by the S1b requirement rows and
// the taxDocumentService / invoiceService threading unit tests.
import { describe, it, expect } from 'vitest';

const LIVE = process.env.IN_S2_LIVE === '1';

describe.runIf(LIVE)('WP-S2 live acceptance — IN test tenant', () => {
  it('validates GSTIN at create and persists the derived place of supply onto the invoice', { timeout: 120_000 }, async () => {
    const { supabase } = await import('../../supabaseClient');
    const { createCustomer } = await import('../../customerService');
    const { createInvoice } = await import('../../invoiceService');
    const { gstinCheckDigit } = await import('./gstin');

    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: process.env.IN_S2_EMAIL!, password: process.env.IN_S2_PASSWORD!,
    });
    expect(authErr).toBeNull();

    const { data: inCountry } = await supabase.from('geo_countries').select('id').eq('code', 'IN').maybeSingle();
    const { data: ka } = await supabase.from('geo_subdivisions')
      .select('id').eq('country_id', inCountry!.id).eq('tax_authority_code', '29').maybeSingle();

    // (a) GSTIN chokepoint, negative: a checksum-invalid GSTIN is rejected at create.
    await expect(createCustomer({
      customer_name: 'S2 Bad GSTIN', country_id: inCountry!.id, subdivision_id: ka!.id,
      tax_number: '29ABCDE1234F1Z5',
    })).rejects.toThrow(/check character/i);

    // (b) A registered Karnataka buyer with a self-consistent valid GSTIN is accepted
    //     and the GSTIN round-trips onto the customer row.
    const buyerGstin = '29AABCT1332L1Z' + gstinCheckDigit('29AABCT1332L1Z');
    const customer = await createCustomer({
      customer_name: 'S2 Registered Buyer', country_id: inCountry!.id, subdivision_id: ka!.id,
      tax_number: buyerGstin,
    });
    expect(customer).not.toBeNull();
    expect(customer!.tax_number).toBe(buyerGstin);

    // Minimal case (invoices are case-linked): NULL/NULL status is guard-legal.
    // case_no is GENERATED ALWAYS AS (case_number) — set case_number, the real column.
    const { data: caseNo } = await supabase.rpc('get_next_case_number');
    const { data: caseRow, error: caseErr } = await supabase.from('cases')
      .insert({ case_number: caseNo as string, customer_id: customer!.id, tenant_id: customer!.tenant_id })
      .select('id').maybeSingle();
    expect(caseErr).toBeNull();

    // (c) Place-of-supply derivation + persistence through the REAL client path: an
    //     intra-Karnataka supply (seller KA, registered KA buyer) → POS = KA, persisted
    //     onto invoices.place_of_supply_subdivision_id by computeDocumentTotals + createInvoice.
    //     (Proforma: a NULL-number tax_invoice draft is not insertable, see the scope note.)
    const inv = await createInvoice(
      { case_id: caseRow!.id, customer_id: customer!.id, invoice_type: 'proforma',
        invoice_date: new Date().toISOString().slice(0, 10), tax_rate: 18 },
      [{ description: 'Data recovery — logical evaluation (SAC 998319)', quantity: 1, unit_price: 8000 }],
    );
    const { data: persisted } = await supabase.from('invoices')
      .select('place_of_supply_subdivision_id').eq('id', inv.id).maybeSingle();
    expect(persisted!.place_of_supply_subdivision_id).toBe(ka!.id);   // FIELD assertion: POS persisted
  });
});

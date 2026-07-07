import { describe, it, expect } from 'vitest';
import { gstrComposer, type GstrLedgerRow } from './index';
import { registerAllRegimePlugins } from '../register';
import { resolveReturnComposer, listRegisteredCapabilities } from '../registry';

registerAllRegimePlugins();

const row = (over: Partial<GstrLedgerRow>): GstrLedgerRow => ({
  id: 'v1', record_type: 'sale', record_id: 'doc1', vat_amount: 0, vat_rate: 18,
  tax_period: '2026-07', vat_amount_base: 0, component_code: 'IGST', regime_key: 'in_gst',
  taxable_amount_base: 0, tax_treatment: 'standard',
  source_document_id: 'doc1', source_document_type: 'invoice',
  ...over,
});

const input = (ledgerRows: GstrLedgerRow[]) => ({
  tenantId: 't1', legalEntityId: 'le1', taxPeriods: ['2026-07'],
  ledgerRows, jurisdictionCurrency: 'INR', baseCurrency: 'INR',
});

const box = (r: ReturnType<typeof gstrComposer.compose>, code: string) =>
  r.boxes.find((b) => b.boxCode === code)?.amountBase;

describe('gstr composer — identity & registration', () => {
  it('is registered under key gstr and projected into the capability manifest input', () => {
    expect(resolveReturnComposer('gstr')).toBe(gstrComposer);
    expect(gstrComposer.key).toBe('gstr');
    expect(listRegisteredCapabilities()).toContainEqual(
      { capability_key: 'gstr', kind: 'return', version: '1.0.0' });
  });
  it('periodBounds delegates to the Apr-Mar period math', () => {
    expect(gstrComposer.periodBounds('monthly', '04-01', '2026-07-15', 'Asia/Kolkata').taxPeriods)
      .toEqual(['2026-07']);
  });
});

describe('gstr composer — GSTR-3B', () => {
  it('throws CountryConfigError on base ≠ jurisdiction currency (never a silent mixed sum)', () => {
    expect(() => gstrComposer.compose({ ...input([]), baseCurrency: 'USD' }))
      .toThrowError(/jurisdiction/i);
  });

  it('3.1(a): CGST+SGST pairs share ONE taxable base — dedup, never double-counted', () => {
    const rows = [
      row({ id: 'a', component_code: 'CGST', vat_amount_base: 8100, taxable_amount_base: 90000 }),
      row({ id: 'b', component_code: 'SGST', vat_amount_base: 8100, taxable_amount_base: 90000 }),
      row({ id: 'c', record_id: 'doc2', source_document_id: 'doc2', component_code: 'IGST', vat_amount_base: 16200, taxable_amount_base: 90000 }),
    ];
    const r = gstrComposer.compose(input(rows));
    expect(box(r, '3.1(a).taxable')).toBe(180000);   // NOT 270000 (the double-count assertion)
    expect(box(r, '3.1(a).cgst')).toBe(8100);
    expect(box(r, '3.1(a).sgst')).toBe(8100);
    expect(box(r, '3.1(a).igst')).toBe(16200);
  });

  it('equal dual-levy fixture ties: 5,000 inclusive → 4,237.29 / 381.36 / 381.36; round-off row excluded', () => {
    const rows = [
      row({ id: 'a', component_code: 'CGST', vat_amount_base: 381.36, taxable_amount_base: 4237.29 }),
      row({ id: 'b', component_code: 'SGST', vat_amount_base: 381.36, taxable_amount_base: 4237.29 }),
      row({ id: 'c', component_code: null, vat_amount_base: -0.01, taxable_amount_base: 0, tax_treatment: 'out_of_scope' }),
    ];
    const r = gstrComposer.compose(input(rows));
    expect(box(r, '3.1(a).taxable')).toBe(4237.29);
    expect(box(r, '3.1(a).cgst')).toBe(381.36);
    expect(box(r, '3.1(a).sgst')).toBe(381.36);      // heads EQUAL (spec §3)
  });

  it("3.1(c): exempt AND zero_rated (= nil-rated domestic, spec §3) report as exempt/nil", () => {
    const rows = [
      row({ id: 'a', record_id: 'd3', source_document_id: 'd3', tax_treatment: 'exempt', component_code: 'CGST', vat_amount_base: 0, taxable_amount_base: 1000 }),
      row({ id: 'b', record_id: 'd4', source_document_id: 'd4', tax_treatment: 'zero_rated', component_code: 'IGST', vat_amount_base: 0, taxable_amount_base: 500 }),
    ];
    const r = gstrComposer.compose(input(rows));
    expect(box(r, '3.1(c).taxable')).toBe(1500);
    expect(box(r, '3.1(a).taxable')).toBe(0);
  });

  it('PER-HEAD credit-note contras net into the same boxes (WP-L4 target shape)', () => {
    // When a CN posts one contra PER head (component_code carried), signed sums net
    // the heads AND the taxable base to zero. This is WP-L4's target ledger shape.
    const rows = [
      row({ id: 'a', component_code: 'CGST', vat_amount_base: 8100, taxable_amount_base: 90000 }),
      row({ id: 'b', component_code: 'SGST', vat_amount_base: 8100, taxable_amount_base: 90000 }),
      row({ id: 'c', record_id: 'cn1', source_document_id: 'cn1', source_document_type: 'credit_note', component_code: 'CGST', vat_amount_base: -8100, taxable_amount_base: -90000 }),
      row({ id: 'd', record_id: 'cn1', source_document_id: 'cn1', source_document_type: 'credit_note', component_code: 'SGST', vat_amount_base: -8100, taxable_amount_base: -90000 }),
    ];
    const r = gstrComposer.compose(input(rows));
    expect(box(r, '3.1(a).cgst')).toBe(0);
    expect(box(r, '3.1(a).taxable')).toBe(0);
  });

  it('HEAD-LESS credit-note contra (live post_credit_note_vat_record shape) keeps 3.1(a) internally consistent — gross, never tax-on-zero-base', () => {
    // The live trigger writes ONE head-less contra (component_code NULL) that cannot be
    // attributed to CGST/SGST/IGST. Excluding it from BOTH the heads and the taxable base
    // keeps 3.1(a) consistent (gross) instead of declaring 18k tax on a 0 net base. The
    // header output tax (SUM(vat_amount_base)) still nets to 0 separately. Exact per-head
    // CN netting = WP-L4.
    const rows = [
      row({ id: 'a', component_code: 'CGST', vat_amount_base: 9000, taxable_amount_base: 100000 }),
      row({ id: 'b', component_code: 'SGST', vat_amount_base: 9000, taxable_amount_base: 100000 }),
      row({ id: 'c', record_id: 'cn1', source_document_id: null, source_document_type: null, component_code: null, vat_amount_base: -18000, taxable_amount_base: -100000 }),
    ];
    const r = gstrComposer.compose(input(rows));
    expect(box(r, '3.1(a).taxable')).toBe(100000);   // gross — head-less contra excluded, NOT 0
    expect(box(r, '3.1(a).cgst')).toBe(9000);
    expect(box(r, '3.1(a).sgst')).toBe(9000);
    expect(r.meta['headless_sale_tax_base']).toBe(-18000);
    expect(r.meta['credit_notes_netting']).toBe('gross_pending_l4');
  });

  it('advance netting (L4 shape): voucher month + net invoice month conserve total tax; works with rows absent too', () => {
    // July: Rule 50 receipt voucher — GST at receipt (1,180 incl → 1,000 / 90 / 90).
    const july = gstrComposer.compose(input([
      row({ id: 'a', record_id: 'rv1', source_document_id: 'rv1', source_document_type: 'receipt_voucher', component_code: 'CGST', vat_amount_base: 90, taxable_amount_base: 1000 }),
      row({ id: 'b', record_id: 'rv1', source_document_id: 'rv1', source_document_type: 'receipt_voucher', component_code: 'SGST', vat_amount_base: 90, taxable_amount_base: 1000 }),
    ]));
    // August: final invoice full 10,000/900/900 + net-of-advance offset rows (spec §3 blocker fix).
    const august = gstrComposer.compose(input([
      row({ id: 'c', record_id: 'inv1', source_document_id: 'inv1', component_code: 'CGST', vat_amount_base: 900, taxable_amount_base: 10000 }),
      row({ id: 'd', record_id: 'inv1', source_document_id: 'inv1', component_code: 'SGST', vat_amount_base: 900, taxable_amount_base: 10000 }),
      row({ id: 'e', record_id: 'inv1', source_document_id: 'inv1', component_code: 'CGST', vat_amount_base: -90, taxable_amount_base: -1000 }),
      row({ id: 'f', record_id: 'inv1', source_document_id: 'inv1', component_code: 'SGST', vat_amount_base: -90, taxable_amount_base: -1000 }),
    ]));
    expect(box(august, '3.1(a).taxable')).toBe(9000);
    expect(box(august, '3.1(a).cgst')).toBe(810);
    // Conservation: voucher tax + invoice net tax = total supply tax.
    expect(box(july, '3.1(a).cgst')! + box(august, '3.1(a).cgst')!).toBe(900);
  });

  it('purchase rows are skipped — Table 4 ITC is a NAMED NON-GOAL; the meta says so', () => {
    const r = gstrComposer.compose(input([
      row({ id: 'a', record_type: 'purchase', record_id: 'exp1', source_document_id: null, component_code: 'CGST', vat_amount_base: 450, taxable_amount_base: 2500 }),
    ]));
    expect(box(r, '3.1(a).cgst')).toBe(0);
    expect(r.boxes.some((b) => b.boxCode.startsWith('4('))).toBe(false);
    expect(r.meta['itc_table4']).toBe('not_composed_purchases_not_modeled');
    expect(r.meta['skipped_purchase_rows']).toBe(1);
    expect(r.meta['display_only']).toBe(true);
  });

  it('boxes are deterministic, ascending-sequenced, and meta carries the short-form FY', () => {
    const r1 = gstrComposer.compose(input([row({ component_code: 'CGST', vat_amount_base: 90, taxable_amount_base: 1000 })]));
    const r2 = gstrComposer.compose(input([row({ component_code: 'CGST', vat_amount_base: 90, taxable_amount_base: 1000 })]));
    expect(r1.boxes).toEqual(r2.boxes);
    expect(r1.boxes.map((b) => b.sequence)).toEqual([1, 2, 3, 4, 5]);
    expect(r1.meta['financial_year']).toBe('26-27');
  });
});

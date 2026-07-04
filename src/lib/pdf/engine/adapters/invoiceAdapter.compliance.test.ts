import { describe, it, expect } from 'vitest';
import { toEngineData } from './invoiceAdapter';
import {
  BUILT_IN_TEMPLATE_CONFIGS,
  resolveTemplateConfigWithCountry,
} from '../../templateConfig';
import { countryTemplateOverride } from '../countryConfig';
import { gccTaxInvoiceProfile } from '../../../regimes/gcc_tax_invoice';
import type { DocumentComplianceProfile } from '../../../regimes/types';
import { buildInvoiceFixture } from '../invoiceParity.fixtures';

// ---------------------------------------------------------------------------
// invoiceAdapter COMPLIANCE rendering (WP-4, Task 12).
//
// Proves the printed figure equals the ledger figure: totals + tax-summary rows
// iterate the FROZEN document-level `tax_lines` rollups (component_label + STORED
// tax_amount), NOT a render-time (subtotal − discount) × rate recompute; the
// header stored amounts (`total_amount` / `balance_due`) win via `??` so a stored
// zero is honored; buyer identity/address + supply-date + notations come from the
// issuance snapshot; and dates/money format off `config.locale`.
//
// The engine shape is `EngineDocData` — party rows live at `parties.to.rows`,
// line rows at `lineItems.rows`.
// ---------------------------------------------------------------------------

const omFacts = {
  code: 'OM',
  taxSystem: 'VAT',
  taxLabel: 'VAT',
  taxNumberLabel: 'VATIN',
  taxInvoiceRequired: true,
  languageCode: 'ar' as const,
  decimalPlaces: 3,
  dateFormat: 'DD/MM/YYYY',
  decimalSeparator: '.',
  thousandsSeparator: ',',
  digitGrouping: '3',
};

function omConfig() {
  return resolveTemplateConfigWithCountry(
    BUILT_IN_TEMPLATE_CONFIGS.invoice,
    countryTemplateOverride(omFacts, {
      profile: gccTaxInvoiceProfile,
      sellerRegistered: true,
      docType: 'invoice',
    }),
  );
}

describe('invoiceAdapter compliance rendering', () => {
  it('renders one totals row per tax-line component from STORED amounts', () => {
    const fixture = buildInvoiceFixture({
      subtotal: 1440,
      tax_amount: 72,
      total_amount: 1512,
      tax_lines: [
        {
          line_item_id: null,
          component_code: 'VAT',
          component_label: 'VAT 5%',
          rate: 5,
          taxable_base: 1440,
          tax_amount: 72,
          tax_treatment: 'standard',
          treatment_reason_code: null,
          sequence: 0,
          backfilled: false,
          rule_trace: null,
        },
      ],
    });
    const data = toEngineData(fixture, omConfig());
    const taxRows = data.totals!.filter((t) => t.key === 'tax');
    expect(taxRows).toHaveLength(1);
    expect(taxRows[0].label.en).toBe('VAT 5%:');
    expect(taxRows[0].value).toContain('72');
    // total from stored total_amount, not (subtotal-discount)*(1+rate)
    expect(data.totals!.find((t) => t.key === 'total')!.value).toContain('1,512');
  });

  it('renders one row per component for a multi-component tax_lines rollup', () => {
    const fixture = buildInvoiceFixture({
      subtotal: 1000,
      tax_amount: 180,
      total_amount: 1180,
      tax_lines: [
        {
          line_item_id: null, component_code: 'CGST', component_label: 'CGST 9%',
          rate: 9, taxable_base: 1000, tax_amount: 90, tax_treatment: 'standard',
          treatment_reason_code: null, sequence: 0, backfilled: false, rule_trace: null,
        },
        {
          line_item_id: null, component_code: 'SGST', component_label: 'SGST 9%',
          rate: 9, taxable_base: 1000, tax_amount: 90, tax_treatment: 'standard',
          treatment_reason_code: null, sequence: 1, backfilled: false, rule_trace: null,
        },
      ],
    });
    const data = toEngineData(fixture, omConfig());
    const taxRows = data.totals!.filter((t) => t.key === 'tax');
    expect(taxRows).toHaveLength(2);
    expect(taxRows.map((t) => t.label.en)).toEqual(['CGST 9%:', 'SGST 9%:']);
    expect(taxRows[0].value).toContain('90');
    expect(taxRows[1].value).toContain('90');
    expect(data.totals!.find((t) => t.key === 'total')!.value).toContain('1,180');
  });

  it('falls back to ONE row from stored header tax when tax_lines is empty (M-I)', () => {
    const fixture = buildInvoiceFixture({ subtotal: 100, tax_rate: 5, tax_amount: 4.75, total_amount: 104.75, tax_lines: [] });
    const data = toEngineData(fixture, omConfig());
    const taxRow = data.totals!.find((t) => t.key === 'tax')!;
    expect(taxRow.value).toContain('4.750'); // the STORED 4.75 — a recompute would print 5.000
  });

  it('honors a stored ZERO total via ?? (never recomputes subtotal+tax)', () => {
    // A fully-credited invoice stores total_amount 0. `||` would treat 0 as
    // falsy and recompute 100 + tax; `??` must print the stored zero.
    const fixture = buildInvoiceFixture({ subtotal: 100, tax_rate: 5, tax_amount: 0, total_amount: 0, tax_lines: [] });
    const data = toEngineData(fixture, omConfig());
    const total = data.totals!.find((t) => t.key === 'total')!;
    expect(total.value.startsWith('0')).toBe(true); // "0.000 AED"
    expect(total.value).not.toContain('100'); // NOT the recompute
  });

  it('renders buyer tax number with the country label and buyer address lines incl. governorate', () => {
    const fixture = buildInvoiceFixture({
      buyer_tax_number: 'OM99887766',
      buyer_tax_number_label: 'VATIN',
      buyer_address: { line1: 'Bldg 12', subdivision: 'Muscat Governorate', postal_code: '133' },
    });
    const data = toEngineData(fixture, omConfig());
    const labels = data.parties.to!.rows.map((r) => r.label.en);
    expect(labels).toContain('VATIN:');
    expect(data.parties.to!.rows.some((r) => r.value === 'Bldg 12')).toBe(true);
    // An ISSUED invoice renders the governorate from the frozen snapshot.
    expect(data.parties.to!.rows.some((r) => (r.value ?? '').includes('Muscat Governorate'))).toBe(true);
  });

  it('adds a Supply Date meta row when supply_date differs from invoice_date', () => {
    const fixture = buildInvoiceFixture({ invoice_date: '2026-07-02', supply_date: '2026-06-28' });
    const data = toEngineData(fixture, omConfig());
    expect(data.meta.some((m) => m.label.en === 'Supply Date:' && m.value === '28/06/2026')).toBe(true);
  });

  it('omits the Supply Date meta row when supply_date equals invoice_date', () => {
    const fixture = buildInvoiceFixture({ invoice_date: '2026-07-02', supply_date: '2026-07-02' });
    const data = toEngineData(fixture, omConfig());
    expect(data.meta.some((m) => m.label.en === 'Supply Date:')).toBe(false);
  });

  it('formats meta dates with config.locale.dateFormat', () => {
    const fixture = buildInvoiceFixture({ invoice_date: '2026-07-02' });
    const data = toEngineData(fixture, omConfig());
    expect(data.meta.find((m) => m.label.en === 'Invoice Date:')!.value).toBe('02/07/2026');
  });

  it('emits unit and itemCode row keys', () => {
    const fixture = buildInvoiceFixture({
      invoice_line_items: [
        { description: 'RAID recovery', quantity: 2, unit_price: 100, tax_rate: 5, line_total: 200, unit_label: 'Piece', item_code: '998713' },
      ],
    });
    const data = toEngineData(fixture, omConfig());
    expect(data.lineItems!.rows[0].unit).toBe('Piece');
    expect(data.lineItems!.rows[0].itemCode).toBe('998713');
  });

  it('renders stored notations as note lines', () => {
    const fixture = buildInvoiceFixture({ notations: [{ code: 'ZERO_RATED', text: 'Zero-rated supply (EXPORT_SERVICES).' }] });
    const data = toEngineData(fixture, omConfig());
    expect(JSON.stringify(data)).toContain('Zero-rated supply (EXPORT_SERVICES).');
  });

  it('emits the legal_entities seller tax number on identity (the band value), not company_settings', () => {
    const fixture = buildInvoiceFixture({ seller_tax_number: 'OM1100000000' });
    const data = toEngineData(fixture, omConfig());
    // taxBar.ts renders the band from data.identity.basic_info.vat_number — this
    // proves the printed band uses the stamped snapshot, matching the preview.
    expect(data.identity.basic_info?.vat_number).toBe('OM1100000000');
  });

  it('the shared forcedColumns helper toggles unit/itemCode column visibility', () => {
    // GCC profile forces nothing → the columns stay hidden.
    const plainCols = omConfig().sections.find((s) => s.key === 'lineItems')!.columns!;
    expect(plainCols.find((c) => c.key === 'itemCode')!.visible).toBe(false);
    expect(plainCols.find((c) => c.key === 'unit')!.visible).toBe(false);

    // A profile that forces item_code + unit_code flips them visible through the
    // shared mapping wired into countryTemplateOverride.
    const forcedProfile: DocumentComplianceProfile = {
      ...gccTaxInvoiceProfile,
      forcedColumns: ['item_code', 'unit_code'],
    };
    const forced = resolveTemplateConfigWithCountry(
      BUILT_IN_TEMPLATE_CONFIGS.invoice,
      countryTemplateOverride(omFacts, { profile: forcedProfile, sellerRegistered: true, docType: 'invoice' }),
    );
    const forcedCols = forced.sections.find((s) => s.key === 'lineItems')!.columns!;
    expect(forcedCols.find((c) => c.key === 'itemCode')!.visible).toBe(true);
    expect(forcedCols.find((c) => c.key === 'unit')!.visible).toBe(true);
  });
});

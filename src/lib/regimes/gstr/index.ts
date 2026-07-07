// GSTR-3B composer (spec §3 scope: 3.1(a) + 3.1(c); Table 3.2 is service-fed —
// see ./table32.ts — because B2C-ness lives on the invoice, not the amount-only
// ledger). Consumes ONLY base-currency vat_records rows selected by tax_period.
// NAMED NON-GOALS (spec §7): GSTR-1 B2B rows, documents-issued, portal JSON,
// Table 4 ITC, Table 11 — the meta marks the 3B display-only so it cannot be
// mistaken for fileable.
//
// Contract note: VatRecordRow (regimes/types.ts) is the frozen minimal mirror.
// The live table carries more columns (verified: taxable_amount_base,
// tax_treatment, source_document_id/type). We narrow structurally HERE instead
// of widening the frozen contract.
import { CountryConfigError } from '../../country/resolveCountryConfig';
import { roundMoney } from '../../financialMath';
import type { ReturnBoxLine, ReturnComposer, VatRecordRow } from '../types';
import { fiscalYearLabel, gstrPeriodBounds } from './periods';

export type GstrLedgerRow = VatRecordRow & {
  taxable_amount_base?: number | null;
  tax_treatment?: string | null;
  source_document_id?: string | null;
  source_document_type?: string | null;
};

const HEADS = ['igst', 'cgst', 'sgst'] as const;
type Head = (typeof HEADS)[number];

const headOf = (r: GstrLedgerRow): Head | null => {
  const code = (r.component_code ?? '').toLowerCase();
  return (HEADS as readonly string[]).includes(code) ? (code as Head) : null;
};

export const gstrComposer: ReturnComposer = {
  key: 'gstr',
  version: '1.0.0',

  periodBounds: gstrPeriodBounds,

  compose(input) {
    if (input.baseCurrency !== input.jurisdictionCurrency) {
      throw new CountryConfigError(
        `gstr: tenant base currency ${input.baseCurrency} does not match the jurisdiction filing currency ` +
        `${input.jurisdictionCurrency} — a GSTR cannot be composed from a mismatched base ledger`,
      );
    }

    const outward = { taxable: 0, igst: 0, cgst: 0, sgst: 0 };
    let exemptNil = 0;
    let skippedPurchaseRows = 0;
    // Head-less sale rows (component_code NULL) are today's credit-note contras: the
    // live post_credit_note_vat_record trigger writes ONE flat reversal that carries no
    // CGST/SGST/IGST head, so it cannot be attributed to a head. We surface their signed
    // tax here but exclude them from BOTH the heads and the taxable base below — see the
    // loop comment. Exact per-head CN / advance netting is WP-L4's domain.
    let headlessSaleTaxBase = 0;

    for (const raw of input.ledgerRows) {
      const r = raw as GstrLedgerRow;
      const treatment = r.tax_treatment ?? 'standard';
      if (treatment === 'out_of_scope') continue;              // Section 170 round-off lines
      if (r.record_type !== 'sale') { skippedPurchaseRows += 1; continue; }  // ITC = named non-goal

      const head = headOf(r);
      const taxable = Number(r.taxable_amount_base ?? 0);
      // SGST mirrors CGST's base on every dual-levy row pair (equal heads, spec §3): count
      // the shared taxable base once, from the NON-SGST head of each pair, never the SGST
      // mirror. PER-HEAD signed rows (invoices, and WP-L4's future per-head CN / advance
      // offsets) net naturally through the head sums.
      if (treatment === 'exempt' || treatment === 'zero_rated') {
        if (head === 'sgst') continue;                         // skip the SGST mirror only
        exemptNil += taxable;                                  // 'zero' = nil-rated domestic (§3)
        continue;
      }
      // A HEAD-LESS standard row (live credit-note contra) can't be split across heads.
      // Excluding it from BOTH heads and taxable keeps 3.1(a) internally consistent —
      // GROSS of it — rather than the inconsistent "tax on a net-zero base". The header
      // output tax (SUM(vat_amount_base)) still nets it; WP-L4 makes 3.1(a) net too.
      if (!head) { headlessSaleTaxBase += Number(r.vat_amount_base ?? 0); continue; }
      outward[head] += Number(r.vat_amount_base ?? 0);
      if (head !== 'sgst') outward.taxable += taxable;
    }

    const boxes: ReturnBoxLine[] = [
      { boxCode: '3.1(a).taxable', boxLabel: 'Outward taxable supplies (other than zero rated, nil rated and exempted) — taxable value', amountBase: roundMoney(outward.taxable, 2), sequence: 1 },
      { boxCode: '3.1(a).igst', boxLabel: 'Outward taxable supplies — Integrated tax (IGST)', amountBase: roundMoney(outward.igst, 2), sequence: 2 },
      { boxCode: '3.1(a).cgst', boxLabel: 'Outward taxable supplies — Central tax (CGST)', amountBase: roundMoney(outward.cgst, 2), sequence: 3 },
      { boxCode: '3.1(a).sgst', boxLabel: 'Outward taxable supplies — State/UT tax (SGST/UTGST)', amountBase: roundMoney(outward.sgst, 2), sequence: 4 },
      { boxCode: '3.1(c).taxable', boxLabel: 'Other outward supplies (nil rated, exempted) — taxable value', amountBase: roundMoney(exemptNil, 2), sequence: 5 },
    ];

    return {
      boxes,
      meta: {
        composer: 'gstr',
        form: 'GSTR-3B',
        display_only: true,
        itc_table4: 'not_composed_purchases_not_modeled',
        skipped_purchase_rows: skippedPurchaseRows,
        // 3.1(a) is composed gross of head-less credit-note contras (see loop). Their
        // signed tax is surfaced here; the header output tax nets them. Net-in-3.1(a) = WP-L4.
        credit_notes_netting: 'gross_pending_l4',
        headless_sale_tax_base: roundMoney(headlessSaleTaxBase, 2),
        taxPeriods: input.taxPeriods,
        ...(input.taxPeriods.length > 0
          ? { financial_year: fiscalYearLabel(`${input.taxPeriods[0]}-15`, '04-01') }
          : {}),
      },
    };
  },
};

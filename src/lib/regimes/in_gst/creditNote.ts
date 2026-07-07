// India credit notes end-to-end (CGST s.34 + Rule 53). Three statutory obligations
// the generic credit-note path does not carry:
//   1. per-head NEGATIVE document_tax_lines (CGST/SGST or IGST reversal) so GSTR-3B/1
//      net correctly (WP-S6 reads these) — computed via the kernel, then negated;
//   2. reference to the ORIGINAL tax invoice number+date (r.53 block requirement);
//   3. the s.34(2) 30-Nov-following-FY declaration cutoff (a WARN, not a block —
//      a late credit note is still a valid commercial document, just not GSTR-adjustable).
// The FY credit-note series is consumed from the WP-S1b master_numbering_policies
// row (issue_credit_note mints the number) — this WP adds no numbering rows.
import { computeDocumentTotals, persistDocumentTaxLines } from '../../taxDocumentService';
import { issueCreditNote, type CreditNoteInput, type CreditNoteItemInput } from '../../creditNoteService';
import type { RateContext } from '../../currencyService';
import type { TaxComputation } from '../types';

export function negateComputation(c: TaxComputation): TaxComputation {
  const flip = <T extends { taxableBase: number; taxAmount: number }>(l: T): T =>
    ({ ...l, taxableBase: -l.taxableBase, taxAmount: -l.taxAmount });
  return {
    ...c,
    lines: c.lines.map(flip),
    rollups: c.rollups.map(flip),
    totals: {
      taxableBase: -c.totals.taxableBase,
      taxTotal: -c.totals.taxTotal,
      grandTotal: -c.totals.grandTotal,
      roundingAdjustment: c.totals.roundingAdjustment == null ? null : -c.totals.roundingAdjustment,
    },
  };
}

export function assertOriginalInvoiceRef(input: { invoice_id: string | null | undefined }): void {
  if (!input.invoice_id || !input.invoice_id.trim()) {
    throw new Error('An India credit note must reference the original tax invoice (Rule 53).');
  }
}

/** s.34(2): the declaration cutoff is 30 Nov of the year FOLLOWING the supply FY.
 *  `fyEndYear` = calendar year the supply FY ends (FY 2024-25 → 2025). */
export function checkCreditNoteCutoff(
  creditNoteDate: string, fyEndYear: number,
): { warn: boolean; message: string | null } {
  const cutoff = `${fyEndYear}-11-30`;
  if (creditNoteDate > cutoff) {
    return {
      warn: true,
      message: `Issued after 30 Nov ${fyEndYear} — beyond the s.34(2) cutoff; this credit note cannot be declared in GSTR-1/3B (commercial credit only). Consult your CA.`,
    };
  }
  return { warn: false, message: null };
}

/** Issue an India credit note: validate the r.53 original-invoice ref, mint via
 *  issue_credit_note (consumes the FY CN series), then compute per-head tax through
 *  the kernel as a credit_note document and persist the NEGATED rollups so the
 *  ledger and returns net. Returns the computation for the render/CA-package path. */
export async function issueIndiaCreditNote(
  input: CreditNoteInput, items: CreditNoteItemInput[], rc: RateContext,
): Promise<{ creditNoteId: string; computation: TaxComputation }> {
  assertOriginalInvoiceRef({ invoice_id: input.invoice_id });
  const cn = await issueCreditNote(input, items);
  const creditNoteId = (cn as { id: string }).id;
  const { computation } = await computeDocumentTotals(
    {
      items: items.map((it) => ({
        description: it.description ?? '', quantity: it.quantity ?? 1,
        unit_price: it.unit_price ?? 0, discount_percent: 0,
      })),
      discountType: null, discountAmount: 0, taxRate: input.tax_rate ?? 0,
      documentType: 'credit_note', documentDate: new Date().toISOString().slice(0, 10),
      // Thread the buyer so place of supply resolves — else the kernel sees a null
      // POS and reverses IGST on every CN, mis-filing intra-state (CGST/SGST) credits.
      customerId: input.customer_id ?? null, companyId: input.company_id ?? null,
    },
    rc,
  );
  const negated = negateComputation(computation);
  await persistDocumentTaxLines({
    tenantId: (cn as { tenant_id: string }).tenant_id,
    documentType: 'credit_note', documentId: creditNoteId,
    computation: negated, rc,
  });
  return { creditNoteId, computation: negated };
}

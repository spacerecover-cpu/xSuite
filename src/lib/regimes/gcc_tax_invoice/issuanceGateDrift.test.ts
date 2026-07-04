import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GCC_TAX_INVOICE_NOTATIONS } from './index';

// OWNER RULING #1 (Localization Phase 2 WP-5): the Task-18 migration DUPLICATES the buyer-
// identity fact-assembly SQL into issue_credit_note and HARDCODES the statutory notation
// legal text as SQL literals (rather than sharing). These drift tests are the agreed
// safety net: they fail the day someone edits one copy — or the TS profile — without the
// other. They read the committed source snapshot of the applied migration (the exact SQL
// that `mcp__supabase__apply_migration` ran; see supabase/rpc_snapshots/README.md).

const SNAPSHOT = readFileSync(
  join(process.cwd(), 'supabase/rpc_snapshots/phase2_requirement_gate_and_snapshots.sql'),
  'utf8',
);

/** Extract the two `«buyer-identity:begin» … «buyer-identity:end»` blocks (invoice, then
 *  credit note), then drop SQL comments and ALL whitespace so only the token stream of the
 *  logic remains. Whitespace is not logic; the two copies are hand-indented differently. */
function buyerIdentityBlocks(sql: string): string[] {
  const re = /«buyer-identity:begin»[^\n]*\n([\s\S]*?)«buyer-identity:end»/g;
  const blocks: string[] = [];
  for (const m of sql.matchAll(re)) {
    const body = m[1]
      .replace(/--[^\n]*/g, '') // strip line comments
      .replace(/\s+/g, ''); // strip all whitespace
    blocks.push(body);
  }
  return blocks;
}

/** Rename the credit-note block's locals to the invoice block's names. Order matters: the
 *  specific `v_cn_*` locals are renamed before the bare `v_cn` row reference, so `v_cn` in
 *  `v_cn_buyer_tax` is never touched. This map ONLY renames variables — never logic. */
function renameCnToInvoice(block: string): string {
  return block
    .replace(/v_cn_country_id/g, 'v_country_id')
    .replace(/v_cn_buyer_tax/g, 'v_buyer_tax_number')
    .replace(/v_cn_buyer_addr/g, 'v_buyer_address')
    .replace(/v_cn_seller_tax/g, 'v_seller_tax_number')
    .replace(/v_cn_buyer_label/g, 'v_buyer_tax_number_label')
    .replace(/v_cn\b/g, 'v_inv'); // remaining: the row reference v_cn.<col>
}

describe('WP-5 drift: two buyer-identity fact-assembly blocks stay equivalent', () => {
  const blocks = buyerIdentityBlocks(SNAPSHOT);

  it('finds exactly two anchored blocks (invoice + credit_note)', () => {
    expect(blocks).toHaveLength(2);
    // Guard against a tautology where extraction silently returns empty strings.
    expect(blocks[0].length).toBeGreaterThan(200);
    expect(blocks[1].length).toBeGreaterThan(200);
  });

  it('the credit_note block is identical to the invoice block after variable renaming', () => {
    const [invoiceBlock, creditNoteBlock] = blocks;
    expect(renameCnToInvoice(creditNoteBlock)).toBe(invoiceBlock);
  });
});

describe('WP-5 drift: TS profile notation strings match the SQL literals', () => {
  // The single canonical source of the statutory notation legal text. GCC_TAX_INVOICE_NOTATIONS
  // (rendered on the human-facing document) and the migration SQL literals (frozen at issuance)
  // must both equal these. Change one → this test fails until all three agree.
  const RC_EN = 'VAT to be accounted for by the recipient under the reverse-charge mechanism.';
  const RC_AR = 'يتم احتساب ضريبة القيمة المضافة من قبل المستلم وفقاً لآلية الاحتساب العكسي.';

  it('TS reverse-charge strings equal the canonical literals', () => {
    expect(GCC_TAX_INVOICE_NOTATIONS.REVERSE_CHARGE.text).toBe(RC_EN);
    expect(GCC_TAX_INVOICE_NOTATIONS.REVERSE_CHARGE.textTranslated).toBe(RC_AR);
  });

  it('TS zero-rated strings interpolate the reason code and fall back to "unspecified"', () => {
    expect(GCC_TAX_INVOICE_NOTATIONS.ZERO_RATED('EXPORT_SERVICES').text)
      .toBe('Zero-rated supply (EXPORT_SERVICES).');
    expect(GCC_TAX_INVOICE_NOTATIONS.ZERO_RATED('EXPORT_SERVICES').textTranslated)
      .toBe('توريد خاضع لنسبة الصفر (EXPORT_SERVICES).');
    expect(GCC_TAX_INVOICE_NOTATIONS.ZERO_RATED(null).text).toBe('Zero-rated supply (unspecified).');
  });

  it('the migration SQL hardcodes those exact same literals', () => {
    // Reverse-charge: full literals appear verbatim.
    expect(SNAPSHOT).toContain(RC_EN);
    expect(SNAPSHOT).toContain(RC_AR);
    // Zero-rated: the SQL concatenates the reason code, so assert the fixed fragments +
    // the shared 'unspecified' fallback that both sides use.
    expect(SNAPSHOT).toContain("'Zero-rated supply ('");
    expect(SNAPSHOT).toContain("'توريد خاضع لنسبة الصفر ('");
    expect(SNAPSHOT).toContain("'unspecified'");
  });
});

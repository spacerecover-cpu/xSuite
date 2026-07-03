import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

const DB = process.env.SUPABASE_DB_URL;
const q = (sql: string) => execSync(`psql "${DB}" -v ON_ERROR_STOP=0 -t -A -c "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' });

describe.skipIf(!DB)('PostgREST bypass suite (SEC-1 posture)', () => {
  it('mutating an issued invoice header off-whitelist is rejected by the immutability trigger', () => {
    const id = q(`SELECT id FROM invoices WHERE invoice_type='tax_invoice' AND status<>'draft' AND deleted_at IS NULL LIMIT 1`).trim();
    if (!id) return; // no issued invoice in the snapshot
    const out = q(`BEGIN; UPDATE invoices SET total_amount=total_amount+1000 WHERE id='${id}'; ROLLBACK;`);
    expect(out).toMatch(/immutable|cannot be deleted/i);
  });
  it('soft-deleting an issued invoice is rejected (deleted_at not whitelisted)', () => {
    const id = q(`SELECT id FROM invoices WHERE invoice_type='tax_invoice' AND status<>'draft' AND deleted_at IS NULL LIMIT 1`).trim();
    if (!id) return;
    const out = q(`BEGIN; UPDATE invoices SET deleted_at=now() WHERE id='${id}'; ROLLBACK;`);
    expect(out).toMatch(/immutable|cannot be deleted/i);
  });
  it('inserting an internally-inconsistent invoice fails the deferred integrity trigger at commit', () => {
    // A draft with tax lines whose rollup != header must fail on COMMIT.
    const out = q(`BEGIN;
      WITH t AS (SELECT id, tenant_id, currency FROM invoices WHERE status='draft' AND deleted_at IS NULL LIMIT 1)
      INSERT INTO document_tax_lines (tenant_id, document_type, document_id, component_code, component_label, rate, taxable_base, tax_amount, currency, exchange_rate, tax_amount_base, tax_treatment, regime_key, plugin_version)
      SELECT tenant_id, 'invoice', id, 'VAT', 'VAT 5%', 5, 100, 99999, currency, 1, 99999, 'standard', 'simple_vat', '1.0.0' FROM t;
      UPDATE invoices SET tax_amount = tax_amount WHERE id=(SELECT id FROM invoices WHERE status='draft' LIMIT 1);
      COMMIT;`);
    expect(out).toMatch(/integrity|<> Σ|rollups/i);
  });
  it('anon cannot EXECUTE update_number_sequence', () => {
    const out = q(`SELECT has_function_privilege('anon', 'update_number_sequence(text,text,int,boolean,int,text,text,text,int)', 'EXECUTE')`);
    expect(out.trim()).toBe('f');
  });
  it('einvoice_submissions rejects UPDATE (append-only)', () => {
    const out = q(`BEGIN; UPDATE einvoice_submissions SET status='accepted' WHERE true; ROLLBACK;`);
    expect(out).toMatch(/append-only|permission denied|prevent_audit_mutation/i);
  });
  it('vat_transactions is frozen: authenticated has no INSERT/UPDATE/DELETE (M-G)', () => {
    // The Phase-0 REVOKE freeze (entry criteria) must still hold. Assert via
    // privilege check (not an INSERT attempt) because psql connects as owner;
    // has_table_privilege evaluates the grant that a PostgREST client inherits.
    const out = q(`SELECT (has_table_privilege('authenticated','vat_transactions','INSERT')
      OR has_table_privilege('authenticated','vat_transactions','UPDATE')
      OR has_table_privilege('authenticated','vat_transactions','DELETE'))`);
    expect(out.trim()).toBe('f');
  });
});

describe.skipIf(!DB)('custody regression across issuance (v1.2.0)', () => {
  it('issuing an invoice through issue_tax_document writes a financial custody event', () => {
    // Prove the RPC path writes chain_of_custody; run on a branch with a draft.
    const draft = q(`SELECT id, case_id FROM invoices WHERE invoice_type='tax_invoice' AND status='draft' AND case_id IS NOT NULL AND deleted_at IS NULL LIMIT 1`).trim();
    if (!draft) return;
    const [id] = draft.split('|');
    q(`SELECT issue_tax_document('invoice','${id}', false)`);
    const events = q(`SELECT count(*) FROM chain_of_custody WHERE action='INVOICE_ISSUED' AND (metadata->>'invoice_id')='${id}'`).trim();
    expect(Number(events)).toBeGreaterThanOrEqual(1);
  });
});

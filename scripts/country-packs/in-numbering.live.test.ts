//
// India fiscal-numbering live pins (spec §3 / WP-S5). Runs only when
// SUPABASE_DB_URL is set (CI); self-skips locally — same convention as
// scripts/localization/parity-replay.test.ts. Probes use the throwaway scope
// 'in_probe_s5' inside an explicit BEGIN…ROLLBACK so no legal series is ever
// consumed or mutated; SQL is single-quote-only so the psql -c double-quote
// wrapper needs no escaping.
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { inFiscalNumberingPolicy } from '../../src/lib/regimes/in_gst/numbering';
import { fiscalYearLabel } from '../../src/lib/numbering/templates';

const DB = process.env.SUPABASE_DB_URL;
const d = describe.skipIf(!DB);

function psql(sql: string): string {
  return execSync(`psql "${DB}" -v ON_ERROR_STOP=1 -q -t -A -c "${sql.replace(/\n/g, ' ')}"`, {
    encoding: 'utf8',
  }).trim();
}

const IMPERSONATE_IN_ADMIN = `
  SELECT set_config('request.jwt.claims', json_build_object('sub',
    (SELECT p.id FROM profiles p
     JOIN tenants t ON t.id = p.tenant_id
     JOIN geo_countries c ON c.id = t.country_id
     WHERE c.code = 'IN' AND p.role IN ('owner','admin') AND p.deleted_at IS NULL LIMIT 1),
    'role', 'authenticated')::text, true)`;

const CURRENT_FY_PERIOD = `
  CASE WHEN to_char(current_date, 'MM-DD') >= '04-01'
       THEN to_char(current_date, 'YYYY')
       ELSE (extract(year from current_date)::int - 1)::text END`;

function probeRowInsert(currentValue: number, lastResetPeriod: string): string {
  return `
    INSERT INTO number_sequences (tenant_id, scope, prefix, current_value, padding,
      reset_annually, format_template, reset_basis, fiscal_year_anchor, max_length, last_reset_period)
    VALUES (get_current_tenant_id(), 'in_probe_s5', 'PRB', ${currentValue}, 4, false,
      'PRB/{FY}/{SEQ:4}', 'fiscal_year', '04-01', 16, ${lastResetPeriod})`;
}

d('India fiscal numbering (live, canonical DB)', () => {
  it('plugin seeds mirror the S1b master_numbering_policies IN rows exactly', () => {
    const rows = JSON.parse(psql(`
      SELECT COALESCE(json_agg(json_build_object(
        'scope', p.scope, 'format_template', p.format_template, 'reset_basis', p.reset_basis,
        'fiscal_year_anchor', p.fiscal_year_anchor, 'max_length', p.max_length) ORDER BY p.scope), '[]'::json)
      FROM master_numbering_policies p JOIN geo_countries c ON c.id = p.country_id
      WHERE c.code = 'IN' AND p.deleted_at IS NULL`));
    const seeds = inFiscalNumberingPolicy
      .defaultSequences({ countryCode: 'IN', fiscalYearStart: '04-01' })
      .map(({ scope, format_template, reset_basis, fiscal_year_anchor, max_length }) => ({
        scope, format_template, reset_basis, fiscal_year_anchor, max_length,
      }))
      .sort((a, b) => a.scope.localeCompare(b.scope));
    expect(rows).toEqual(seeds);
  });

  it('IN tenant rows carry the S5.4 backfill (template, fiscal reset, 16-char cap armed)', () => {
    const rows = JSON.parse(psql(`
      SELECT COALESCE(json_agg(json_build_object('scope', ns.scope,
        'format_template', ns.format_template, 'reset_basis', ns.reset_basis,
        'fiscal_year_anchor', ns.fiscal_year_anchor, 'max_length', ns.max_length) ORDER BY ns.scope), '[]'::json)
      FROM number_sequences ns
      JOIN tenants t ON t.id = ns.tenant_id
      JOIN geo_countries c ON c.id = t.country_id
      WHERE c.code = 'IN' AND t.deleted_at IS NULL
        AND ns.scope IN ('invoices','credit_note','receipt_voucher','refund_voucher','delivery_challan')`));
    expect(rows).toHaveLength(5);
    for (const r of rows as Array<Record<string, unknown>>) {
      expect(r.reset_basis).toBe('fiscal_year');
      expect(r.fiscal_year_anchor).toBe('04-01');
      expect(r.max_length).toBe(16);
      expect(r.format_template).toMatch(/^[A-Z]{2,3}\/\{FY\}\/\{SEQ:4\}$/);
    }
  });

  it('short-form FY + SEQ growth at 9999→10000 + fiscal reset (rolled back)', () => {
    const fy = fiscalYearLabel('04-01', new Date());
    const out = psql(`
      BEGIN;
      ${IMPERSONATE_IN_ADMIN};
      ${probeRowInsert(9998, CURRENT_FY_PERIOD)};
      SELECT get_next_number('in_probe_s5');
      SELECT get_next_number('in_probe_s5');
      UPDATE number_sequences SET last_reset_period = '1999', current_value = 42
        WHERE tenant_id = get_current_tenant_id() AND scope = 'in_probe_s5';
      SELECT get_next_number('in_probe_s5');
      ROLLBACK;`);
    expect(out).toContain(`PRB/${fy}/9999`);   // 14 chars — within cap
    expect(out).toContain(`PRB/${fy}/10000`);  // 15 chars — SEQ grew inside max_length
    expect(out).toContain(`PRB/${fy}/0001`);   // stale period ⇒ fiscal reset to 0001
    expect(out).not.toMatch(/PRB\/\d{4}-/);    // long-form FY = S1b renderer delta missing
  });

  it('hard-errors before issuing a 17-char number (rule 46(b) cap)', () => {
    let message = '';
    try {
      psql(`
        BEGIN;
        ${IMPERSONATE_IN_ADMIN};
        ${probeRowInsert(999999, CURRENT_FY_PERIOD)};
        SELECT get_next_number('in_probe_s5');
        ROLLBACK;`);
    } catch (err) {
      const e = err as { stderr?: string; message?: string };
      message = `${e.stderr ?? ''}${e.message ?? ''}`;
    }
    expect(message).toContain('exceeds max_length 16');
  });
});

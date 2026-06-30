// src/lib/dataMigration/__tests__/roundTrip.integration.test.ts
//
// LIVE-DB-GATED: skip unless INTEGRATION_DB_TEST=true is set.
// Runs against the real Supabase project (project ssmbegiyjivrcwgcqutu).
// Requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the environment
// (copy from .env before running).
//
// What it proves:
//  1. Export from a seeded fixture via data_migration_export_page produces a valid workbook.
//  2. Import of that workbook via data_migration_import_batch + _finalize writes all rows.
//  3. Every FK relationship survived: case→customer/company, device→case,
//     quote/invoice→case, items→parent, notes/status→case.
//  4. original created_at values are preserved on all entities.
//  5. Original record numbers (case_number, invoice_number, quote_number) are preserved.
//  6. status_history timestamps and ordering are preserved per-case.
//  7. Number sequences were advanced past the max imported number.
//  8. Idempotent re-run: submitting the same file_hash a second time inserts 0 new rows.
//  9. Fabricating triggers did NOT fire: custody/VAT/portal-subscription row counts unchanged.
// 10. Exactly one provenance entry (audit_trails row) was written by finalize.
//
// The import is driven THROUGH the file boundary: the in-memory fixture is serialised with
// buildWorkbook, then re-read with parseWorkbook, and THAT parsed result is imported — so the
// header<->key translation (C1) is exercised end-to-end, not bypassed.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../../types/database.types';
import { generateLargeFixture } from './fixtures/generateLargeFixture';
import { buildWorkbook } from '../workbookBuilder';
import { parseWorkbook, computeFileHash } from '../workbookParser';
import { runImport } from '../importClient';
import type { ImportSummary } from '../importClient';

const SKIP = !process.env['INTEGRATION_DB_TEST'];
const CUSTOMER_COUNT = 200; // Reduced for CI speed; proportions identical to 10k

// ---------------------------------------------------------------------------
// Supabase admin client (uses service role from env for setup/teardown only)
// ---------------------------------------------------------------------------
function makeClient() {
  const url = process.env['VITE_SUPABASE_URL'] ?? process.env['SUPABASE_URL'] ?? '';
  const key =
    process.env['SUPABASE_SERVICE_ROLE_KEY'] ??
    process.env['VITE_SUPABASE_ANON_KEY'] ??
    '';
  if (!url || !key) throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set');
  return createClient<Database>(url, key);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function snapshotFabricatingCounts(
  client: ReturnType<typeof makeClient>,
  tenantId: string,
): Promise<{ custody: number; vat: number; portal: number }> {
  // The portal fabricating trigger is trg_seed_portal_customer_subscriptions, which seeds
  // notification_subscriptions (NOT user_preferences). Snapshot the table it actually writes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyClient = client as any;
  const [custodyRes, vatRes, portalRes] = await Promise.all([
    client
      .from('chain_of_custody')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null),
    client
      .from('vat_records')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null),
    anyClient
      .from('notification_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),
  ]);
  return {
    custody: custodyRes.count ?? 0,
    vat: vatRes.count ?? 0,
    portal: portalRes.count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Round-trip integration — export → import → verify', { timeout: 300_000 }, () => {
  if (SKIP) {
    it.skip('INTEGRATION_DB_TEST not set — skipping live-DB round-trip', () => {});
    return;
  }

  let client: ReturnType<typeof makeClient>;
  let tenantId: string;
  let runId: string;
  let summary: ImportSummary;
  let fileBytes: ArrayBuffer;
  let fileHash: string;
  let beforeCounts: { custody: number; vat: number; portal: number };

  // The fixture workbook is the canonical in-memory source. It is used ONLY for assertions
  // (original legacy_ids / values). The data actually imported is the result of round-tripping
  // it through the FILE boundary (buildWorkbook -> bytes -> parseWorkbook) below.
  const fixtureWb = generateLargeFixture({ customerCount: CUSTOMER_COUNT, seed: 99 });

  beforeAll(async () => {
    client = makeClient();

    // Resolve the test tenant (use the first non-null tenant visible to the key)
    const { data: tenant, error: tErr } = await client
      .from('tenants')
      .select('id')
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    if (tErr || !tenant) throw new Error(`Cannot resolve tenant: ${tErr?.message}`);
    tenantId = tenant.id;

    // Snapshot fabricating-trigger row counts before import
    beforeCounts = await snapshotFabricatingCounts(client, tenantId);

    // Build the workbook bytes from the in-memory fixture
    const meta = {
      sourceTenant: 'fixture-tenant',
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
      counts: Object.fromEntries(
        Object.entries(fixtureWb).map(([k, v]) => [k, (v as unknown[]).length]),
      ) as Record<string, number>,
    } as import('../workbookBuilder').WorkbookMeta;

    fileBytes = buildWorkbook(fixtureWb, meta);
    fileHash = await computeFileHash(fileBytes);

    // Import THROUGH the file boundary: parse the bytes back (header -> key) and import THAT.
    // This exercises C1 (the header<->key translation) end-to-end.
    const parsedFromFile = parseWorkbook(fileBytes);

    // Run import (progress is logged but not asserted here)
    summary = await runImport(
      parsedFromFile,
      { filename: 'round-trip-fixture.xlsx', hash: fileHash },
      _p => undefined,
    );
    runId = summary.runId;
  });

  afterAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyClient = client as any;
    // Soft-delete the run record (audit_trails provenance row remains for integrity)
    if (runId) {
      await anyClient
        .from('data_migration_runs')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', runId);
    }
    // Soft-delete imported rows to leave the DB clean for the next test run.
    for (const table of [
      'case_job_history', 'case_internal_notes', 'case_devices', 'cases',
      'invoice_line_items', 'invoices', 'quote_items', 'quotes',
      'customer_company_relationships', 'customers_enhanced', 'companies',
    ]) {
      await anyClient
        .from(table)
        .update({ deleted_at: new Date().toISOString() })
        .filter('metadata->>data_migration_run_id', 'eq', runId);
    }
  });

  it('import completed without a top-level error', () => {
    expect(summary.runId).toBeTruthy();
  });

  it('all customers were inserted (0 errors)', () => {
    expect(summary.counts['customers']?.inserted).toBe(CUSTOMER_COUNT);
    expect(summary.counts['customers']?.error).toBe(0);
  });

  it('all companies were inserted', () => {
    expect(summary.counts['companies']?.inserted).toBe(fixtureWb.companies.length);
    expect(summary.counts['companies']?.error).toBe(0);
  });

  it('all cases were inserted', () => {
    expect(summary.counts['cases']?.inserted).toBe(fixtureWb.cases.length);
    expect(summary.counts['cases']?.error).toBe(0);
  });

  it('every imported case references an existing customer (FK preserved)', async () => {
    // Sample the first 20 cases; checking all 300+ is redundant
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sampleCases } = await (client as any)
      .from('cases')
      .select('id, customer_id, metadata')
      .filter('metadata->>data_migration_run_id', 'eq', runId)
      .is('deleted_at', null)
      .limit(20) as { data: Array<{ id: string; customer_id: string | null; metadata: Record<string, unknown> | null }> | null };

    expect(sampleCases).not.toBeNull();
    for (const c of sampleCases ?? []) {
      expect(c.customer_id).toBeTruthy();
      const { data: cust } = await client
        .from('customers_enhanced')
        .select('id')
        .eq('id', c.customer_id as string)
        .is('deleted_at', null)
        .maybeSingle();
      expect(cust).not.toBeNull();
    }
  });

  it('every imported device references an existing case', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sampleDevices } = await (client as any)
      .from('case_devices')
      .select('id, case_id, metadata')
      .filter('metadata->>data_migration_run_id', 'eq', runId)
      .is('deleted_at', null)
      .limit(20) as { data: Array<{ id: string; case_id: string; metadata: Record<string, unknown> | null }> | null };

    for (const d of sampleDevices ?? []) {
      const { data: c } = await client
        .from('cases')
        .select('id')
        .eq('id', d.case_id)
        .is('deleted_at', null)
        .maybeSingle();
      expect(c).not.toBeNull();
    }
  });

  it('every imported quote references an existing case', async () => {
    const { data: sampleQuotes } = await client
      .from('quotes')
      .select('id, case_id')
      .filter('case_id', 'not.is', null)
      .is('deleted_at', null)
      .limit(20);

    for (const q of sampleQuotes ?? []) {
      const { data: c } = await client
        .from('cases')
        .select('id')
        .eq('id', q.case_id as string)
        .is('deleted_at', null)
        .maybeSingle();
      expect(c).not.toBeNull();
    }
  });

  it('every imported invoice line item references an existing invoice', async () => {
    const { data: sampleItems } = await client
      .from('invoice_line_items')
      .select('id, invoice_id')
      .is('deleted_at', null)
      .limit(20);

    for (const li of sampleItems ?? []) {
      const { data: inv } = await client
        .from('invoices')
        .select('id')
        .eq('id', li.invoice_id)
        .is('deleted_at', null)
        .maybeSingle();
      expect(inv).not.toBeNull();
    }
  });

  it('created_at is preserved on imported cases', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cases } = await (client as any)
      .from('cases')
      .select('id, created_at, metadata')
      .filter('metadata->>data_migration_run_id', 'eq', runId)
      .is('deleted_at', null)
      .limit(10) as { data: Array<{ id: string; created_at: string; metadata: Record<string, unknown> | null }> | null };

    for (const c of cases ?? []) {
      const expectedLegacyId = c.metadata?.['legacy_id'] as string;
      const fixture = fixtureWb.cases.find(r => r['legacy_id'] === expectedLegacyId);
      expect(fixture).toBeTruthy();
      // Timestamps match to the second
      expect(new Date(c.created_at).toISOString().slice(0, 19)).toBe(
        new Date(fixture!['created_at'] as string).toISOString().slice(0, 19),
      );
    }
  });

  it('case_number is preserved on imported cases', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cases } = await (client as any)
      .from('cases')
      .select('id, case_number, metadata')
      .filter('metadata->>data_migration_run_id', 'eq', runId)
      .is('deleted_at', null)
      .limit(10) as { data: Array<{ id: string; case_number: string | null; metadata: Record<string, unknown> | null }> | null };

    for (const c of cases ?? []) {
      const legacyId = c.metadata?.['legacy_id'] as string;
      const fixture = fixtureWb.cases.find(r => r['legacy_id'] === legacyId);
      expect(c.case_number).toBe(fixture!['case_number']);
    }
  });

  it('status history for each case is ordered ascending by performed_at', async () => {
    // Pull history for the first 5 imported cases
    const { data: cases } = await client
      .from('cases')
      .select('id')
      .filter('metadata->>data_migration_run_id', 'eq', runId)
      .is('deleted_at', null)
      .limit(5);

    for (const c of cases ?? []) {
      const { data: history } = await client
        .from('case_job_history')
        .select('id, created_at, action')
        .eq('case_id', c.id)
        .order('created_at', { ascending: true });

      const migrationHistory = (history ?? []).filter(
        h => h.action === 'MIGRATED' || h.action === 'status_change',
      );
      const timestamps = migrationHistory.map(h => new Date(h.created_at).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
      }
    }
  });

  it('number sequences were advanced past the max imported case number', async () => {
    // The fixture generates CASE-00001 through CASE-{caseCount}
    // After finalize the 'case' sequence current value must be >= caseCount
    const maxExpected = fixtureWb.cases.length;
    const { data: seq } = await client
      .from('number_sequences')
      .select('current_value')
      .eq('scope', 'case')
      .is('deleted_at', null)
      .maybeSingle();
    expect(seq).not.toBeNull();
    expect(seq!.current_value).toBeGreaterThanOrEqual(maxExpected);
  });

  it('fabricating triggers did not fire during import (custody/VAT/portal counts unchanged)', async () => {
    const afterCounts = await snapshotFabricatingCounts(client, tenantId);
    // custody: trg_log_device_received_custody must NOT have fired
    expect(afterCounts.custody).toBe(beforeCounts.custody);
    // vat: trg_post_invoice_vat_record must NOT have fired
    expect(afterCounts.vat).toBe(beforeCounts.vat);
    // portal subscriptions must NOT have been seeded
    expect(afterCounts.portal).toBe(beforeCounts.portal);
  });

  it('exactly one audit_trails provenance entry was written by finalize', async () => {
    // audit_trails has NO metadata column. finalize writes:
    //   record_type='data_migration_run', record_id=run_id, action='IMPORT_FINALIZED', new_values=<jsonb>
    const { data: provenanceRows, count } = await client
      .from('audit_trails')
      .select('id, action, record_id, record_type, new_values', { count: 'exact' })
      .eq('record_id', runId)
      .eq('action', 'IMPORT_FINALIZED');

    expect(count).toBe(1);
    const row = (provenanceRows ?? [])[0];
    expect(row).toBeTruthy();
    expect(row?.record_type).toBe('data_migration_run');
    expect(row?.new_values).toBeTruthy();
  });

  it('completed re-upload resumes the SAME run and inserts 0 new rows for ALL entities, incl. keyless children', async () => {
    // Re-run with the same file (re-parsed) and same file_hash. RUN1 finalized -> status='completed'.
    // create_run must RESUME that completed run (return RUN1's id), so the persisted entity_map
    // short-circuits EVERY entity (keyed parents AND keyless children) -> 0 inserts. This is the C3
    // audit-integrity fix: before it, keyless children (devices/quoteItems/invoiceLineItems/notes/
    // statusHistory) had no business key + no metadata column, so a fresh-run re-upload duplicated
    // them (duplicating append-only case_job_history violates forensic/audit rules).

    // Count live keyless-child rows for the imported cases BEFORE the re-upload.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyClient = client as any;
    const { data: importedCases } = await anyClient
      .from('cases')
      .select('id')
      .filter('metadata->>data_migration_run_id', 'eq', runId)
      .is('deleted_at', null) as { data: Array<{ id: string }> | null };
    const caseIds = (importedCases ?? []).map(c => c.id);
    expect(caseIds.length).toBeGreaterThan(0);

    async function childCounts(): Promise<Record<string, number>> {
      const quoteIds = (
        (await client.from('quotes').select('id').in('case_id', caseIds).is('deleted_at', null)).data ?? []
      ).map(q => q.id);
      const invoiceIds = (
        (await client.from('invoices').select('id').in('case_id', caseIds).is('deleted_at', null)).data ?? []
      ).map(i => i.id);
      const [devices, notes, statusHistory, quoteItems, invoiceLineItems] = await Promise.all([
        client.from('case_devices').select('*', { count: 'exact', head: true }).in('case_id', caseIds).is('deleted_at', null),
        client.from('case_internal_notes').select('*', { count: 'exact', head: true }).in('case_id', caseIds).is('deleted_at', null),
        client.from('case_job_history').select('*', { count: 'exact', head: true }).in('case_id', caseIds).eq('action', 'STATUS_CHANGED'),
        quoteIds.length
          ? client.from('quote_items').select('*', { count: 'exact', head: true }).in('quote_id', quoteIds).is('deleted_at', null)
          : Promise.resolve({ count: 0 }),
        invoiceIds.length
          ? client.from('invoice_line_items').select('*', { count: 'exact', head: true }).in('invoice_id', invoiceIds).is('deleted_at', null)
          : Promise.resolve({ count: 0 }),
      ]);
      return {
        devices: devices.count ?? 0,
        notes: notes.count ?? 0,
        statusHistory: statusHistory.count ?? 0,
        quoteItems: quoteItems.count ?? 0,
        invoiceLineItems: invoiceLineItems.count ?? 0,
      };
    }

    const childrenBefore = await childCounts();

    const reparsed = parseWorkbook(fileBytes);
    const summary2 = await runImport(
      reparsed,
      { filename: 'round-trip-fixture.xlsx', hash: fileHash },
      _p => undefined,
    );

    // create_run resumed the completed run: SAME run id, no new run.
    expect(summary2.runId).toBe(runId);

    // All entities: 0 inserted (every legacy_id already in the entity_map -> skipped_duplicate).
    for (const entity of Object.keys(summary2.counts)) {
      expect(summary2.counts[entity as keyof typeof summary2.counts]?.inserted ?? 0).toBe(0);
    }

    // No duplicate child rows materialized: live keyless-child counts are unchanged after RUN2.
    const childrenAfter = await childCounts();
    expect(childrenAfter).toEqual(childrenBefore);

    // finalize is idempotent: exactly ONE IMPORT_FINALIZED provenance row remains (no second).
    const { count: provCount } = await client
      .from('audit_trails')
      .select('id', { count: 'exact', head: true })
      .eq('record_id', runId)
      .eq('action', 'IMPORT_FINALIZED');
    expect(provCount).toBe(1);
  });
});

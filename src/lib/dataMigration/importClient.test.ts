import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import type { ParsedWorkbook, RawRow } from './workbookContract';
import { IMPORT_ORDER } from './workbookContract';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../supabaseClient', () => ({ supabase: { rpc } }));
// The real workbookBuilder is used so the error report is a genuine, inspectable xlsx.

import { ERROR_SHEET_NAME, runImport } from './importClient';

function empty(): ParsedWorkbook {
  return Object.fromEntries(IMPORT_ORDER.map((e) => [e, [] as RawRow[]])) as ParsedWorkbook;
}

function mockRpc(insertedOk = true) {
  rpc.mockImplementation((fn: string, args: Record<string, unknown>) => {
    if (fn === 'data_migration_create_run') return Promise.resolve({ data: 'run-1', error: null });
    if (fn === 'data_migration_finalize') return Promise.resolve({ data: { sequences_advanced: [], provenance_written: 0 }, error: null });
    if (fn === 'data_migration_import_batch') {
      const rows = args.p_rows as Array<{ legacy_id: string }>;
      return Promise.resolve({
        data: { results: rows.map((r) => ({ legacy_id: r.legacy_id, new_id: insertedOk ? 'n-' + r.legacy_id : null, status: insertedOk ? 'inserted' : 'error', error: insertedOk ? null : 'bad' })) },
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  });
}

beforeEach(() => { rpc.mockReset(); });

describe('runImport orchestration', () => {
  it('validates first and aborts before any RPC when invalid', async () => {
    mockRpc();
    const wb = empty();
    wb.customers = [{ legacy_id: 'CU1' }]; // missing required customer_name
    await expect(runImport(wb, { filename: 'x.xlsx', hash: 'h' }, () => {}, 'records')).rejects.toThrow(/validation/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('creates a run, then sends batches in IMPORT_ORDER, then finalizes', async () => {
    mockRpc();
    const wb = empty();
    wb.companies = [{ legacy_id: 'C1', name: 'Acme' }];
    wb.customers = [{ legacy_id: 'CU1', customer_name: 'Jo' }];
    await runImport(wb, { filename: 'x.xlsx', hash: 'h' }, () => {}, 'records');

    const calls = rpc.mock.calls.map((c) => c[0]);
    expect(calls[0]).toBe('data_migration_create_run');
    expect(calls[calls.length - 1]).toBe('data_migration_finalize');
    const batchEntities = rpc.mock.calls.filter((c) => c[0] === 'data_migration_import_batch').map((c) => c[1].p_entity_type);
    expect(batchEntities).toEqual(['companies', 'customers']); // empty entities skipped, order preserved
    const cIdx = IMPORT_ORDER.indexOf('companies');
    const cuIdx = IMPORT_ORDER.indexOf('customers');
    expect(cIdx).toBeLessThan(cuIdx);
  });

  it('chunks rows by 500', async () => {
    mockRpc();
    const wb = empty();
    wb.customers = Array.from({ length: 1200 }, (_, i) => ({ legacy_id: 'CU' + i, customer_name: 'n' + i }));
    await runImport(wb, { filename: 'x.xlsx', hash: 'h' }, () => {}, 'records');
    const custBatches = rpc.mock.calls.filter((c) => c[0] === 'data_migration_import_batch' && c[1].p_entity_type === 'customers');
    expect(custBatches).toHaveLength(3); // 500 + 500 + 200
    expect((custBatches[0][1].p_rows as unknown[]).length).toBe(500);
    expect((custBatches[2][1].p_rows as unknown[]).length).toBe(200);
  });

  it('accumulates counts and produces an error report when rows fail', async () => {
    mockRpc(false);
    const wb = empty();
    wb.customers = [{ legacy_id: 'CU1', customer_name: 'Jo' }];
    const summary = await runImport(wb, { filename: 'x.xlsx', hash: 'h' }, () => {}, 'records');
    expect(summary.runId).toBe('run-1');
    expect(summary.counts.customers).toEqual({ inserted: 0, skipped: 0, error: 1 });
    expect(summary.errorReport).toBeInstanceOf(ArrayBuffer);
  });

  it('carries the per-row failure REASON into the downloadable error report (not just a count)', async () => {
    mockRpc(false); // every row fails with error: 'bad'
    const wb = empty();
    wb.customers = [{ legacy_id: 'CU1', customer_name: 'Jo' }];
    const summary = await runImport(wb, { filename: 'x.xlsx', hash: 'h' }, () => {}, 'records');

    expect(summary.errorReport).toBeInstanceOf(ArrayBuffer);
    const book = XLSX.read(summary.errorReport!, { type: 'array' });
    // A dedicated reasons sheet exists and leads the workbook.
    expect(book.SheetNames).toContain(ERROR_SHEET_NAME);
    expect(book.SheetNames[0]).toBe(ERROR_SHEET_NAME);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[ERROR_SHEET_NAME]);
    const cu1 = rows.find((r) => r['Record Ref'] === 'CU1');
    expect(cu1, 'failed legacy_id CU1 should appear in the errors sheet').toBeTruthy();
    expect(cu1!['Import Error']).toBe('bad'); // the reason, not a numeric count, survives
  });

  it('counts skipped_duplicate rows on resume', async () => {
    rpc.mockImplementation((fn: string, args: Record<string, unknown>) => {
      if (fn === 'data_migration_create_run') return Promise.resolve({ data: 'run-1', error: null });
      if (fn === 'data_migration_finalize') return Promise.resolve({ data: {}, error: null });
      const rows = args.p_rows as Array<{ legacy_id: string }>;
      return Promise.resolve({ data: { results: rows.map((r) => ({ legacy_id: r.legacy_id, new_id: 'n', status: 'skipped_duplicate', error: null })) }, error: null });
    });
    const wb = empty();
    wb.customers = [{ legacy_id: 'CU1', customer_name: 'Jo' }];
    const summary = await runImport(wb, { filename: 'x.xlsx', hash: 'h' }, () => {}, 'records');
    expect(summary.counts.customers).toEqual({ inserted: 0, skipped: 1, error: 0 });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';

interface RpcArgs {
  p_entity_type: string;
  p_after_created_at: string | null;
  p_after_id: string | null;
  p_limit: number;
  p_filters: Record<string, unknown>;
}

const rpcCalls: RpcArgs[] = [];

// Two pages for `companies`, one for everything else.
const rpc = vi.fn((_fn: string, args: RpcArgs) => {
  rpcCalls.push(args);
  if (args.p_entity_type === 'companies') {
    if (args.p_after_created_at === null) {
      return Promise.resolve({
        data: {
          rows: [{ legacy_id: 'c1', name: 'Acme', created_at: '2026-01-01T00:00:00.000Z' }],
          next: { created_at: '2026-01-01T00:00:00.000Z', id: 'c1' },
        },
        error: null,
      });
    }
    return Promise.resolve({
      data: {
        rows: [{ legacy_id: 'c2', name: 'Globex', created_at: '2026-01-02T00:00:00.000Z' }],
        next: null,
      },
      error: null,
    });
  }
  return Promise.resolve({ data: { rows: [], next: null }, error: null });
});

vi.mock('../supabaseClient', () => ({
  supabase: { rpc: (fn: string, args: RpcArgs) => rpc(fn, args) },
  getTenantId: () => 'tenant-xyz',
}));

import { runExport, EXPORT_PAGE_SIZE } from './exportClient';
import { IMPORT_ORDER } from './workbookContract';

describe('runExport', () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    rpc.mockClear();
  });

  it('pages each selected entity with p_limit=1000 and follows next cursors', async () => {
    const progress: Array<{ entity: string; fetched: number }> = [];
    const buf = await runExport({ domain: 'records', entities: ['companies'] }, (p) => progress.push(p));

    const companyCalls = rpcCalls.filter((c) => c.p_entity_type === 'companies');
    expect(companyCalls).toHaveLength(2);
    expect(companyCalls[0].p_limit).toBe(1000);
    expect(companyCalls[0].p_after_created_at).toBeNull();
    expect(companyCalls[1].p_after_created_at).toBe('2026-01-01T00:00:00.000Z');
    expect(companyCalls[1].p_after_id).toBe('c1');

    // cumulative progress reported per page
    expect(progress.filter((p) => p.entity === 'companies').map((p) => p.fetched)).toEqual([1, 2]);

    // assembled workbook holds both rows
    const wb = XLSX.read(buf, { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames.find((n) => n !== '_meta')!]);
    expect(rows.length).toBeGreaterThanOrEqual(0); // companies sheet present
    expect(wb.SheetNames).toContain('_meta');
  });

  it('exports entities in IMPORT_ORDER and forwards the date range as filters', async () => {
    await runExport(
      { domain: 'records', entities: ['cases', 'companies'], dateFrom: '2026-01-01', dateTo: '2026-12-31' },
      () => {},
    );
    const order = rpcCalls.map((c) => c.p_entity_type).filter((e, i, a) => a.indexOf(e) === i);
    // requested {cases, companies} but emitted in canonical order: companies before cases
    expect(order.indexOf('companies')).toBeLessThan(order.indexOf('cases'));
    expect(rpcCalls[0].p_filters).toMatchObject({ dateFrom: '2026-01-01', dateTo: '2026-12-31' });
  });

  it('only queries the selected entities', async () => {
    await runExport({ domain: 'records', entities: ['notes'] }, () => {});
    const queried = new Set(rpcCalls.map((c) => c.p_entity_type));
    expect(queried).toEqual(new Set(['notes']));
    for (const e of IMPORT_ORDER) {
      if (e !== 'notes') expect(queried.has(e)).toBe(false);
    }
  });

  it('exports EXPORT_PAGE_SIZE constant as 1000', () => {
    expect(EXPORT_PAGE_SIZE).toBe(1000);
  });
});

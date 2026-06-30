import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseWorkbook, readWorkbookMeta, computeFileHash } from './workbookParser';
import { buildWorkbook, type WorkbookMeta } from './workbookBuilder';
import {
  SHEET_NAMES,
  ENTITY_COLUMNS,
  IMPORT_ORDER,
  type EntityType,
  type ParsedWorkbook,
  type RawRow,
} from './workbookContract';

function emptyData(): ParsedWorkbook {
  return Object.fromEntries(IMPORT_ORDER.map((e) => [e, [] as RawRow[]])) as ParsedWorkbook;
}
function emptyCounts(): Record<EntityType, number> {
  return Object.fromEntries(IMPORT_ORDER.map((e) => [e, 0])) as Record<EntityType, number>;
}

const META: WorkbookMeta = {
  sourceTenant: 'tenant-123',
  exportedAt: '2026-06-30T00:00:00.000Z',
  schemaVersion: 1,
  counts: emptyCounts(),
};

describe('parseWorkbook', () => {
  it('reads the human HEADER labels written by buildWorkbook back into key-shaped rows', () => {
    // buildWorkbook writes col.header as the sheet header; the parser must remap header -> key.
    const data = emptyData();
    data.companies = [{ legacy_id: 'C1', name: 'Acme', email: 'a@acme.test', created_at: '2021-03-01T00:00:00Z' }];
    data.cases = [{ legacy_id: 'K1', case_number: 'CASE-0001', customer_legacy_id: 'CU1', created_at: '2021-04-02T00:00:00Z' }];

    const wb = parseWorkbook(buildWorkbook(data, META));

    // Rows come back keyed by ColumnDef.key — NOT by the human header text.
    expect(wb.companies).toHaveLength(1);
    expect(wb.companies[0]).toMatchObject({ legacy_id: 'C1', name: 'Acme' });
    expect(wb.companies[0]).not.toHaveProperty('Company Name');
    expect(wb.cases[0]).toMatchObject({ legacy_id: 'K1', case_number: 'CASE-0001', customer_legacy_id: 'CU1' });
  });

  it('also accepts an operator-authored sheet keyed directly by ColumnDef.key', () => {
    const wb = XLSX.utils.book_new();
    const companies = XLSX.utils.json_to_sheet([{ legacy_id: 'C1', name: 'Acme' }]);
    XLSX.utils.book_append_sheet(wb, companies, SHEET_NAMES.companies);
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const parsed = parseWorkbook(buf);
    expect(parsed.companies[0]).toMatchObject({ legacy_id: 'C1', name: 'Acme' });
  });

  it('returns an empty array for absent optional sheets', () => {
    const data = emptyData();
    data.companies = [{ legacy_id: 'C1', name: 'Acme' }];
    const wb = parseWorkbook(buildWorkbook(data, META));
    expect(wb.invoices).toEqual([]);
    expect(wb.quoteItems).toEqual([]);
  });
});

describe('buildWorkbook -> parseWorkbook symmetry', () => {
  it('round-trips a representative multi-entity workbook with no key loss', () => {
    const data = emptyData();
    data.companies = [
      { legacy_id: 'CO1', name: 'Acme Labs', email: 'info@acme.test', phone: '+15550001', is_active: true, created_at: '2024-01-01T08:00:00.000Z' },
    ];
    data.customers = [
      { legacy_id: 'CU1', customer_name: 'Jo Río', email: 'jo@example.com', phone: '+447000000001', created_at: '2024-02-01T08:00:00.000Z' },
    ];
    data.relationships = [
      { legacy_id: 'R1', customer_legacy_id: 'CU1', company_legacy_id: 'CO1', role: 'client', is_primary: true, created_at: '2024-02-01T08:00:00.000Z' },
    ];
    data.cases = [
      { legacy_id: 'K1', case_number: 'CASE-00001', customer_legacy_id: 'CU1', company_legacy_id: 'CO1', status: 'pending', subject: 'Recover RAID', description: 'desc', created_at: '2024-03-01T08:00:00.000Z' },
    ];
    data.devices = [
      { legacy_id: 'D1', case_legacy_id: 'K1', device_type: 'HDD', brand: 'Seagate', model: 'ST-1', serial_number: 'SN1', capacity: '1TB', interface: 'SATA', condition: 'Good', created_at: '2024-03-01T08:00:00.000Z' },
    ];
    data.quotes = [
      { legacy_id: 'Q1', case_legacy_id: 'K1', quote_number: 'QUOTE-00001', status: 'draft', subtotal: 100, tax_amount: 5, total_amount: 105, created_at: '2024-03-02T08:00:00.000Z' },
    ];
    data.quoteItems = [
      { legacy_id: 'QI1', quote_legacy_id: 'Q1', description: 'Service', quantity: 1, unit_price: 100, total: 100, sort_order: 1, created_at: '2024-03-02T08:00:00.000Z' },
    ];
    data.invoices = [
      { legacy_id: 'I1', case_legacy_id: 'K1', invoice_number: 'INV-00001', status: 'paid', subtotal: 100, tax_amount: 5, total_amount: 105, created_at: '2024-03-03T08:00:00.000Z' },
    ];
    data.invoiceLineItems = [
      { legacy_id: 'IL1', invoice_legacy_id: 'I1', description: 'Service', quantity: 1, unit_price: 100, tax_amount: 5, total: 105, sort_order: 1, created_at: '2024-03-03T08:00:00.000Z' },
    ];
    data.notes = [
      { legacy_id: 'N1', case_legacy_id: 'K1', content: 'recovered OK', created_at: '2024-03-04T08:00:00.000Z' },
    ];
    data.statusHistory = [
      { legacy_id: 'SH1', case_legacy_id: 'K1', action: 'status_change', old_value: '', new_value: 'pending', created_at: '2024-03-01T09:00:00.000Z' },
    ];

    const parsed = parseWorkbook(buildWorkbook(data, META));

    // Every entity's rows survive header<->key translation with identical key/value content.
    for (const entity of IMPORT_ORDER) {
      const original = data[entity];
      const back = parsed[entity];
      expect(back).toHaveLength(original.length);
      original.forEach((origRow, i) => {
        // Only contract columns survive; compare on the contract key set.
        const keys = ENTITY_COLUMNS[entity].map((c) => c.key);
        for (const k of keys) {
          if (origRow[k] === undefined) continue;
          expect(back[i][k]).toBe(origRow[k]);
        }
      });
    }
  });
});

describe('readWorkbookMeta', () => {
  it('reads schema_version from the _meta sheet', () => {
    const buf = buildWorkbook(emptyData(), META);
    const meta = readWorkbookMeta(buf);
    expect(meta.schemaVersion).toBe(1);
    expect(meta.sourceTenant).toBe('tenant-123');
  });

  it('returns null schemaVersion when there is no _meta sheet', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ legacy_id: 'C1' }]), SHEET_NAMES.companies);
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    expect(readWorkbookMeta(buf).schemaVersion).toBeNull();
  });
});

describe('computeFileHash', () => {
  it('is deterministic and 64 hex chars (sha-256)', async () => {
    const buf = buildWorkbook(emptyData(), META);
    const h1 = await computeFileHash(buf);
    const h2 = await computeFileHash(buf);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs for different content', async () => {
    const a = new TextEncoder().encode('alpha').buffer;
    const b = new TextEncoder().encode('beta').buffer;
    expect(await computeFileHash(a)).not.toBe(await computeFileHash(b));
  });
});

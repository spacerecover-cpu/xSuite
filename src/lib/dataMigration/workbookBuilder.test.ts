import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildWorkbook, buildTemplateWorkbook, type WorkbookMeta } from './workbookBuilder';
import { parseWorkbook, readWorkbookMeta } from './workbookParser';
import {
  SHEET_NAMES,
  ENTITY_COLUMNS,
  IMPORT_ORDER,
  DOMAIN_ENTITIES,
  WORKBOOK_SCHEMA_VERSION,
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

describe('buildWorkbook', () => {
  const meta: WorkbookMeta = {
    domain: 'records',
    sourceTenant: 'tenant-123',
    exportedAt: '2026-06-30T00:00:00.000Z',
    schemaVersion: 1,
    counts: { ...emptyCounts(), companies: 1, cases: 1 },
  };

  it('returns an ArrayBuffer parseable by SheetJS', () => {
    const buf = buildWorkbook(emptyData(), meta);
    expect(buf).toBeInstanceOf(ArrayBuffer);
    expect(buf.byteLength).toBeGreaterThan(0);
    const wb = XLSX.read(buf, { type: 'array' });
    expect(wb.SheetNames).toContain('_meta');
  });

  it('appends a Reference sheet with the master lists, which the parser ignores on re-import', () => {
    const refs = { 'Payment Methods': ['Cash', 'Card'], Currencies: ['USD', 'OMR', 'AED'] };
    const buf = buildWorkbook(emptyData(), meta, refs);
    const wb = XLSX.read(buf, { type: 'array' });
    // The reference block is a distinct sheet (not one of the entity sheets).
    expect(wb.SheetNames).toContain('Reference (Valid Values)');
    const aoa = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Reference (Valid Values)'], { header: 1 });
    expect(aoa[0]).toEqual(['Payment Methods', 'Currencies']); // header row = list labels
    const flat = aoa.slice(1).flat();
    expect(flat).toContain('Cash');
    expect(flat).toContain('OMR');
    // The parser never treats the reference sheet as an entity — data still parses cleanly.
    const parsed = parseWorkbook(buf);
    expect(parsed.companies).toEqual([]);
    expect(readWorkbookMeta(buf).domain).toBe('records');
  });

  it('writes one sheet per DOMAIN entity using SHEET_NAMES, plus _meta (no cross-domain sheets)', () => {
    const wb = XLSX.read(buildWorkbook(emptyData(), meta), { type: 'array' });
    for (const entity of DOMAIN_ENTITIES.records) {
      expect(wb.SheetNames).toContain(SHEET_NAMES[entity]);
    }
    // an inventory sheet must NOT appear in a records workbook
    expect(wb.SheetNames).not.toContain(SHEET_NAMES.inventoryItems);
    expect(wb.SheetNames).toContain('_meta');
  });

  it('emits ENTITY_COLUMNS headers in declared order for each sheet', () => {
    const wb = XLSX.read(buildWorkbook(emptyData(), meta), { type: 'array' });
    const sheet = wb.Sheets[SHEET_NAMES.companies];
    const headerRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
    expect(headerRows[0]).toEqual(ENTITY_COLUMNS.companies.map((c) => c.header));
  });

  it('writes values under the human HEADER (raw SheetJS read is header-keyed)', () => {
    const firstCol = ENTITY_COLUMNS.companies[0];
    const data = emptyData();
    data.companies = [
      Object.fromEntries(
        ENTITY_COLUMNS.companies.map((c) => [c.key, `${c.key}-val`]),
      ) as RawRow,
    ];
    const wb = XLSX.read(buildWorkbook(data, meta), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[SHEET_NAMES.companies]);
    expect(rows).toHaveLength(1);
    // Raw SheetJS read keys by the human header (builder writes col.header as the column label).
    expect(rows[0][firstCol.header]).toBe(`${firstCol.key}-val`);
    // The header text is NOT a ColumnDef.key — proving the parser must translate it back.
    expect(rows[0][firstCol.key]).toBeUndefined();
  });

  it('parseWorkbook recovers ColumnDef.key-shaped rows from buildWorkbook output (symmetry)', () => {
    const data = emptyData();
    data.companies = [
      Object.fromEntries(
        ENTITY_COLUMNS.companies.map((c) => [c.key, `${c.key}-val`]),
      ) as RawRow,
    ];
    const parsed = parseWorkbook(buildWorkbook(data, meta));
    expect(parsed.companies).toHaveLength(1);
    for (const c of ENTITY_COLUMNS.companies) {
      expect(parsed.companies[0][c.key]).toBe(`${c.key}-val`);
    }
  });

  it('writes meta fields into the _meta sheet', () => {
    const wb = XLSX.read(buildWorkbook(emptyData(), meta), { type: 'array' });
    const metaRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['_meta']);
    const byKey = Object.fromEntries(metaRows.map((r) => [r.key, r.value]));
    expect(byKey.source_tenant).toBe('tenant-123');
    expect(byKey.exported_at).toBe('2026-06-30T00:00:00.000Z');
    expect(String(byKey.schema_version)).toBe('1');
  });
});

describe('buildTemplateWorkbook', () => {
  it('produces a headers-only template with exactly the domain sheets and zero data rows', () => {
    for (const domain of ['records', 'inventory'] as const) {
      const buf = buildTemplateWorkbook(domain);
      const parsed = parseWorkbook(buf);
      const wb = XLSX.read(buf, { type: 'array' });
      const expectedSheets = DOMAIN_ENTITIES[domain].map((e) => SHEET_NAMES[e]);
      // exactly this domain's sheets (+ _meta) — no cross-domain sheets
      expect(wb.SheetNames.filter((n) => n !== '_meta').sort()).toEqual([...expectedSheets].sort());
      for (const entity of DOMAIN_ENTITIES[domain]) {
        expect(parsed[entity], `${entity} should have no data rows`).toEqual([]);
        const headerRows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[SHEET_NAMES[entity]], { header: 1 });
        expect(headerRows[0]).toEqual(ENTITY_COLUMNS[entity].map((c) => c.header));
      }
    }
  });

  it('carries the domain + schema_version so a filled-in template re-imports cleanly', () => {
    const meta = readWorkbookMeta(buildTemplateWorkbook('inventory'));
    expect(meta.schemaVersion).toBe(WORKBOOK_SCHEMA_VERSION);
    expect(meta.domain).toBe('inventory');
  });
});

describe('buildWorkbook — jsonb object cells', () => {
  const meta: WorkbookMeta = {
    domain: 'inventory', sourceTenant: 't', exportedAt: '2026-07-01T00:00:00.000Z', schemaVersion: 1, counts: emptyCounts(),
  };
  it('serializes an object-valued cell (technical_details) to a JSON string, not "[object Object]"', () => {
    const data = emptyData();
    data.inventoryItems = [
      { legacy_id: 'INV1', model: 'ST2000', technical_details: { pcb_number: '100664987', dcm: 'CC45' } } as RawRow,
    ];
    const parsed = parseWorkbook(buildWorkbook(data, meta));
    expect(parsed.inventoryItems[0].technical_details).toBe('{"pcb_number":"100664987","dcm":"CC45"}');
  });
});

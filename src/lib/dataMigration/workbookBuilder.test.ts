import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildWorkbook, type WorkbookMeta } from './workbookBuilder';
import { parseWorkbook } from './workbookParser';
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

describe('buildWorkbook', () => {
  const meta: WorkbookMeta = {
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

  it('writes one sheet per entity using SHEET_NAMES, plus _meta', () => {
    const wb = XLSX.read(buildWorkbook(emptyData(), meta), { type: 'array' });
    for (const entity of IMPORT_ORDER) {
      expect(wb.SheetNames).toContain(SHEET_NAMES[entity]);
    }
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

import * as XLSX from 'xlsx';
import {
  SHEET_NAMES,
  ENTITY_COLUMNS,
  IMPORT_ORDER,
  WORKBOOK_SCHEMA_VERSION,
  type EntityType,
  type ParsedWorkbook,
  type RawRow,
} from './workbookContract';

export interface WorkbookMeta {
  sourceTenant: string;
  exportedAt: string;
  schemaVersion: number;
  counts: Record<EntityType, number>;
}

/**
 * Build the canonical export workbook: one sheet per entity (SHEET_NAMES order,
 * ENTITY_COLUMNS headers) plus a `_meta` sheet. Values are written under the
 * human-readable header so the file is operator-editable; the parser maps
 * header -> ColumnDef.key on the way back in.
 */
export function buildWorkbook(data: ParsedWorkbook, meta: WorkbookMeta): ArrayBuffer {
  const wb = XLSX.utils.book_new();

  for (const entity of IMPORT_ORDER) {
    const cols = ENTITY_COLUMNS[entity];
    const rows = data[entity] ?? [];
    const aoa: unknown[][] = [cols.map((c) => c.header)];
    for (const row of rows) {
      aoa.push(cols.map((c) => normalizeCell(row[c.key])));
    }
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, sheet, SHEET_NAMES[entity]);
  }

  const metaRows: Array<{ key: string; value: string }> = [
    { key: 'source_tenant', value: meta.sourceTenant },
    { key: 'exported_at', value: meta.exportedAt },
    { key: 'schema_version', value: String(meta.schemaVersion) },
    ...IMPORT_ORDER.map((e) => ({
      key: `count_${e}`,
      value: String(meta.counts[e] ?? 0),
    })),
  ];
  const metaSheet = XLSX.utils.json_to_sheet(metaRows, { header: ['key', 'value'] });
  XLSX.utils.book_append_sheet(wb, metaSheet, '_meta');

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return out;
}

/**
 * Build a blank import template: one sheet per entity with the contract headers and NO data
 * rows, plus a `_meta` sheet carrying the current schema_version so a filled-in copy re-imports
 * cleanly. This is exactly an empty export workbook (same shape the importer expects), so a user
 * can download it, fill it in, and upload it back.
 */
export function buildTemplateWorkbook(): ArrayBuffer {
  const emptyData = Object.fromEntries(IMPORT_ORDER.map((e) => [e, [] as RawRow[]])) as ParsedWorkbook;
  const counts = Object.fromEntries(IMPORT_ORDER.map((e) => [e, 0])) as Record<EntityType, number>;
  return buildWorkbook(emptyData, {
    sourceTenant: '',
    exportedAt: '',
    schemaVersion: WORKBOOK_SCHEMA_VERSION,
    counts,
  });
}

function normalizeCell(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

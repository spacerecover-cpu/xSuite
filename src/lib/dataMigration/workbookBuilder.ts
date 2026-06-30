import * as XLSX from 'xlsx';
import {
  SHEET_NAMES,
  ENTITY_COLUMNS,
  IMPORT_ORDER,
  type EntityType,
  type ParsedWorkbook,
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

function normalizeCell(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

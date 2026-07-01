import * as XLSX from 'xlsx';
import {
  SHEET_NAMES,
  ENTITY_COLUMNS,
  IMPORT_ORDER,
  DOMAIN_ENTITIES,
  WORKBOOK_SCHEMA_VERSION,
  type EntityType,
  type ParsedWorkbook,
  type RawRow,
  type WorkbookDomain,
} from './workbookContract';

export interface WorkbookMeta {
  domain: WorkbookDomain;
  sourceTenant: string;
  exportedAt: string;
  schemaVersion: number;
  counts: Record<EntityType, number>;
}

/**
 * Build a workbook for ONE domain: one sheet per entity of that domain (SHEET_NAMES order,
 * ENTITY_COLUMNS headers) plus a `_meta` sheet carrying `domain` + schema_version. Values are
 * written under the human-readable header so the file is operator-editable; the parser maps
 * header -> ColumnDef.key on the way back in. A records workbook never contains inventory
 * sheets and vice versa — the `domain` marker lets the importer reject a cross-domain file.
 */
export function buildWorkbook(data: ParsedWorkbook, meta: WorkbookMeta): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const entities = DOMAIN_ENTITIES[meta.domain];

  for (const entity of entities) {
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
    { key: 'domain', value: meta.domain },
    { key: 'source_tenant', value: meta.sourceTenant },
    { key: 'exported_at', value: meta.exportedAt },
    { key: 'schema_version', value: String(meta.schemaVersion) },
    ...entities.map((e) => ({ key: `count_${e}`, value: String(meta.counts[e] ?? 0) })),
  ];
  const metaSheet = XLSX.utils.json_to_sheet(metaRows, { header: ['key', 'value'] });
  XLSX.utils.book_append_sheet(wb, metaSheet, '_meta');

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return out;
}

/**
 * Build a blank import template for one domain: the domain's sheets with contract headers and
 * NO data rows, plus a `_meta` sheet carrying `domain` + schema_version so a filled-in copy
 * re-imports cleanly (and only into the matching domain flow).
 */
export function buildTemplateWorkbook(domain: WorkbookDomain): ArrayBuffer {
  const emptyData = Object.fromEntries(IMPORT_ORDER.map((e) => [e, [] as RawRow[]])) as ParsedWorkbook;
  const counts = Object.fromEntries(IMPORT_ORDER.map((e) => [e, 0])) as Record<EntityType, number>;
  return buildWorkbook(emptyData, {
    domain,
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
  // jsonb columns (e.g. inventoryItems.technical_details) arrive as objects/arrays on
  // export — serialize to a JSON string so the cell round-trips, not "[object Object]".
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

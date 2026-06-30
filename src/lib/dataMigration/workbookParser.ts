import * as XLSX from 'xlsx';
import {
  type EntityType,
  type ParsedWorkbook,
  type RawRow,
  SHEET_NAMES,
  ENTITY_COLUMNS,
} from './workbookContract';

const ENTITY_TYPES = Object.keys(SHEET_NAMES) as EntityType[];

/** Read an .xlsx ArrayBuffer into a per-entity row map. Missing sheets → []. */
export function parseWorkbook(file: ArrayBuffer): ParsedWorkbook {
  const book = XLSX.read(file, { type: 'array', cellDates: false });
  const result = {} as ParsedWorkbook;

  for (const entity of ENTITY_TYPES) {
    const sheet = book.Sheets[SHEET_NAMES[entity]];
    if (!sheet) {
      result[entity] = [];
      continue;
    }
    const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: null, raw: true });
    // buildWorkbook writes the human-readable header as the sheet column label, so
    // sheet_to_json keys each row by header text. Translate header -> ColumnDef.key
    // (also accepting a raw key, for operator-authored files that used keys directly)
    // and keep only columns the contract recognises.
    const headerToKey = new Map<string, string>();
    const validKeys = new Set<string>();
    for (const col of ENTITY_COLUMNS[entity]) {
      headerToKey.set(col.header, col.key);
      validKeys.add(col.key);
    }
    result[entity] = rows.map((row) => {
      const clean: RawRow = {};
      for (const label of Object.keys(row)) {
        const key = headerToKey.get(label) ?? (validKeys.has(label) ? label : undefined);
        if (key !== undefined) clean[key] = row[label];
      }
      return clean;
    });
  }
  return result;
}

export interface ParsedWorkbookMeta {
  /** schema_version parsed from the `_meta` sheet; null when the sheet/field is absent. */
  schemaVersion: number | null;
  sourceTenant: string | null;
  exportedAt: string | null;
}

/**
 * Read the `_meta` sheet's key/value rows (written by buildWorkbook). Returns
 * nulls for any field the file does not carry (e.g. an operator-authored file
 * with no _meta sheet). The parser does not throw — schema-version compatibility
 * is enforced by the validator so it can be reported as a structured issue.
 */
export function readWorkbookMeta(file: ArrayBuffer): ParsedWorkbookMeta {
  const book = XLSX.read(file, { type: 'array', cellDates: false });
  const sheet = book.Sheets['_meta'];
  if (!sheet) return { schemaVersion: null, sourceTenant: null, exportedAt: null };
  const rows = XLSX.utils.sheet_to_json<{ key?: unknown; value?: unknown }>(sheet, { defval: null });
  const byKey = new Map<string, unknown>();
  for (const row of rows) {
    if (row.key != null) byKey.set(String(row.key), row.value);
  }
  const rawVersion = byKey.get('schema_version');
  const parsedVersion =
    rawVersion == null || rawVersion === '' ? null : Number(rawVersion);
  return {
    schemaVersion: parsedVersion != null && Number.isFinite(parsedVersion) ? parsedVersion : null,
    sourceTenant: byKey.has('source_tenant') ? String(byKey.get('source_tenant') ?? '') : null,
    exportedAt: byKey.has('exported_at') ? String(byKey.get('exported_at') ?? '') : null,
  };
}

/** SHA-256 hex of the raw file bytes (resume key). */
export async function computeFileHash(file: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', file);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

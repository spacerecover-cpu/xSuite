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
    const allowed = new Set(ENTITY_COLUMNS[entity].map((c) => c.key));
    result[entity] = rows.map((row) => {
      const clean: RawRow = {};
      for (const key of Object.keys(row)) {
        if (allowed.has(key)) clean[key] = row[key];
      }
      return clean;
    });
  }
  return result;
}

/** SHA-256 hex of the raw file bytes (resume key). */
export async function computeFileHash(file: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', file);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

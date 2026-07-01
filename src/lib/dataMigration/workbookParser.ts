import * as XLSX from 'xlsx';
import { unzipSync, zipSync } from 'fflate';
import {
  type EntityType,
  type ParsedWorkbook,
  type RawRow,
  type WorkbookDomain,
  SHEET_NAMES,
  ENTITY_COLUMNS,
  WORKBOOK_DOMAINS,
} from './workbookContract';

const ENTITY_TYPES = Object.keys(SHEET_NAMES) as EntityType[];

const XLSX_READ_OPTS = { type: 'array', cellDates: false } as const;

/**
 * Re-pack a ZIP archive into a plain STORE (uncompressed) zip. fflate's `unzipSync`
 * tolerates the "streaming"/data-descriptor ZIP variant (general-purpose bit 3) that
 * LibreOffice, Google Sheets and Apple Numbers write; re-emitting the same entries with
 * `zipSync({ level: 0 })` yields a standard archive SheetJS reads reliably. Exported for tests.
 */
export function repackXlsxZip(bytes: Uint8Array): Uint8Array {
  return zipSync(unzipSync(bytes), { level: 0 });
}

/**
 * Read an .xlsx ArrayBuffer into a SheetJS workbook, tolerant of streaming ZIPs.
 *
 * In the browser SheetJS has no `zlib` (its `browser` field disables it) and cannot walk a
 * data-descriptor ZIP, throwing "Unsupported ZIP Compression method NaN". When the direct
 * read fails on ZIP input, recover by re-packing the archive with fflate and retrying. The
 * `read` seam is injectable so the fallback path is unit-testable (Node's SheetJS has zlib
 * and reads such files directly, so the failure can't be reproduced without it).
 */
export function readXlsx(
  file: ArrayBuffer,
  read: (f: ArrayBuffer) => XLSX.WorkBook = (f) => XLSX.read(f, XLSX_READ_OPTS),
): XLSX.WorkBook {
  try {
    return read(file);
  } catch (err) {
    const bytes = new Uint8Array(file);
    // Only attempt recovery for real ZIP archives (local-file-header signature PK\x03\x04);
    // anything else is a genuinely malformed upload — surface the original error.
    if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw err;
    return read(repackXlsxZip(bytes).buffer as ArrayBuffer);
  }
}

/**
 * Headers used by workbooks exported BEFORE the "Legacy ID" -> "Record Ref"
 * header rename. Mapped back to their contract keys so already-exported files
 * keep importing. Each alias is only applied on sheets whose entity actually
 * has the target key, preserving the parser's per-entity column scoping.
 */
const HEADER_ALIASES: Record<string, string> = {
  'Legacy ID': 'legacy_id',
  'Customer Legacy ID': 'customer_legacy_id',
  'Company Legacy ID': 'company_legacy_id',
  'Case Legacy ID': 'case_legacy_id',
  'Quote Legacy ID': 'quote_legacy_id',
  'Invoice Legacy ID': 'invoice_legacy_id',
};

/** Read an .xlsx ArrayBuffer into a per-entity row map. Missing sheets → []. */
export function parseWorkbook(file: ArrayBuffer): ParsedWorkbook {
  const book = readXlsx(file);
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
    // Accept legacy pre-rename headers ("Legacy ID" etc.) for keys this entity owns.
    for (const [oldHeader, key] of Object.entries(HEADER_ALIASES)) {
      if (validKeys.has(key)) headerToKey.set(oldHeader, key);
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
  /** which domain this workbook belongs to; null for older/operator files with no `domain` marker. */
  domain: WorkbookDomain | null;
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
  const book = readXlsx(file);
  const sheet = book.Sheets['_meta'];
  if (!sheet) return { schemaVersion: null, domain: null, sourceTenant: null, exportedAt: null };
  const rows = XLSX.utils.sheet_to_json<{ key?: unknown; value?: unknown }>(sheet, { defval: null });
  const byKey = new Map<string, unknown>();
  for (const row of rows) {
    if (row.key != null) byKey.set(String(row.key), row.value);
  }
  const rawVersion = byKey.get('schema_version');
  const parsedVersion =
    rawVersion == null || rawVersion === '' ? null : Number(rawVersion);
  const rawDomain = byKey.has('domain') ? String(byKey.get('domain') ?? '') : '';
  const domain = (WORKBOOK_DOMAINS as string[]).includes(rawDomain) ? (rawDomain as WorkbookDomain) : null;
  return {
    schemaVersion: parsedVersion != null && Number.isFinite(parsedVersion) ? parsedVersion : null,
    domain,
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

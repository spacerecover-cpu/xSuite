import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';
import { buildWorkbook } from './workbookBuilder';
import { validateWorkbook } from './importValidator';
import {
  type EntityType,
  type ParsedWorkbook,
  type RawRow,
  type WorkbookDomain,
  IMPORT_ORDER,
  DOMAIN_ENTITIES,
  SHEET_NAMES,
  WORKBOOK_SCHEMA_VERSION,
} from './workbookContract';

export interface ImportProgress {
  entity: EntityType;
  processed: number;
  total: number;
  phase: 'validating' | 'importing' | 'finalizing' | 'done';
}
export interface ImportSummary {
  runId: string;
  counts: Record<EntityType, { inserted: number; skipped: number; error: number }>;
  errorReport?: ArrayBuffer;
}

interface BatchRowResult {
  legacy_id: string;
  new_id: string | null;
  status: 'inserted' | 'skipped_duplicate' | 'error';
  error: string | null;
}

/** Batch chunk size — P6.4 asserts this export. */
export const IMPORT_BATCH_SIZE = 500;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function emptyCounts(): Record<EntityType, { inserted: number; skipped: number; error: number }> {
  const c = {} as Record<EntityType, { inserted: number; skipped: number; error: number }>;
  for (const e of IMPORT_ORDER) c[e] = { inserted: 0, skipped: 0, error: 0 };
  return c;
}

function emptyWorkbook(): ParsedWorkbook {
  const wb = {} as ParsedWorkbook;
  for (const e of IMPORT_ORDER) wb[e] = [];
  return wb;
}

/** Non-contract key stamped onto a failed row to carry its per-row failure reason. It is NOT an
 *  ENTITY_COLUMNS key, so buildWorkbook never emits it — buildErrorReport surfaces it explicitly. */
const ERROR_FIELD = '_error';

/** Sheet listing every failed row's reason. Not a contract entity sheet, so the parser ignores it. */
export const ERROR_SHEET_NAME = 'Import Errors';

/**
 * Failed child rows routinely reference PARENTS that imported successfully and are therefore
 * absent from failedRows (e.g. a duplicate-primary relationship fails while its customer and
 * company inserted). Rebuilding the error workbook from failedRows alone would drop those parents,
 * and re-uploading it dead-ends at the in-file FK validator (importValidator) which can no longer
 * resolve them. So pull every parent row the failed rows transitively reference — matched by
 * legacy_id across the ORIGINAL source workbook — back into the report. On re-import those parents
 * dedup (skipped_duplicate) and repopulate the run's entity_map, letting the corrected children
 * resolve. Parents are keyed by `*_legacy_id` columns, exactly what parseWorkbook emits.
 */
function withReferencedParents(
  source: ParsedWorkbook,
  failedRows: ParsedWorkbook,
  domain: WorkbookDomain,
): ParsedWorkbook {
  const entities = DOMAIN_ENTITIES[domain];
  const sourceByLegacy = new Map<string, { entity: EntityType; row: RawRow }>();
  for (const entity of entities) {
    for (const row of source[entity] ?? []) {
      if (row.legacy_id == null || String(row.legacy_id) === '') continue;
      sourceByLegacy.set(String(row.legacy_id), { entity, row });
    }
  }

  const out = emptyWorkbook();
  const included = new Set<string>();
  const queue: Array<{ entity: EntityType; row: RawRow }> = [];
  const enqueue = (entity: EntityType, row: RawRow) => {
    const key = `${entity}:${String(row.legacy_id)}`;
    if (included.has(key)) return;
    included.add(key);
    out[entity].push(row);
    queue.push({ entity, row });
  };

  for (const entity of entities) for (const row of failedRows[entity] ?? []) enqueue(entity, row);

  while (queue.length > 0) {
    const { row } = queue.shift()!;
    for (const [key, value] of Object.entries(row)) {
      if (key === 'legacy_id' || !key.endsWith('_legacy_id')) continue;
      if (value == null || String(value) === '') continue;
      const parent = sourceByLegacy.get(String(value));
      if (parent) enqueue(parent.entity, parent.row);
    }
  }
  return out;
}

/**
 * Downloadable error report: the standard workbook of the failed rows PLUS the parent rows they
 * reference (so it stays re-importable after the operator fixes them — see withReferencedParents)
 * PLUS a leading "Import Errors" sheet keyed by legacy_id that spells out WHY each row failed.
 * Without that sheet the reason (stamped as ERROR_FIELD) is lost — buildWorkbook only writes
 * ENTITY_COLUMNS cells and silently drops the non-contract key.
 */
function buildErrorReport(source: ParsedWorkbook, failedRows: ParsedWorkbook, domain: WorkbookDomain): ArrayBuffer {
  const reimportRows = withReferencedParents(source, failedRows, domain);
  const base = buildWorkbook(reimportRows, {
    domain,
    sourceTenant: '',
    exportedAt: new Date().toISOString(),
    schemaVersion: WORKBOOK_SCHEMA_VERSION,
    counts: Object.fromEntries(IMPORT_ORDER.map((e) => [e, reimportRows[e].length])) as Record<EntityType, number>,
  });

  const wb = XLSX.read(base, { type: 'array' });
  const aoa: unknown[][] = [['Sheet', 'Record Ref', 'Import Error']];
  for (const entity of DOMAIN_ENTITIES[domain]) {
    for (const row of failedRows[entity] ?? []) {
      const legacyId = row.legacy_id;
      const reason = (row as Record<string, unknown>)[ERROR_FIELD];
      aoa.push([
        SHEET_NAMES[entity],
        legacyId == null ? '' : String(legacyId),
        reason == null ? '' : String(reason),
      ]);
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), ERROR_SHEET_NAME);
  // Surface the reasons sheet first so the operator lands on it when opening the file.
  wb.SheetNames = [ERROR_SHEET_NAME, ...wb.SheetNames.filter((n) => n !== ERROR_SHEET_NAME)];
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

/**
 * Validate, create/resume a run, import in dependency order (chunked, idempotent), finalize.
 *
 * Rows are sent to data_migration_import_batch in the flat workbook-row shape exactly as
 * parseWorkbook produces them: top-level *_legacy_id parent keys and catalog NAME keys
 * (device_type, brand, capacity, interface, condition). The RPC resolves parent refs via
 * entity_map and catalog names to UUIDs itself — the client does not pre-resolve either.
 */
export async function runImport(
  wb: ParsedWorkbook,
  fileMeta: { filename: string; hash: string },
  onProgress: (p: ImportProgress) => void,
  domain: WorkbookDomain,
): Promise<ImportSummary> {
  const report = validateWorkbook(wb, domain);
  if (!report.ok) {
    throw new Error('Workbook failed validation; fix errors before import.');
  }

  const entities = DOMAIN_ENTITIES[domain];
  const lastEntity = entities[entities.length - 1];
  const totals: Record<string, number> = {};
  for (const e of entities) totals[e] = (wb[e] ?? []).length;

  const { data: runId, error: runErr } = await supabase.rpc('data_migration_create_run', {
    p_kind: 'import',
    p_source_filename: fileMeta.filename,
    p_file_hash: fileMeta.hash,
    p_schema_version: WORKBOOK_SCHEMA_VERSION,
    p_totals: totals,
  });
  if (runErr || !runId) throw runErr ?? new Error('Failed to create migration run');

  const counts = emptyCounts();
  const failedRows = emptyWorkbook();

  for (const entity of entities) {
    const rows = wb[entity] ?? [];
    if (rows.length === 0) continue;
    let processed = 0;

    for (const batch of chunk(rows, IMPORT_BATCH_SIZE)) {
      const { data, error } = await supabase.rpc('data_migration_import_batch', {
        p_run_id: runId as string,
        p_entity_type: entity,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        p_rows: batch as unknown as any,
      });
      if (error) throw error;

      const results = ((data as { results: BatchRowResult[] } | null)?.results) ?? [];
      const byLegacy = new Map(results.map((r) => [r.legacy_id, r]));
      for (const row of batch) {
        const res = byLegacy.get(String(row.legacy_id));
        if (!res || res.status === 'error') {
          counts[entity].error += 1;
          failedRows[entity].push({ ...row, [ERROR_FIELD]: res?.error ?? 'no result returned' });
        } else if (res.status === 'skipped_duplicate') {
          counts[entity].skipped += 1;
        } else {
          counts[entity].inserted += 1;
        }
      }

      processed += batch.length;
      onProgress({ entity, processed, total: rows.length, phase: 'importing' });
    }
  }

  onProgress({ entity: lastEntity, processed: 0, total: 0, phase: 'finalizing' });
  const { error: finErr } = await supabase.rpc('data_migration_finalize', { p_run_id: runId as string });
  if (finErr) throw finErr;

  const hasFailures = entities.some((e) => failedRows[e].length > 0);
  const errorReport = hasFailures ? buildErrorReport(wb, failedRows, domain) : undefined;

  onProgress({ entity: lastEntity, processed: 0, total: 0, phase: 'done' });
  return { runId: runId as string, counts, errorReport };
}

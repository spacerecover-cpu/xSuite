import { supabase, getTenantId } from '../supabaseClient';
import type { Json } from '../../types/database.types';
import { buildWorkbook, type WorkbookMeta } from './workbookBuilder';
import {
  IMPORT_ORDER,
  WORKBOOK_SCHEMA_VERSION,
  type EntityType,
  type ParsedWorkbook,
  type RawRow,
} from './workbookContract';

export interface ExportOptions {
  entities: EntityType[];
  dateFrom?: string;
  dateTo?: string;
}

export const EXPORT_PAGE_SIZE = 1000;

interface ExportPageResult {
  rows: RawRow[];
  next: { created_at: string; id: string } | null;
}

function emptyData(): ParsedWorkbook {
  return Object.fromEntries(IMPORT_ORDER.map((e) => [e, [] as RawRow[]])) as ParsedWorkbook;
}

function emptyCounts(): Record<EntityType, number> {
  return Object.fromEntries(IMPORT_ORDER.map((e) => [e, 0])) as Record<EntityType, number>;
}

export async function runExport(
  opts: ExportOptions,
  onProgress: (p: { entity: EntityType; fetched: number }) => void,
): Promise<ArrayBuffer> {
  const selected = new Set(opts.entities);
  const filters: Record<string, unknown> = {};
  if (opts.dateFrom) filters.dateFrom = opts.dateFrom;
  if (opts.dateTo) filters.dateTo = opts.dateTo;

  const data = emptyData();
  const counts = emptyCounts();

  for (const entity of IMPORT_ORDER) {
    if (!selected.has(entity)) continue;

    let afterCreatedAt: string | null = null;
    let afterId: string | null = null;
    let fetched = 0;

    for (;;) {
      const { data: page, error } = await supabase.rpc('data_migration_export_page', {
        p_entity_type: entity,
        // Cursor args are nullable in the SQL fn (NULL on the first page); the generated
        // types mark them non-null, so pass through as the RPC expects.
        p_after_created_at: afterCreatedAt as unknown as string,
        p_after_id: afterId as unknown as string,
        p_limit: EXPORT_PAGE_SIZE,
        p_filters: filters as Json,
      });
      if (error) throw new Error(`export failed for ${entity}: ${error.message}`);

      const result = page as unknown as ExportPageResult;
      data[entity].push(...result.rows);
      fetched += result.rows.length;
      onProgress({ entity, fetched });

      if (!result.next) break;
      afterCreatedAt = result.next.created_at;
      afterId = result.next.id;
    }

    counts[entity] = fetched;
  }

  const meta: WorkbookMeta = {
    sourceTenant: getTenantId() ?? '',
    exportedAt: new Date().toISOString(),
    schemaVersion: WORKBOOK_SCHEMA_VERSION,
    counts,
  };

  return buildWorkbook(data, meta);
}

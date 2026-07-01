import {
  type EntityType,
  type ParsedWorkbook,
  type RawRow,
  type ColType,
  type ColumnDef,
  ENTITY_COLUMNS,
  IMPORT_ORDER,
  WORKBOOK_SCHEMA_VERSION,
} from './workbookContract';
import type { ParsedWorkbookMeta } from './workbookParser';

export interface ValidationIssue {
  entity: EntityType;
  rowIndex: number;
  legacyId?: string;
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}
export interface ValidationReport {
  ok: boolean;
  counts: Record<EntityType, number>;
  issues: ValidationIssue[];
}

// Foreign in-file refs: entity -> [{ field, target }]
const FK_REFS: Partial<Record<EntityType, Array<{ field: string; target: EntityType; required: boolean }>>> = {
  relationships: [
    { field: 'customer_legacy_id', target: 'customers', required: true },
    { field: 'company_legacy_id', target: 'companies', required: true },
  ],
  cases: [
    { field: 'customer_legacy_id', target: 'customers', required: false },
    { field: 'company_legacy_id', target: 'companies', required: false },
  ],
  devices: [{ field: 'case_legacy_id', target: 'cases', required: true }],
  quotes: [{ field: 'case_legacy_id', target: 'cases', required: false }],
  quoteItems: [{ field: 'quote_legacy_id', target: 'quotes', required: true }],
  invoices: [{ field: 'case_legacy_id', target: 'cases', required: false }],
  invoiceLineItems: [{ field: 'invoice_legacy_id', target: 'invoices', required: true }],
  notes: [{ field: 'case_legacy_id', target: 'cases', required: true }],
  statusHistory: [{ field: 'case_legacy_id', target: 'cases', required: true }],
  // Donor parts must reference an item present in the file. inventoryItems.location_legacy_id
  // is intentionally NOT a strict ref (optional + resolved with a name/code fallback in the
  // RPC), and inventoryLocations.parent_legacy_id is a soft self-ref (unresolved → NULL).
  inventoryDonorParts: [{ field: 'item_legacy_id', target: 'inventoryItems', required: true }],
};

// Entity -> unique business-number column to dedup within file.
const UNIQUE_NUMBER: Partial<Record<EntityType, string>> = {
  companies: 'company_number',
  customers: 'customer_number',
  cases: 'case_number',
  quotes: 'quote_number',
  invoices: 'invoice_number',
};

// Status enum guards. Only entities whose status column is constrained DB-side are
// validated as ERRORS here so the failure surfaces client-side rather than as an
// opaque per-row RPC failure. Verified against the live schema (2026-07-01):
//   • invoices.status — hard CHECK (draft/sent/paid/partial/overdue/cancelled/void/converted).
//   • quotes.status / cases.status — NO CHECK, NO FK; tenant-configurable free text in
//     master_quote_statuses / master_case_statuses. NOT a fixed enum, so flagging a value
//     here would be wrong (false positives on valid legacy data). Intentionally NOT guarded.
const STATUS_ENUMS: Partial<Record<EntityType, { field: string; allowed: ReadonlySet<string> }>> = {
  invoices: {
    field: 'status',
    allowed: new Set(['draft', 'sent', 'paid', 'partial', 'overdue', 'cancelled', 'void', 'converted']),
  },
};

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

function typeOk(value: unknown, type: ColType): boolean {
  if (isEmpty(value)) return true;
  switch (type) {
    case 'number':
      return typeof value === 'number' ? Number.isFinite(value) : !Number.isNaN(Number(value));
    case 'boolean':
      return typeof value === 'boolean' || value === 'true' || value === 'false' || value === 1 || value === 0;
    case 'date':
      return !Number.isNaN(new Date(value as string).getTime());
    case 'uuid':
    case 'string':
      return true;
    default:
      // Unhandled ColType: fail safe rather than silently accept.
      return false;
  }
}

function legacyIdSets(wb: ParsedWorkbook): Record<EntityType, Set<string>> {
  const sets = {} as Record<EntityType, Set<string>>;
  for (const entity of IMPORT_ORDER) {
    sets[entity] = new Set((wb[entity] ?? []).map((r) => String(r.legacy_id)).filter((id) => id !== 'undefined'));
  }
  return sets;
}

/** Pure client dry-run: required fields, types, in-file FK presence, dup legacy_id/numbers. Writes nothing. */
export function validateWorkbook(wb: ParsedWorkbook): ValidationReport {
  const issues: ValidationIssue[] = [];
  const counts = {} as Record<EntityType, number>;
  const idSets = legacyIdSets(wb);

  for (const entity of IMPORT_ORDER) {
    const rows = wb[entity] ?? [];
    counts[entity] = rows.length;
    const cols: ColumnDef[] = ENTITY_COLUMNS[entity];
    const seenLegacy = new Set<string>();
    const numberField = UNIQUE_NUMBER[entity];
    const seenNumbers = new Set<string>();

    rows.forEach((row: RawRow, rowIndex: number) => {
      const legacyId = isEmpty(row.legacy_id) ? undefined : String(row.legacy_id);

      // legacy_id present + unique within entity
      if (!legacyId) {
        issues.push({ entity, rowIndex, severity: 'error', field: 'legacy_id', message: 'Missing legacy_id' });
      } else if (seenLegacy.has(legacyId)) {
        issues.push({ entity, rowIndex, legacyId, severity: 'error', field: 'legacy_id', message: `Duplicate legacy_id "${legacyId}"` });
      } else {
        seenLegacy.add(legacyId);
      }

      // required fields + type coercion
      for (const col of cols) {
        if (col.required && isEmpty(row[col.key])) {
          issues.push({ entity, rowIndex, legacyId, severity: 'error', field: col.key, message: `Missing required "${col.header}"` });
        } else if (!typeOk(row[col.key], col.type)) {
          issues.push({ entity, rowIndex, legacyId, severity: 'error', field: col.key, message: `Invalid ${col.type} for "${col.header}"` });
        }
      }

      // status enum (DB-constrained columns only — see STATUS_ENUMS)
      const statusGuard = STATUS_ENUMS[entity];
      if (statusGuard && !isEmpty(row[statusGuard.field])) {
        const value = String(row[statusGuard.field]);
        if (!statusGuard.allowed.has(value.toLowerCase())) {
          issues.push({
            entity,
            rowIndex,
            legacyId,
            severity: 'error',
            field: statusGuard.field,
            message: `Invalid status "${value}" (allowed: ${[...statusGuard.allowed].join(', ')})`,
          });
        }
      }

      // unique business number within file
      if (numberField && !isEmpty(row[numberField])) {
        const n = String(row[numberField]);
        if (seenNumbers.has(n)) {
          issues.push({ entity, rowIndex, legacyId, severity: 'error', field: numberField, message: `Duplicate ${numberField} "${n}"` });
        } else {
          seenNumbers.add(n);
        }
      }

      // in-file FK integrity
      for (const fk of FK_REFS[entity] ?? []) {
        const ref = row[fk.field];
        if (isEmpty(ref)) {
          if (fk.required) {
            issues.push({ entity, rowIndex, legacyId, severity: 'error', field: fk.field, message: `Missing required ref ${fk.field}` });
          }
        } else if (!idSets[fk.target].has(String(ref))) {
          issues.push({ entity, rowIndex, legacyId, severity: 'error', field: fk.field, message: `${fk.field} "${ref}" not found in ${fk.target}` });
        }
      }
    });
  }

  return { ok: issues.every((i) => i.severity !== 'error'), counts, issues };
}

export interface SchemaVersionCheck {
  ok: boolean;
  message?: string;
}

/**
 * I3: validate the workbook's `_meta.schema_version` against the version this build
 * understands (WORKBOOK_SCHEMA_VERSION). An incompatible (newer) version is rejected;
 * a missing version is permitted (operator-authored files have no _meta sheet).
 */
export function validateSchemaVersion(meta: Pick<ParsedWorkbookMeta, 'schemaVersion'>): SchemaVersionCheck {
  const v = meta.schemaVersion;
  if (v == null) return { ok: true };
  if (!Number.isInteger(v) || v < 1) {
    return { ok: false, message: `Workbook schema_version "${v}" is not a valid version number.` };
  }
  if (v > WORKBOOK_SCHEMA_VERSION) {
    return {
      ok: false,
      message: `Workbook schema_version ${v} is newer than this build supports (${WORKBOOK_SCHEMA_VERSION}). Upgrade before importing.`,
    };
  }
  return { ok: true };
}

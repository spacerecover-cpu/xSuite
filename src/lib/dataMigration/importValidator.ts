import {
  type EntityType,
  type ParsedWorkbook,
  type RawRow,
  type ColType,
  type ColumnDef,
  type WorkbookDomain,
  ENTITY_COLUMNS,
  IMPORT_ORDER,
  DOMAIN_ENTITIES,
  SHEET_NAMES,
  DOMAIN_LABELS,
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
  payments: [
    { field: 'invoice_legacy_id', target: 'invoices', required: false },
    { field: 'customer_legacy_id', target: 'customers', required: false },
    { field: 'case_legacy_id', target: 'cases', required: false },
    { field: 'bank_account_legacy_id', target: 'bankAccounts', required: false },
  ],
  receipts: [{ field: 'customer_legacy_id', target: 'customers', required: false }],
  expenses: [
    { field: 'case_legacy_id', target: 'cases', required: false },
    { field: 'bank_account_legacy_id', target: 'bankAccounts', required: false },
  ],
  accountTransfers: [
    { field: 'from_bank_legacy_id', target: 'bankAccounts', required: true },
    { field: 'to_bank_legacy_id', target: 'bankAccounts', required: true },
  ],
  paymentDisbursements: [
    { field: 'bank_account_legacy_id', target: 'bankAccounts', required: false },
    { field: 'expense_legacy_id', target: 'expenses', required: false },
  ],
  creditNotes: [
    { field: 'invoice_legacy_id', target: 'invoices', required: false },
    { field: 'case_legacy_id', target: 'cases', required: false },
    { field: 'customer_legacy_id', target: 'customers', required: false },
  ],
  creditNoteItems: [{ field: 'credit_note_legacy_id', target: 'creditNotes', required: true }],
  creditNoteAllocations: [
    { field: 'credit_note_legacy_id', target: 'creditNotes', required: true },
    { field: 'invoice_legacy_id', target: 'invoices', required: true },
  ],
  customerCommunications: [{ field: 'customer_legacy_id', target: 'customers', required: true }],
  caseCommunications: [{ field: 'case_legacy_id', target: 'cases', required: true }],
  caseRecoveryAttempts: [
    { field: 'case_legacy_id', target: 'cases', required: true },
    { field: 'device_legacy_id', target: 'devices', required: false },
  ],
  deviceDiagnostics: [{ field: 'device_legacy_id', target: 'devices', required: true }],
  cloneDrives: [{ field: 'case_legacy_id', target: 'cases', required: false }],
  supplierContacts: [{ field: 'supplier_legacy_id', target: 'suppliers', required: true }],
  purchaseOrders: [{ field: 'supplier_legacy_id', target: 'suppliers', required: true }],
  purchaseOrderItems: [{ field: 'purchase_order_legacy_id', target: 'purchaseOrders', required: true }],
  stockSerialNumbers: [{ field: 'item_legacy_id', target: 'stockItems', required: true }],
  stockSaleItems: [
    { field: 'sale_legacy_id', target: 'stockSales', required: true },
    { field: 'item_legacy_id', target: 'stockItems', required: true },
  ],
  positions: [{ field: 'department_legacy_id', target: 'departments', required: false }],
  employees: [
    { field: 'department_legacy_id', target: 'departments', required: false },
    { field: 'position_legacy_id', target: 'positions', required: false },
  ],
  leaveBalances: [{ field: 'employee_legacy_id', target: 'employees', required: true }],
  employeeLoans: [{ field: 'employee_legacy_id', target: 'employees', required: true }],
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
  creditNotes: 'credit_note_number',
  suppliers: 'supplier_number',
  purchaseOrders: 'po_number',
  stockItems: 'sku',
  stockSales: 'sale_number',
  employees: 'employee_number',
};

// Status enum guards. Only fields constrained DB-side (hard CHECK) are validated as ERRORS
// here so the failure surfaces client-side rather than as an opaque per-row RPC failure.
// Free-text / tenant-configurable statuses (cases, stock sale status, …) are
// intentionally NOT guarded — flagging them would false-positive on valid legacy data.
// quotes.status became a hard CHECK in WP-C (quotes_status_check, 6 codes) and legacy
// display names are mapped by normalizeQuoteStatus BEFORE validation, so it is guarded.
const STATUS_ENUMS: Partial<Record<EntityType, Array<{ field: string; allowed: ReadonlySet<string> }>>> = {
  invoices: [{
    field: 'status',
    allowed: new Set(['draft', 'sent', 'paid', 'partial', 'overdue', 'cancelled', 'void', 'converted']),
  }],
  quotes: [{
    field: 'status',
    allowed: new Set(['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted']),
  }],
  expenses: [{
    field: 'status',
    allowed: new Set(['draft', 'pending', 'approved', 'rejected', 'paid', 'voided']),
  }],
  creditNotes: [
    { field: 'status', allowed: new Set(['draft', 'issued', 'applied', 'void']) },
    { field: 'credit_type', allowed: new Set(['adjustment', 'refund', 'advance_adjustment', 'writeoff']) },
  ],
  stockSales: [{
    field: 'payment_status',
    allowed: new Set(['unpaid', 'partial', 'paid', 'refunded']),
  }],
};

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

// The literal strings Postgres accepts for a `text::boolean` cast (case-insensitive,
// surrounding whitespace ignored). The import RPC stores booleans via `(v_row->>'x')::boolean`,
// so the client dry-run must accept exactly this vocabulary — no more, no less — to stay in
// lock-step with what the database will actually do. See https://www.postgresql.org/docs/current/datatype-boolean.html
const PG_BOOLEAN_LITERALS = new Set([
  'true', 't', 'yes', 'y', 'on', '1',
  'false', 'f', 'no', 'n', 'off', '0',
]);

function booleanOk(value: unknown): boolean {
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return value === 1 || value === 0;
  if (typeof value === 'string') return PG_BOOLEAN_LITERALS.has(value.trim().toLowerCase());
  return false;
}

function typeOk(value: unknown, type: ColType): boolean {
  if (isEmpty(value)) return true;
  switch (type) {
    case 'number':
      return typeof value === 'number' ? Number.isFinite(value) : !Number.isNaN(Number(value));
    case 'boolean':
      return booleanOk(value);
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

/**
 * Pure client dry-run for ONE domain: required fields, types, in-file FK presence, dup
 * legacy_id/numbers. Also rejects a cross-domain file (records rows in an inventory import,
 * or vice versa). Writes nothing.
 */
export function validateWorkbook(wb: ParsedWorkbook, domain: WorkbookDomain): ValidationReport {
  const issues: ValidationIssue[] = [];
  const counts = Object.fromEntries(IMPORT_ORDER.map((e) => [e, (wb[e] ?? []).length])) as Record<EntityType, number>;
  const idSets = legacyIdSets(wb);
  const entities = DOMAIN_ENTITIES[domain];
  const inDomain = new Set(entities);

  // Cross-domain guard: a file whose data belongs to the OTHER domain must not be imported here.
  for (const entity of IMPORT_ORDER) {
    if (!inDomain.has(entity) && (wb[entity] ?? []).length > 0) {
      issues.push({
        entity,
        rowIndex: -1,
        severity: 'error',
        field: 'domain',
        message: `This looks like a different import type — the "${SHEET_NAMES[entity]}" sheet has data but does not belong in a ${DOMAIN_LABELS[domain]} import.`,
      });
    }
  }

  for (const entity of entities) {
    const rows = wb[entity] ?? [];
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
      for (const statusGuard of STATUS_ENUMS[entity] ?? []) {
        if (isEmpty(row[statusGuard.field])) continue;
        const value = String(row[statusGuard.field]);
        if (!statusGuard.allowed.has(value.toLowerCase())) {
          issues.push({
            entity,
            rowIndex,
            legacyId,
            severity: 'error',
            field: statusGuard.field,
            message: `Invalid ${statusGuard.field} "${value}" (allowed: ${[...statusGuard.allowed].join(', ')})`,
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

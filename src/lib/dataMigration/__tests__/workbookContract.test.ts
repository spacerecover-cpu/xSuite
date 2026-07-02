import { describe, it, expect } from 'vitest';
import {
  SHEET_NAMES,
  IMPORT_ORDER,
  WORKBOOK_SCHEMA_VERSION,
  ENTITY_COLUMNS,
} from '../workbookContract';
import type { EntityType } from '../workbookContract';

const ALL_ENTITIES: EntityType[] = [
  'companies', 'customerGroups', 'customers', 'relationships', 'cases', 'devices',
  'quotes', 'quoteItems', 'invoices', 'invoiceLineItems',
  'bankAccounts', 'payments', 'receipts', 'expenses',
  'accountTransfers', 'paymentDisbursements',
  'creditNotes', 'creditNoteItems', 'creditNoteAllocations',
  'customerCommunications', 'caseCommunications', 'caseRecoveryAttempts',
  'deviceDiagnostics', 'cloneDrives',
  'notes', 'statusHistory',
  'inventoryLocations', 'inventoryItems', 'inventoryDonorParts',
  'suppliers', 'supplierContacts', 'purchaseOrders', 'purchaseOrderItems',
  'stockCategories', 'stockLocations', 'stockItems', 'stockSerialNumbers', 'stockSales', 'stockSaleItems',
  'departments', 'positions', 'employees', 'leaveBalances', 'employeeLoans',
];

describe('workbookContract — structural invariants', () => {
  it('WORKBOOK_SCHEMA_VERSION is 1', () => {
    expect(WORKBOOK_SCHEMA_VERSION).toBe(1);
  });

  it('SHEET_NAMES covers every EntityType', () => {
    for (const e of ALL_ENTITIES) {
      expect(SHEET_NAMES).toHaveProperty(e);
      expect(typeof SHEET_NAMES[e]).toBe('string');
      expect(SHEET_NAMES[e].length).toBeGreaterThan(0);
    }
  });

  it('IMPORT_ORDER contains exactly the 44 EntityTypes (no duplicates, no missing)', () => {
    expect(IMPORT_ORDER).toHaveLength(44);
    expect(new Set(IMPORT_ORDER).size).toBe(44);
    for (const e of ALL_ENTITIES) {
      expect(IMPORT_ORDER).toContain(e);
    }
  });

  it('IMPORT_ORDER: financial refs come after their parents', () => {
    // payments reference invoices + bank accounts; expenses reference bank accounts.
    expect(IMPORT_ORDER.indexOf('invoices')).toBeLessThan(IMPORT_ORDER.indexOf('payments'));
    expect(IMPORT_ORDER.indexOf('bankAccounts')).toBeLessThan(IMPORT_ORDER.indexOf('payments'));
    expect(IMPORT_ORDER.indexOf('bankAccounts')).toBeLessThan(IMPORT_ORDER.indexOf('expenses'));
  });

  it('IMPORT_ORDER: new-entity refs come after their parents', () => {
    // customer groups before customers (group membership resolves by name at customer insert)
    expect(IMPORT_ORDER.indexOf('customerGroups')).toBeLessThan(IMPORT_ORDER.indexOf('customers'));
    expect(IMPORT_ORDER.indexOf('bankAccounts')).toBeLessThan(IMPORT_ORDER.indexOf('accountTransfers'));
    expect(IMPORT_ORDER.indexOf('expenses')).toBeLessThan(IMPORT_ORDER.indexOf('paymentDisbursements'));
    expect(IMPORT_ORDER.indexOf('creditNotes')).toBeLessThan(IMPORT_ORDER.indexOf('creditNoteItems'));
    expect(IMPORT_ORDER.indexOf('creditNotes')).toBeLessThan(IMPORT_ORDER.indexOf('creditNoteAllocations'));
    expect(IMPORT_ORDER.indexOf('devices')).toBeLessThan(IMPORT_ORDER.indexOf('deviceDiagnostics'));
    expect(IMPORT_ORDER.indexOf('suppliers')).toBeLessThan(IMPORT_ORDER.indexOf('supplierContacts'));
    expect(IMPORT_ORDER.indexOf('suppliers')).toBeLessThan(IMPORT_ORDER.indexOf('purchaseOrders'));
    expect(IMPORT_ORDER.indexOf('purchaseOrders')).toBeLessThan(IMPORT_ORDER.indexOf('purchaseOrderItems'));
    expect(IMPORT_ORDER.indexOf('stockItems')).toBeLessThan(IMPORT_ORDER.indexOf('stockSerialNumbers'));
    expect(IMPORT_ORDER.indexOf('stockSales')).toBeLessThan(IMPORT_ORDER.indexOf('stockSaleItems'));
    expect(IMPORT_ORDER.indexOf('departments')).toBeLessThan(IMPORT_ORDER.indexOf('positions'));
    expect(IMPORT_ORDER.indexOf('positions')).toBeLessThan(IMPORT_ORDER.indexOf('employees'));
    expect(IMPORT_ORDER.indexOf('employees')).toBeLessThan(IMPORT_ORDER.indexOf('leaveBalances'));
    expect(IMPORT_ORDER.indexOf('employees')).toBeLessThan(IMPORT_ORDER.indexOf('employeeLoans'));
  });

  it('IMPORT_ORDER: companies before customers', () => {
    expect(IMPORT_ORDER.indexOf('companies')).toBeLessThan(IMPORT_ORDER.indexOf('customers'));
  });

  it('IMPORT_ORDER: customers before relationships', () => {
    expect(IMPORT_ORDER.indexOf('customers')).toBeLessThan(IMPORT_ORDER.indexOf('relationships'));
  });

  it('IMPORT_ORDER: relationships before cases', () => {
    expect(IMPORT_ORDER.indexOf('relationships')).toBeLessThan(IMPORT_ORDER.indexOf('cases'));
  });

  it('IMPORT_ORDER: cases before devices', () => {
    expect(IMPORT_ORDER.indexOf('cases')).toBeLessThan(IMPORT_ORDER.indexOf('devices'));
  });

  it('IMPORT_ORDER: cases before quotes', () => {
    expect(IMPORT_ORDER.indexOf('cases')).toBeLessThan(IMPORT_ORDER.indexOf('quotes'));
  });

  it('IMPORT_ORDER: quotes before quoteItems', () => {
    expect(IMPORT_ORDER.indexOf('quotes')).toBeLessThan(IMPORT_ORDER.indexOf('quoteItems'));
  });

  it('IMPORT_ORDER: cases before invoices', () => {
    expect(IMPORT_ORDER.indexOf('cases')).toBeLessThan(IMPORT_ORDER.indexOf('invoices'));
  });

  it('IMPORT_ORDER: invoices before invoiceLineItems', () => {
    expect(IMPORT_ORDER.indexOf('invoices')).toBeLessThan(IMPORT_ORDER.indexOf('invoiceLineItems'));
  });

  it('IMPORT_ORDER: cases before notes', () => {
    expect(IMPORT_ORDER.indexOf('cases')).toBeLessThan(IMPORT_ORDER.indexOf('notes'));
  });

  it('IMPORT_ORDER: cases before statusHistory', () => {
    expect(IMPORT_ORDER.indexOf('cases')).toBeLessThan(IMPORT_ORDER.indexOf('statusHistory'));
  });

  it('IMPORT_ORDER: inventoryLocations before inventoryItems before inventoryDonorParts', () => {
    expect(IMPORT_ORDER.indexOf('inventoryLocations')).toBeLessThan(IMPORT_ORDER.indexOf('inventoryItems'));
    expect(IMPORT_ORDER.indexOf('inventoryItems')).toBeLessThan(IMPORT_ORDER.indexOf('inventoryDonorParts'));
  });

  it('ENTITY_COLUMNS covers every EntityType', () => {
    for (const e of ALL_ENTITIES) {
      expect(ENTITY_COLUMNS).toHaveProperty(e);
      expect(Array.isArray(ENTITY_COLUMNS[e])).toBe(true);
      expect(ENTITY_COLUMNS[e].length).toBeGreaterThan(0);
    }
  });

  it('every ColumnDef has a non-empty key, header, and valid type', () => {
    const validTypes = new Set(['string', 'number', 'boolean', 'date', 'uuid']);
    for (const e of ALL_ENTITIES) {
      for (const col of ENTITY_COLUMNS[e]) {
        expect(col.key.length).toBeGreaterThan(0);
        expect(col.header.length).toBeGreaterThan(0);
        expect(validTypes.has(col.type)).toBe(true);
      }
    }
  });

  it('every entity has exactly one legacy_id column marked required', () => {
    for (const e of ALL_ENTITIES) {
      const legacyCols = ENTITY_COLUMNS[e].filter(c => c.key === 'legacy_id');
      expect(legacyCols).toHaveLength(1);
      expect(legacyCols[0].required).toBe(true);
    }
  });

  it('ref targets of ColumnDef.ref are valid EntityTypes', () => {
    const entitySet = new Set<string>(ALL_ENTITIES);
    for (const e of ALL_ENTITIES) {
      for (const col of ENTITY_COLUMNS[e]) {
        if (col.ref !== undefined) {
          expect(entitySet.has(col.ref)).toBe(true);
        }
      }
    }
  });

  it('relationships has customer_legacy_id ref→customers and company_legacy_id ref→companies', () => {
    const cols = ENTITY_COLUMNS['relationships'];
    const custRef = cols.find(c => c.key === 'customer_legacy_id');
    const compRef = cols.find(c => c.key === 'company_legacy_id');
    expect(custRef?.ref).toBe('customers');
    expect(compRef?.ref).toBe('companies');
  });

  it('cases has customer_legacy_id ref→customers', () => {
    const caseCols = ENTITY_COLUMNS['cases'];
    const ref = caseCols.find(c => c.key === 'customer_legacy_id');
    expect(ref?.ref).toBe('customers');
  });

  it('devices has case_legacy_id ref→cases', () => {
    const ref = ENTITY_COLUMNS['devices'].find(c => c.key === 'case_legacy_id');
    expect(ref?.ref).toBe('cases');
  });

  it('quotes has case_legacy_id ref→cases', () => {
    const ref = ENTITY_COLUMNS['quotes'].find(c => c.key === 'case_legacy_id');
    expect(ref?.ref).toBe('cases');
  });

  it('quoteItems has quote_legacy_id ref→quotes', () => {
    const ref = ENTITY_COLUMNS['quoteItems'].find(c => c.key === 'quote_legacy_id');
    expect(ref?.ref).toBe('quotes');
  });

  it('invoices has case_legacy_id ref→cases', () => {
    const ref = ENTITY_COLUMNS['invoices'].find(c => c.key === 'case_legacy_id');
    expect(ref?.ref).toBe('cases');
  });

  it('invoiceLineItems has invoice_legacy_id ref→invoices', () => {
    const ref = ENTITY_COLUMNS['invoiceLineItems'].find(c => c.key === 'invoice_legacy_id');
    expect(ref?.ref).toBe('invoices');
  });

  it('notes has case_legacy_id ref→cases', () => {
    const ref = ENTITY_COLUMNS['notes'].find(c => c.key === 'case_legacy_id');
    expect(ref?.ref).toBe('cases');
  });

  it('statusHistory has case_legacy_id ref→cases', () => {
    const ref = ENTITY_COLUMNS['statusHistory'].find(c => c.key === 'case_legacy_id');
    expect(ref?.ref).toBe('cases');
  });

  it('devices has catalog string columns: device_type, brand, capacity, interface, condition', () => {
    const devCols = ENTITY_COLUMNS['devices'];
    for (const key of ['device_type', 'brand', 'capacity', 'interface', 'condition']) {
      const col = devCols.find(c => c.key === key);
      expect(col, `devices must have ${key} column`).toBeDefined();
      expect(col!.type).toBe('string');
    }
  });

  it('required FK columns on child entities are marked required:true', () => {
    // case_legacy_id required on devices / quotes / invoices / notes / statusHistory
    for (const e of ['devices', 'quotes', 'invoices', 'notes', 'statusHistory'] as EntityType[]) {
      const col = ENTITY_COLUMNS[e].find(c => c.key === 'case_legacy_id');
      expect(col?.required).toBe(true);
    }
    // quote_legacy_id required on quoteItems
    expect(ENTITY_COLUMNS['quoteItems'].find(c => c.key === 'quote_legacy_id')?.required).toBe(true);
    // invoice_legacy_id required on invoiceLineItems
    expect(ENTITY_COLUMNS['invoiceLineItems'].find(c => c.key === 'invoice_legacy_id')?.required).toBe(true);
  });
});

// The workbook keys stay `legacy_id` / `*_legacy_id` (the RPC + entity_map key on
// them), but the human HEADER shown in the sheet is "Record Ref" — "Legacy ID"
// misleads operators, since on a fresh export it is simply the current internal id.
describe('workbookContract — identifier column headers', () => {
  it("legacy_id header reads 'Record Ref' on every entity", () => {
    for (const e of ALL_ENTITIES) {
      const col = ENTITY_COLUMNS[e].find(c => c.key === 'legacy_id');
      expect(col?.header).toBe('Record Ref');
    }
  });

  it("foreign-key *_legacy_id columns read '<Entity> Record Ref'", () => {
    const expected: Record<string, string> = {
      customer_legacy_id: 'Customer Record Ref',
      company_legacy_id: 'Company Record Ref',
      case_legacy_id: 'Case Record Ref',
      quote_legacy_id: 'Quote Record Ref',
      invoice_legacy_id: 'Invoice Record Ref',
    };
    for (const e of ALL_ENTITIES) {
      for (const col of ENTITY_COLUMNS[e]) {
        if (col.key in expected) {
          expect(col.header, `${e}.${col.key}`).toBe(expected[col.key]);
        }
      }
    }
  });
});

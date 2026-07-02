import { describe, it, expect } from 'vitest';
import {
  exportContractAsTemplate,
  IMPORT_ORDER,
  WORKBOOK_SCHEMA_VERSION,
  SHEET_NAMES,
  ENTITY_COLUMNS,
} from '../workbookContract';
import type { EntityType } from '../workbookContract';

const ALL_ENTITIES: EntityType[] = [
  'companies', 'customers', 'relationships', 'cases', 'devices',
  'quotes', 'quoteItems', 'invoices', 'invoiceLineItems', 'notes', 'statusHistory',
  'inventoryLocations', 'inventoryItems', 'inventoryDonorParts',
];

describe('exportContractAsTemplate', () => {
  it('is a function', () => {
    expect(typeof exportContractAsTemplate).toBe('function');
  });

  it('returns an object with schemaVersion, importOrder, and sheets', () => {
    const tmpl = exportContractAsTemplate();
    expect(tmpl.schemaVersion).toBe(WORKBOOK_SCHEMA_VERSION);
    expect(Array.isArray(tmpl.importOrder)).toBe(true);
    expect(typeof tmpl.sheets).toBe('object');
  });

  it('importOrder in template matches IMPORT_ORDER exactly', () => {
    const tmpl = exportContractAsTemplate();
    expect(tmpl.importOrder).toEqual(IMPORT_ORDER);
  });

  it('sheets has an entry for every EntityType', () => {
    const tmpl = exportContractAsTemplate();
    for (const e of ALL_ENTITIES) {
      expect(tmpl.sheets).toHaveProperty(e);
    }
  });

  it('each sheet entry has sheetName, columns, and requiredColumns', () => {
    const tmpl = exportContractAsTemplate();
    for (const e of ALL_ENTITIES) {
      const sheet = tmpl.sheets[e];
      expect(typeof sheet.sheetName).toBe('string');
      expect(Array.isArray(sheet.columns)).toBe(true);
      expect(Array.isArray(sheet.requiredColumns)).toBe(true);
    }
  });

  it('sheet sheetName matches SHEET_NAMES[entity]', () => {
    const tmpl = exportContractAsTemplate();
    for (const e of ALL_ENTITIES) {
      expect(tmpl.sheets[e].sheetName).toBe(SHEET_NAMES[e]);
    }
  });

  it('sheet columns length matches ENTITY_COLUMNS[entity] length', () => {
    const tmpl = exportContractAsTemplate();
    for (const e of ALL_ENTITIES) {
      expect(tmpl.sheets[e].columns).toHaveLength(ENTITY_COLUMNS[e].length);
    }
  });

  it('each column entry in template has key, header, type, and optionally required/ref', () => {
    const tmpl = exportContractAsTemplate();
    const validTypes = new Set(['string', 'number', 'boolean', 'date', 'uuid']);
    for (const e of ALL_ENTITIES) {
      for (const col of tmpl.sheets[e].columns) {
        expect(typeof col.key).toBe('string');
        expect(typeof col.header).toBe('string');
        expect(validTypes.has(col.type)).toBe(true);
      }
    }
  });

  it('requiredColumns are a subset of column keys', () => {
    const tmpl = exportContractAsTemplate();
    for (const e of ALL_ENTITIES) {
      const keys = new Set(tmpl.sheets[e].columns.map((c: { key: string }) => c.key));
      for (const rk of tmpl.sheets[e].requiredColumns) {
        expect(keys.has(rk)).toBe(true);
      }
    }
  });

  it('requiredColumns always includes legacy_id', () => {
    const tmpl = exportContractAsTemplate();
    for (const e of ALL_ENTITIES) {
      expect(tmpl.sheets[e].requiredColumns).toContain('legacy_id');
    }
  });

  it('ref columns appear in column list with their ref entity recorded', () => {
    const tmpl = exportContractAsTemplate();
    // devices.case_legacy_id must carry ref: 'cases'
    const deviceCaseLegacy = tmpl.sheets['devices'].columns.find(
      (c: { key: string }) => c.key === 'case_legacy_id',
    );
    expect(deviceCaseLegacy?.ref).toBe('cases');
    // quoteItems.quote_legacy_id must carry ref: 'quotes'
    const qiRef = tmpl.sheets['quoteItems'].columns.find(
      (c: { key: string }) => c.key === 'quote_legacy_id',
    );
    expect(qiRef?.ref).toBe('quotes');
  });

  it('template is JSON-serialisable (no circular refs, no functions)', () => {
    const tmpl = exportContractAsTemplate();
    expect(() => JSON.stringify(tmpl)).not.toThrow();
    const reparsed = JSON.parse(JSON.stringify(tmpl));
    expect(reparsed.schemaVersion).toBe(WORKBOOK_SCHEMA_VERSION);
  });

  it('serialised template round-trips importOrder without mutation', () => {
    const tmpl = exportContractAsTemplate();
    const json = JSON.stringify(tmpl);
    const reparsed = JSON.parse(json);
    expect(reparsed.importOrder).toEqual(IMPORT_ORDER);
  });
});

import { describe, it, expect } from 'vitest';
import { IMPORT_ORDER, type ParsedWorkbook, type RawRow } from './workbookContract';
import { validateWorkbook, validateSchemaVersion } from './importValidator';

function empty(): ParsedWorkbook {
  return Object.fromEntries(IMPORT_ORDER.map((e) => [e, [] as RawRow[]])) as ParsedWorkbook;
}

describe('validateWorkbook', () => {
  it('passes a minimal valid graph', () => {
    const wb = empty();
    wb.customers = [{ legacy_id: 'CU1', customer_name: 'Jo', created_at: '2021-01-01T00:00:00Z' }];
    wb.cases = [{ legacy_id: 'K1', case_number: 'CASE-0001', customer_legacy_id: 'CU1' }];
    const r = validateWorkbook(wb, 'records');
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
    expect(r.counts.cases).toBe(1);
  });

  it('flags a missing required field as an error', () => {
    const wb = empty();
    wb.customers = [{ legacy_id: 'CU1' }]; // customer_name required
    const r = validateWorkbook(wb, 'records');
    expect(r.ok).toBe(false);
    expect(r.issues).toContainEqual(
      expect.objectContaining({ entity: 'customers', field: 'customer_name', severity: 'error' }),
    );
  });

  it('flags a duplicate legacy_id within an entity', () => {
    const wb = empty();
    wb.customers = [
      { legacy_id: 'CU1', customer_name: 'A' },
      { legacy_id: 'CU1', customer_name: 'B' },
    ];
    const r = validateWorkbook(wb, 'records');
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.message.toLowerCase().includes('duplicate legacy_id'))).toBe(true);
  });

  it('flags a dangling in-file FK (case → unknown customer)', () => {
    const wb = empty();
    wb.cases = [{ legacy_id: 'K1', case_number: 'CASE-1', customer_legacy_id: 'NOPE' }];
    const r = validateWorkbook(wb, 'records');
    expect(r.ok).toBe(false);
    expect(r.issues).toContainEqual(
      expect.objectContaining({ entity: 'cases', legacyId: 'K1', severity: 'error' }),
    );
  });

  it('flags duplicate case_number and invoice_number', () => {
    const wb = empty();
    wb.cases = [
      { legacy_id: 'K1', case_number: 'DUP' },
      { legacy_id: 'K2', case_number: 'DUP' },
    ];
    wb.invoices = [
      { legacy_id: 'I1', invoice_number: 'INV-1' },
      { legacy_id: 'I2', invoice_number: 'INV-1' },
    ];
    const r = validateWorkbook(wb, 'records');
    expect(r.issues.filter((i) => i.message.toLowerCase().includes('duplicate')).length).toBeGreaterThanOrEqual(2);
  });

  it('coerces a bad date/number to an error, not a throw', () => {
    const wb = empty();
    wb.customers = [{ legacy_id: 'CU1', customer_name: 'A', created_at: 'not-a-date' }];
    wb.quotes = [{ legacy_id: 'Q1', quote_number: 'Q-1', total_amount: 'abc' }];
    const r = validateWorkbook(wb, 'records');
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.field === 'created_at')).toBe(true);
    expect(r.issues.some((i) => i.field === 'total_amount')).toBe(true);
  });

  // I2: invoice status enum (live invoices_status_check) is validated client-side.
  it('flags a non-canonical invoice status as an error', () => {
    const wb = empty();
    wb.customers = [{ legacy_id: 'CU1', customer_name: 'A' }];
    wb.cases = [{ legacy_id: 'K1', case_number: 'C-1', customer_legacy_id: 'CU1' }];
    wb.invoices = [{ legacy_id: 'I1', invoice_number: 'INV-1', case_legacy_id: 'K1', status: 'issued' }];
    const r = validateWorkbook(wb, 'records');
    expect(r.ok).toBe(false);
    expect(r.issues).toContainEqual(
      expect.objectContaining({ entity: 'invoices', field: 'status', severity: 'error' }),
    );
  });

  it('accepts every canonical invoice status', () => {
    for (const status of ['draft', 'sent', 'paid', 'partial', 'overdue', 'cancelled', 'void', 'converted']) {
      const wb = empty();
      wb.customers = [{ legacy_id: 'CU1', customer_name: 'A' }];
      wb.cases = [{ legacy_id: 'K1', case_number: 'C-1', customer_legacy_id: 'CU1' }];
      wb.invoices = [{ legacy_id: 'I1', invoice_number: 'INV-1', case_legacy_id: 'K1', status }];
      const r = validateWorkbook(wb, 'records');
      expect(r.issues.some((i) => i.entity === 'invoices' && i.field === 'status')).toBe(false);
    }
  });

  it('does NOT flag case statuses (free text, tenant-configurable DB-side)', () => {
    const wb = empty();
    wb.customers = [{ legacy_id: 'CU1', customer_name: 'A' }];
    wb.cases = [{ legacy_id: 'K1', case_number: 'C-1', customer_legacy_id: 'CU1', status: 'diagnosis in progress' }];
    const r = validateWorkbook(wb, 'records');
    expect(r.issues.some((i) => i.field === 'status')).toBe(false);
  });

  // quotes.status is CHECK-constrained since WP-C. In the real pipeline
  // coerceWorkbook maps legacy display names ('Under Negotiation' -> 'sent')
  // BEFORE validation, so only genuinely out-of-vocabulary values reach here —
  // and those must ERROR client-side rather than fail per-row in the RPC.
  it('flags out-of-vocabulary quote statuses and accepts canonical codes', () => {
    const wb = empty();
    wb.customers = [{ legacy_id: 'CU1', customer_name: 'A' }];
    wb.cases = [{ legacy_id: 'K1', case_number: 'C-1', customer_legacy_id: 'CU1' }];
    wb.quotes = [
      { legacy_id: 'Q1', quote_number: 'Q-1', case_legacy_id: 'K1', status: 'sent' },
      { legacy_id: 'Q2', quote_number: 'Q-2', case_legacy_id: 'K1', status: 'totally bogus' },
    ];
    const r = validateWorkbook(wb, 'records');
    const statusIssues = r.issues.filter((i) => i.entity === 'quotes' && i.field === 'status');
    expect(statusIssues).toHaveLength(1);
    expect(statusIssues[0].rowIndex).toBe(1);
  });

  // Real-world files (and our own boolean columns) go to the RPC as `(v_row->>'x')::boolean`,
  // and Postgres accepts yes/no/y/n/t/f/on/off/1/0 (case-insensitive) — not just true/false.
  // The client dry-run must accept the SAME vocabulary so it does not raise false errors on
  // data the database would import fine (a real user file used "Yes"/"No" for every boolean).
  describe('boolean coercion — Postgres ::boolean parity', () => {
    const accepted: unknown[] = [
      'Yes', 'No', 'yes', 'no', 'YES', 'NO',
      'Y', 'N', 'y', 'n',
      'TRUE', 'FALSE', 'True', 'False', 'true', 'false',
      'T', 'F', 'On', 'Off', 'on', 'off',
      '1', '0', 1, 0, true, false, '  Yes  ',
    ];
    it.each(accepted)('accepts %p on a boolean column (companies.is_active)', (val) => {
      const wb = empty();
      wb.companies = [{ legacy_id: 'CO1', name: 'Acme', is_active: val as RawRow['is_active'] }];
      const r = validateWorkbook(wb, 'records');
      expect(r.issues.some((i) => i.entity === 'companies' && i.field === 'is_active')).toBe(false);
    });

    it('still flags a genuinely invalid boolean (Postgres would reject it too)', () => {
      const wb = empty();
      wb.companies = [
        { legacy_id: 'CO1', name: 'A', is_active: 'maybe' },
        { legacy_id: 'CO2', name: 'B', is_active: '2' },
        { legacy_id: 'CO3', name: 'C', is_active: 'yeah' },
      ];
      const r = validateWorkbook(wb, 'records');
      expect(r.issues.filter((i) => i.field === 'is_active' && i.severity === 'error').length).toBe(3);
    });

    it('treats a blank boolean as valid (optional column)', () => {
      const wb = empty();
      wb.companies = [{ legacy_id: 'CO1', name: 'A', is_active: null }];
      const r = validateWorkbook(wb, 'records');
      expect(r.issues.some((i) => i.field === 'is_active')).toBe(false);
    });
  });
});

// I3: workbook schema-version compatibility.
describe('validateSchemaVersion', () => {
  it('passes a missing schema version (operator-authored file)', () => {
    expect(validateSchemaVersion({ schemaVersion: null }).ok).toBe(true);
  });
  it('passes the current schema version', () => {
    expect(validateSchemaVersion({ schemaVersion: 1 }).ok).toBe(true);
  });
  it('rejects a newer (unsupported) schema version', () => {
    const r = validateSchemaVersion({ schemaVersion: 999 });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/newer/i);
  });
  it('rejects a garbage schema version', () => {
    expect(validateSchemaVersion({ schemaVersion: 0 }).ok).toBe(false);
  });
});

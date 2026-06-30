import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseWorkbook, computeFileHash } from './workbookParser';
import { SHEET_NAMES } from './workbookContract';

function makeWorkbook(): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const companies = XLSX.utils.json_to_sheet([
    { legacy_id: 'C1', name: 'Acme', email: 'a@acme.test', created_at: '2021-03-01T00:00:00Z' },
  ]);
  XLSX.utils.book_append_sheet(wb, companies, SHEET_NAMES.companies);
  const cases = XLSX.utils.json_to_sheet([
    { legacy_id: 'K1', case_number: 'CASE-0001', customer_legacy_id: 'CU1', created_at: '2021-04-02T00:00:00Z' },
  ]);
  XLSX.utils.book_append_sheet(wb, cases, SHEET_NAMES.cases);
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return out;
}

describe('parseWorkbook', () => {
  it('reads each known sheet into its EntityType bucket', () => {
    const wb = parseWorkbook(makeWorkbook());
    expect(wb.companies).toHaveLength(1);
    expect(wb.companies[0]).toMatchObject({ legacy_id: 'C1', name: 'Acme' });
    expect(wb.cases[0]).toMatchObject({ legacy_id: 'K1', case_number: 'CASE-0001' });
  });

  it('returns an empty array for absent optional sheets', () => {
    const wb = parseWorkbook(makeWorkbook());
    expect(wb.invoices).toEqual([]);
    expect(wb.quoteItems).toEqual([]);
  });
});

describe('computeFileHash', () => {
  it('is deterministic and 64 hex chars (sha-256)', async () => {
    const buf = makeWorkbook();
    const h1 = await computeFileHash(buf);
    const h2 = await computeFileHash(buf);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs for different content', async () => {
    const a = new TextEncoder().encode('alpha').buffer;
    const b = new TextEncoder().encode('beta').buffer;
    expect(await computeFileHash(a)).not.toBe(await computeFileHash(b));
  });
});

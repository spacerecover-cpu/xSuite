import { describe, it, expect } from 'vitest';
import { IMPORT_ORDER, type ParsedWorkbook, type RawRow } from './workbookContract';
import { normalizeDateCell, normalizeInvoiceStatus, normalizeQuoteStatus, coerceWorkbook } from './coerceWorkbook';

function empty(): ParsedWorkbook {
  return Object.fromEntries(IMPORT_ORDER.map((e) => [e, [] as RawRow[]])) as ParsedWorkbook;
}

describe('normalizeDateCell', () => {
  // Already-ISO values (incl. full timestamps) must pass through UNCHANGED so created_at
  // timestamps are never truncated or shifted.
  it.each([
    '2024-03-01',
    '2024-03-01T08:00:00.000Z',
    '2021-08-07',
  ])('keeps ISO value %p unchanged', (v) => {
    expect(normalizeDateCell(v)).toBe(v);
  });

  // Fuzzy formats seen in real lab data → normalized to YYYY-MM-DD (month-only → 1st).
  it.each([
    ['07 AUG 2021', '2021-08-07'],
    ['15 JUN 2018', '2018-06-15'],
    ['02 MAY 2019', '2019-05-02'],
    ['07-SEP-2023', '2023-09-07'],
    ['JUN 2014', '2014-06-01'],
    ['MAY 2013', '2013-05-01'],
    ['MAY-2018', '2018-05-01'],
    ['NOV 2015', '2015-11-01'],
    ['02/2015', '2015-02-01'],
    ['10/2015', '2015-10-01'],
    ['2010.05', '2010-05-01'],
    ['2015.11', '2015-11-01'],
    ['2001-11', '2001-11-01'],
    ['2019', '2019-01-01'],
    ['11/04/2021', '2021-04-11'], // day-first (locale: non-US, DD MON YYYY dominant)
    ['13/04/2021', '2021-04-13'], // 13 can only be a day → unambiguous
  ])('normalizes %p → %p', (input, expected) => {
    expect(normalizeDateCell(input)).toBe(expected);
  });

  // Junk / unrecognised → null, so the device row still imports (only the uncertain date drops)
  // rather than the whole row silently erroring out at the Postgres ::date cast.
  it.each(['--', '---', 'NA', 'N/A', 'nil', 'none', '?', '', '   ', '0CT-2017', '04239', '13054', 'garbage'])(
    'drops junk %p to null',
    (v) => {
      expect(normalizeDateCell(v)).toBeNull();
    },
  );

  it('treats null/undefined as null', () => {
    expect(normalizeDateCell(null)).toBeNull();
    expect(normalizeDateCell(undefined)).toBeNull();
  });

  it('rejects impossible month/day', () => {
    expect(normalizeDateCell('45 AUG 2021')).toBeNull(); // day 45
    expect(normalizeDateCell('13/2015')).toBeNull(); // month 13
  });
});

describe('normalizeInvoiceStatus', () => {
  it.each([
    ['Paid', 'paid'],
    ['PAID', 'paid'],
    ['Cancelled', 'cancelled'],
    ['  Draft ', 'draft'],
    ['Partially Paid', 'partial'],
    ['partially paid', 'partial'],
    ['Part Paid', 'partial'],
    ['Unpaid', 'sent'],
    ['UNPAID', 'sent'],
    ['Not Paid', 'sent'],
  ])('maps %p → %p', (input, expected) => {
    expect(normalizeInvoiceStatus(input)).toBe(expected);
  });

  it('leaves canonical lowercase values intact (overdue excepted — coerced to sent since WP-C)', () => {
    for (const s of ['draft', 'sent', 'paid', 'partial', 'cancelled', 'void', 'converted']) {
      expect(normalizeInvoiceStatus(s)).toBe(s);
    }
  });

  it('passes blanks through as-is', () => {
    expect(normalizeInvoiceStatus(null)).toBeNull();
    expect(normalizeInvoiceStatus('')).toBe('');
  });

  it('lowercases an unknown value (so the validator still flags it, not a case mismatch)', () => {
    expect(normalizeInvoiceStatus('Refunded')).toBe('refunded');
  });
});

describe('coerceWorkbook', () => {
  it('normalizes device dom dates and preserves created_at timestamps', () => {
    const wb = empty();
    wb.devices = [
      { legacy_id: 'D1', case_legacy_id: 'K1', dom: '07 AUG 2021', created_at: '2024-03-01T08:00:00.000Z' },
      { legacy_id: 'D2', case_legacy_id: 'K1', dom: '--', created_at: '2024-03-02T08:00:00.000Z' },
    ];
    const out = coerceWorkbook(wb);
    expect(out.devices[0].dom).toBe('2021-08-07');
    expect(out.devices[0].created_at).toBe('2024-03-01T08:00:00.000Z');
    expect(out.devices[1].dom).toBeNull();
  });

  it('normalizes invoice status (case + synonyms)', () => {
    const wb = empty();
    wb.invoices = [
      { legacy_id: 'I1', invoice_number: 'INV-1', status: 'Paid' },
      { legacy_id: 'I2', invoice_number: 'INV-2', status: 'Partially Paid' },
      { legacy_id: 'I3', invoice_number: 'INV-3', status: 'Unpaid' },
    ];
    const out = coerceWorkbook(wb);
    expect(out.invoices.map((r) => r.status)).toEqual(['paid', 'partial', 'sent']);
  });

  it('does not touch non-date / non-status fields', () => {
    const wb = empty();
    wb.customers = [{ legacy_id: 'CU1', customer_name: 'Acme', email: 'a@b.co', is_active: 'Yes' }];
    const out = coerceWorkbook(wb);
    expect(out.customers[0]).toMatchObject({ customer_name: 'Acme', email: 'a@b.co', is_active: 'Yes' });
  });
});

describe('normalizeQuoteStatus (WP-C: quotes.status is CHECK-constrained now)', () => {
  it.each([
    // master_quote_statuses display names from legacy exports
    ['Sent to Client', 'sent'],
    ['Pending Review', 'draft'],
    ['Follow-up Required', 'sent'],
    ['Under Negotiation', 'sent'],
    ['Declined', 'rejected'],
    ['Cancelled', 'rejected'],
    ['Converted to Job', 'converted'],
    ['Approved', 'accepted'],
    // Title-case codes (the 2026-07-10 legacy shape) just lowercase
    ['Sent', 'sent'],
    ['Draft', 'draft'],
    ['Accepted', 'accepted'],
    ['Expired', 'expired'],
  ])('maps %s -> %s', (input, expected) => {
    expect(normalizeQuoteStatus(input)).toBe(expected);
  });

  it('lowercases unknown values so they fail validation as themselves', () => {
    expect(normalizeQuoteStatus('Weird Custom Status')).toBe('weird custom status');
  });

  it('passes blanks through', () => {
    expect(normalizeQuoteStatus(null)).toBeNull();
    expect(normalizeQuoteStatus('')).toBe('');
  });
});

describe('coerceWorkbook quote-status pass', () => {
  it('normalizes quotes.status in place', () => {
    const wb = Object.fromEntries(IMPORT_ORDER.map((e) => [e, []])) as unknown as ParsedWorkbook;
    (wb.quotes as RawRow[]) = [{ status: 'Sent to Client' }, { status: 'Declined' }];
    coerceWorkbook(wb);
    expect((wb.quotes as RawRow[]).map((r) => r.status)).toEqual(['sent', 'rejected']);
  });

  it("coerces invoice 'overdue' to 'sent' (overdue is a due-date fact, not a stored status)", () => {
    const wb = Object.fromEntries(IMPORT_ORDER.map((e) => [e, []])) as unknown as ParsedWorkbook;
    (wb.invoices as RawRow[]) = [{ status: 'Overdue' }];
    coerceWorkbook(wb);
    expect((wb.invoices as RawRow[])[0].status).toBe('sent');
  });
});

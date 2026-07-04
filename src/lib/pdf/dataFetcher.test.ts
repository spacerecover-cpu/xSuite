import { describe, it, expect, vi } from 'vitest';
import type { CurrencyConfig } from '../../types/tenantConfig';

// dataFetcher imports the Supabase client at module load; stub it so the pure
// transform functions can be tested in isolation (they never touch the network).
// `supabase` is a plain mutable object so `fetchDocumentTaxLines` tests can
// swap in a query-chain mock per-test without fighting vi.mock hoisting.
vi.mock('../supabaseClient', () => ({ supabase: {} }));
vi.mock('../companySettingsService', () => ({ getOrCreateCompanySettings: vi.fn() }));

import { supabase } from '../supabaseClient';
import { toQuoteData, toInvoiceData, toCaseData, toPaymentReceiptData, toPayslipData, toQuoteItems, toInvoiceItems, currencyToBlock, fetchDocumentTaxLines } from './dataFetcher';

// Wires supabase.from('document_tax_lines').select(...).eq(...).eq(...).is(...).order(...)
// to resolve with `result`, and returns the spies so callers can assert on args.
function mockDocumentTaxLinesQuery(result: { data: unknown[] | null; error: unknown }) {
  const order = vi.fn().mockResolvedValue(result);
  const is = vi.fn(() => ({ order }));
  const eq2 = vi.fn(() => ({ is }));
  const eq1 = vi.fn(() => ({ eq: eq2 }));
  const select = vi.fn(() => ({ eq: eq1 }));
  const from = vi.fn(() => ({ select }));
  (supabase as unknown as { from: typeof from }).from = from;
  return { from, select, eq1, eq2, is, order };
}

// A real non-USD resolved currency (Oman). Phase 1's whole point: the document
// currency block is sourced from the resolved Country Engine CurrencyConfig, so a
// non-USD tenant NEVER renders 'USD'.
const OMR: CurrencyConfig = {
  code: 'OMR',
  symbol: 'ر.ع.',
  name: 'Omani Rial',
  decimalPlaces: 3,
  decimalSeparator: '.',
  thousandsSeparator: ',',
  position: 'before',
  displayMode: 'symbol',
  negativeFormat: 'minus',
};

const QUOTE_ROW = {
  id: 'q1',
  quote_number: 'Q-1',
  status: 'draft',
  subtotal: 100,
  tax_rate: 5,
  tax_amount: 5,
  discount_amount: 0,
  total_amount: 105,
  created_at: '2026-01-01',
  terms: 'Net 30',
  cases: { id: 'c1', case_no: 'CASE-1', title: 'Recovery' },
};

const INVOICE_ROW = {
  id: 'i1',
  invoice_number: 'INV-1',
  invoice_type: 'tax_invoice',
  invoice_date: '2026-01-01',
  due_date: '2026-02-01',
  status: 'unpaid',
  subtotal: 100,
  tax_amount: 5,
  discount_amount: 0,
  total_amount: 105,
  amount_paid: 0,
  balance_due: 105,
  created_at: '2026-01-01',
  terms: 'Net 30 — payment due on receipt.',
  cases: { id: 'c1', case_no: 'CASE-9' },
  bank_accounts: {
    id: 'b1',
    account_name: 'Main Account',
    bank_name: 'BankX',
    account_number: '999',
    iban: 'IB99',
    swift_code: 'SW99',
  },
};

describe('currencyToBlock — resolved CurrencyConfig → document currency block (kills the USD leak)', () => {
  it('maps symbol/position/decimalPlaces from the resolved config', () => {
    expect(currencyToBlock(OMR)).toEqual({
      currency_symbol: 'ر.ع.',
      currency_position: 'before',
      decimal_places: 3,
      decimal_separator: '.',
      thousands_separator: ',',
    });
  });

  it('threads the decimal/thousands separators from the resolved config', () => {
    const block = currencyToBlock({ ...OMR, decimalSeparator: ',', thousandsSeparator: '.' });
    expect(block.decimal_separator).toBe(',');
    expect(block.thousands_separator).toBe('.');
  });

  it('honors an after-position config', () => {
    expect(currencyToBlock({ ...OMR, position: 'after' }).currency_position).toBe('after');
  });

  it('falls back to the ISO code (NEVER USD/$) when the symbol is empty', () => {
    const block = currencyToBlock({ ...OMR, symbol: '' });
    expect(block.currency_symbol).toBe('OMR');
    expect(block.currency_symbol).not.toBe('USD');
    expect(block.currency_symbol).not.toBe('$');
  });

  it('propagates display_mode "iso_code" — the document shows the ISO code (OMR)', () => {
    expect(currencyToBlock({ ...OMR, displayMode: 'iso_code' }).currency_symbol).toBe('OMR');
  });

  it('propagates display_mode "symbol_code" — the document shows "symbol code" (ر.ع. OMR)', () => {
    expect(currencyToBlock({ ...OMR, displayMode: 'symbol_code' }).currency_symbol).toBe('ر.ع. OMR');
  });
});

describe('toQuoteData — customer/company contract (regression: customer info shows N/A)', () => {
  it('populates customer from a separately-fetched customer row', () => {
    const result = toQuoteData(QUOTE_ROW, {
      currency: OMR,
      customer: { id: 'cust1', customer_name: 'Midhilesh Krishnan', email: 'm@x.com', mobile_number: '+968 92495122', phone: null },
    });
    expect(result.customer?.customer_name).toBe('Midhilesh Krishnan');
    expect(result.customer?.email).toBe('m@x.com');
    expect(result.customer?.mobile_number).toBe('+968 92495122');
  });

  it('falls back from phone_number to the DB `phone` column', () => {
    const result = toQuoteData(QUOTE_ROW, { currency: OMR, customer: { id: 'c', customer_name: 'No Mobile', phone: '12345' } });
    expect(result.customer?.phone_number).toBe('12345');
  });

  it('maps company and falls back company_name to name', () => {
    const result = toQuoteData(QUOTE_ROW, { currency: OMR, company: { id: 'co', name: 'Acme LLC' } });
    expect(result.company?.company_name).toBe('Acme LLC');
  });

  it('maps the case reference and creator profile', () => {
    const result = toQuoteData(QUOTE_ROW, { currency: OMR, createdByProfile: { id: 'u', full_name: 'Tech One' } });
    expect(result.cases?.case_no).toBe('CASE-1');
    expect(result.created_by_profile?.full_name).toBe('Tech One');
  });

  it('maps a separately-fetched bank account into bank_accounts (so the quote-selected bank shows on the PDF)', () => {
    const result = toQuoteData(QUOTE_ROW, {
      currency: OMR,
      bankAccounts: {
        id: 'b1',
        account_name: 'Future Space LLC',
        bank_name: 'Sohar International',
        account_number: '217-02003-0438',
        iban: 'OM93...',
        swift_code: 'SWIFTX',
      },
    });
    expect(result.bank_accounts?.account_name).toBe('Future Space LLC');
    expect(result.bank_accounts?.bank_name).toBe('Sohar International');
    expect(result.bank_accounts?.account_number).toBe('217-02003-0438');
    expect(result.bank_accounts?.iban).toBe('OM93...');
  });

  it('leaves bank_accounts undefined when the quote has no bank account', () => {
    expect(toQuoteData(QUOTE_ROW, { currency: OMR }).bank_accounts).toBeUndefined();
  });

  it('reduces the associated company to { id, company_name }', () => {
    const result = toQuoteData(QUOTE_ROW, {
      currency: OMR,
      customerAssociatedCompany: { id: 'ac', company_name: 'Parent Co', email: 'x@x.com' },
    });
    expect(result.customer_associated_company).toEqual({ id: 'ac', company_name: 'Parent Co' });
  });

  it('sources the currency block from the resolved CurrencyConfig (the OMR tenant shows ر.ع., NEVER USD)', () => {
    const result = toQuoteData(QUOTE_ROW, { currency: OMR });
    expect(result.accounting_locales?.currency_symbol).toBe('ر.ع.');
    expect(result.accounting_locales?.currency_symbol).not.toBe('USD');
    expect(result.accounting_locales?.currency_position).toBe('before');
    expect(result.accounting_locales?.decimal_places).toBe(3);
  });

  it('leaves customer undefined when none is provided (no silent leak)', () => {
    const result = toQuoteData(QUOTE_ROW, { currency: OMR });
    expect(result.customer).toBeUndefined();
  });

  it('threads the statutory quote_date (distinct from created_at)', () => {
    const result = toQuoteData({ ...QUOTE_ROW, quote_date: '2026-07-02' }, { currency: OMR });
    expect(result.quote_date).toBe('2026-07-02');
  });

  it('defaults quote_date to null when the row has none (pre-migration rows)', () => {
    const result = toQuoteData(QUOTE_ROW, { currency: OMR });
    expect(result.quote_date).toBeNull();
  });
});

describe('toInvoiceData — customer/company/bank contract', () => {
  it('populates customer and company from separately-fetched rows', () => {
    const result = toInvoiceData(INVOICE_ROW, {
      currency: OMR,
      customer: { id: 'c', customer_name: 'Jane Doe', email: 'j@x.com', phone: '555' },
      company: { id: 'co', company_name: 'Globex' },
    });
    expect(result.customer?.customer_name).toBe('Jane Doe');
    expect(result.customer?.phone_number).toBe('555');
    expect(result.company?.company_name).toBe('Globex');
  });

  it('maps the embedded bank account (account_name alias) from the invoice row', () => {
    const result = toInvoiceData(INVOICE_ROW, { currency: OMR });
    expect(result.bank_accounts?.account_name).toBe('Main Account');
    expect(result.bank_accounts?.bank_name).toBe('BankX');
    expect(result.bank_accounts?.iban).toBe('IB99');
  });

  it('maps the case reference from the invoice row', () => {
    const result = toInvoiceData(INVOICE_ROW, { currency: OMR });
    expect(result.cases?.case_no).toBe('CASE-9');
  });

  it('surfaces the DB `terms` column as payment_terms (so per-record terms reach the PDF)', () => {
    const result = toInvoiceData(INVOICE_ROW, { currency: OMR });
    expect(result.payment_terms).toBe('Net 30 — payment due on receipt.');
  });

  it('sources the currency block from the resolved CurrencyConfig (never USD)', () => {
    const result = toInvoiceData(INVOICE_ROW, { currency: OMR });
    expect(result.accounting_locales?.currency_symbol).toBe('ر.ع.');
    expect(result.accounting_locales?.currency_symbol).not.toBe('USD');
  });

  it('leaves customer undefined when none is provided', () => {
    const result = toInvoiceData(INVOICE_ROW, { currency: OMR });
    expect(result.customer).toBeUndefined();
  });

});

describe('toInvoiceData compliance fields', () => {
  it('threads snapshot columns and tax lines through', () => {
    const data = toInvoiceData(
      {
        id: 'i1', invoice_number: 'INVO-1', invoice_type: 'tax_invoice',
        buyer_tax_number: 'OM222', buyer_tax_number_label: 'VATIN',
        seller_tax_number: 'OM111', supply_date: '2026-07-01', reverse_charge: false,
        notations: [{ code: 'ZERO_RATED', text: 'Zero-rated supply (EXPORT_SERVICES).' }],
      } as Parameters<typeof toInvoiceData>[0],
      {
        currency: { code: 'OMR', symbol: 'ر.ع.', decimalPlaces: 3, position: 'after',
          decimalSeparator: '.', thousandsSeparator: ',' } as never,
        items: [],
        taxLines: [{
          line_item_id: null, component_code: 'VAT', component_label: 'VAT 5%',
          rate: 5, taxable_base: 100, tax_amount: 5, tax_treatment: 'standard',
          treatment_reason_code: null, sequence: 0, backfilled: false, rule_trace: null,
        }],
      },
    );
    expect(data.buyer_tax_number).toBe('OM222');
    expect(data.seller_tax_number).toBe('OM111');
    expect(data.supply_date).toBe('2026-07-01');
    expect(data.tax_lines).toHaveLength(1);
    expect(data.accounting_locales?.decimal_separator).toBe('.');
  });

  it('defaults snapshot columns to null/false/[] when the row has none (backward-compatible)', () => {
    const data = toInvoiceData(INVOICE_ROW, { currency: OMR, items: [] });
    expect(data.buyer_tax_number).toBeNull();
    expect(data.seller_tax_number).toBeNull();
    expect(data.supply_date).toBeNull();
    expect(data.reverse_charge).toBe(false);
    expect(data.notations).toBeNull();
    expect(data.tax_lines).toEqual([]);
  });
});

describe('toQuoteData/toInvoiceData — buyer identity + structured address on the party blocks', () => {
  it('maps tax_number and the embedded subdivision name onto the quote customer block', () => {
    const result = toQuoteData(QUOTE_ROW, {
      currency: OMR,
      customer: {
        id: 'cust1', customer_name: 'Buyer LLC', tax_number: 'OM999',
        address_line1: 'Street 1', address_line2: 'Building 2', postal_code: '111',
        subdivision: { name: 'Muscat' },
      },
    });
    expect(result.customer?.tax_number).toBe('OM999');
    expect(result.customer?.address_line1).toBe('Street 1');
    expect(result.customer?.address_line2).toBe('Building 2');
    expect(result.customer?.postal_code).toBe('111');
    expect(result.customer?.subdivision_name).toBe('Muscat');
  });

  it('maps tax_number and the embedded subdivision name onto the invoice company block', () => {
    const result = toInvoiceData(INVOICE_ROW, {
      currency: OMR,
      company: {
        id: 'co1', company_name: 'Acme LLC', tax_number: 'OM888',
        address_line1: 'Street 9', postal_code: '222', subdivision: { name: 'Salalah' },
      },
    });
    expect(result.company?.tax_number).toBe('OM888');
    expect(result.company?.address_line1).toBe('Street 9');
    expect(result.company?.subdivision_name).toBe('Salalah');
  });

  it('leaves tax_number/subdivision_name undefined when the row has neither (no silent leak)', () => {
    const result = toQuoteData(QUOTE_ROW, { currency: OMR, customer: { id: 'c', customer_name: 'Plain' } });
    expect(result.customer?.tax_number).toBeUndefined();
    expect(result.customer?.subdivision_name).toBeUndefined();
  });
});

describe('fetchDocumentTaxLines', () => {
  const ROW = {
    line_item_id: 'li1', component_code: 'VAT', component_label: 'VAT 5%',
    rate: '5', taxable_base: '100', tax_amount: '5', tax_treatment: 'standard',
    treatment_reason_code: null, sequence: 1, backfilled: false, rule_trace: null,
  };

  it('returns rows mapped from document_tax_lines with numeric coercion', async () => {
    mockDocumentTaxLinesQuery({ data: [ROW], error: null });
    const rows = await fetchDocumentTaxLines('invoice', 'inv-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].rate).toBe(5);
    expect(rows[0].taxable_base).toBe(100);
    expect(rows[0].tax_amount).toBe(5);
    expect(typeof rows[0].rate).toBe('number');
  });

  it('queries by document_type/document_id, excludes soft-deleted rows, and orders by sequence', async () => {
    const spies = mockDocumentTaxLinesQuery({ data: [ROW], error: null });
    await fetchDocumentTaxLines('quote', 'q-1');
    expect(spies.from).toHaveBeenCalledWith('document_tax_lines');
    expect(spies.eq1).toHaveBeenCalledWith('document_type', 'quote');
    expect(spies.eq2).toHaveBeenCalledWith('document_id', 'q-1');
    expect(spies.is).toHaveBeenCalledWith('deleted_at', null);
    expect(spies.order).toHaveBeenCalledWith('sequence');
  });

  it('returns [] when there are no tax lines for the document', async () => {
    mockDocumentTaxLinesQuery({ data: [], error: null });
    expect(await fetchDocumentTaxLines('credit_note', 'cn-1')).toEqual([]);
  });

  it('returns [] when the query resolves with null data', async () => {
    mockDocumentTaxLinesQuery({ data: null, error: null });
    expect(await fetchDocumentTaxLines('stock_sale', 'ss-1')).toEqual([]);
  });

  it('throws when the query errors', async () => {
    mockDocumentTaxLinesQuery({ data: null, error: new Error('boom') });
    await expect(fetchDocumentTaxLines('invoice', 'inv-1')).rejects.toThrow('boom');
  });
});

describe('line-item mappers (replace the old as-unknown-as array casts)', () => {
  it('toQuoteItems maps fields and defaults nullable numerics to 0', () => {
    const result = toQuoteItems([{ id: 'qi1', description: 'Imaging', quantity: 2, unit_price: 75 }]);
    expect(result[0]).toEqual({ id: 'qi1', description: 'Imaging', quantity: 2, unit_price: 75, unit_label: null, item_code: null });
  });

  it('toQuoteItems threads unit_label/item_code from the row (statutory columns)', () => {
    const result = toQuoteItems([{ id: 'qi1', description: 'Imaging', quantity: 2, unit_price: 75, unit_label: 'Piece', item_code: '998713' }]);
    expect(result[0].unit_label).toBe('Piece');
    expect(result[0].item_code).toBe('998713');
  });

  it('toInvoiceItems computes line_total from quantity*unit_price (no DB column) and maps tax_rate', () => {
    const result = toInvoiceItems([{ id: 'li1', description: 'Recovery', quantity: 3, unit_price: 50, tax_rate: 5 }]);
    expect(result[0].line_total).toBe(150);
    expect(result[0].tax_rate).toBe(5);
  });

  it('both mappers return [] for null/undefined input', () => {
    expect(toQuoteItems(null)).toEqual([]);
    expect(toInvoiceItems(undefined)).toEqual([]);
  });
});

const CASE_ROW = {
  id: 'case1',
  case_no: 'CASE-42',
  case_number: 'CASE-42',
  created_at: '2026-01-01',
  status: 'in_progress',
  priority: 'high',
  description: 'Drive not spinning',
  customer_id: 'cust1',
  company_id: 'co1',
  service_type_id: 'svc1',
  created_by: 'u1',
};

describe('toCaseData — column mapping + relation contract', () => {
  it('maps problem_description from the DB `description` column (was silently blank)', () => {
    const result = toCaseData(CASE_ROW, {});
    expect(result.problem_description).toBe('Drive not spinning');
  });

  it('passes through case_no/status/priority and keeps non-existent columns undefined', () => {
    const result = toCaseData(CASE_ROW, {});
    expect(result.case_no).toBe('CASE-42');
    expect(result.status).toBe('in_progress');
    expect(result.priority).toBe('high');
    expect(result.contact_name).toBeUndefined();
    expect(result.assigned_technician_id).toBeUndefined();
  });

  it('builds service_type {id,name} and assigned_technician {id,full_name} from relations', () => {
    const result = toCaseData(CASE_ROW, {
      serviceType: { id: 'svc1', name: 'Logical Recovery' },
      assignedTechnician: { id: 'tech1', full_name: 'Tech One' },
      customer: { id: 'cust1', customer_name: 'Jane', phone: '555' },
    });
    expect(result.service_type).toEqual({ id: 'svc1', name: 'Logical Recovery' });
    expect(result.assigned_technician).toEqual({ id: 'tech1', full_name: 'Tech One' });
    expect(result.customer?.customer_name).toBe('Jane');
  });
});

const PAYMENT_ROW = {
  id: 'pay1',
  payment_number: 'RCPT-007',
  reference: 'CHQ-12345',
  payment_date: '2026-01-15',
  amount: 250,
  notes: 'Partial',
  created_at: '2026-01-15',
};

describe('toPaymentReceiptData — renamed columns the old cast dropped', () => {
  it('maps payment_number→receipt_number (was always "Draft")', () => {
    const result = toPaymentReceiptData(PAYMENT_ROW, { currency: OMR });
    expect(result.receipt_number).toBe('RCPT-007');
  });

  it('maps reference→reference_number (never rendered before) and keeps payment_method undefined', () => {
    const result = toPaymentReceiptData(PAYMENT_ROW, { currency: OMR });
    expect(result.reference_number).toBe('CHQ-12345');
    expect(result.payment_method).toBeUndefined();
  });

  it('sources the currency block from the resolved CurrencyConfig (never USD)', () => {
    const result = toPaymentReceiptData(PAYMENT_ROW, { currency: OMR });
    expect(result.accounting_locales?.currency_symbol).toBe('ر.ع.');
    expect(result.accounting_locales?.currency_symbol).not.toBe('USD');
  });

  it('maps the invoice ref, customer, and bank account from extras', () => {
    const result = toPaymentReceiptData(PAYMENT_ROW, {
      currency: OMR,
      invoice: { id: 'inv1', invoice_number: 'INV-1', total_amount: 500, invoice_type: 'tax_invoice' },
      customer: { id: 'c', customer_name: 'Buyer', phone: '555' },
      bankAccounts: { id: 'b', account_name: 'Main', bank_name: 'BankX', account_number: '1' },
    });
    expect(result.invoice?.invoice_number).toBe('INV-1');
    expect(result.invoice?.total_amount).toBe(500);
    expect(result.customer?.customer_name).toBe('Buyer');
    expect(result.bank_accounts?.bank_name).toBe('BankX');
  });
});

const PAYROLL_ROW = {
  id: 'rec1',
  net_salary: 4000,
  total_earnings: 5000,
  working_days: 22,
  overtime_hours: 4,
  created_at: '2026-01-31',
};

describe('toPayslipData — column mapping + relation contract', () => {
  it('maps total_earnings→gross_salary and passes net_salary/working_days/overtime_hours through', () => {
    const result = toPayslipData(PAYROLL_ROW, { currency: OMR });
    expect(result.gross_salary).toBe(5000);
    expect(result.net_salary).toBe(4000);
    expect(result.working_days).toBe(22);
    expect(result.overtime_hours).toBe(4);
  });

  it('keeps non-existent columns undefined (payment_date/days_worked/regular_hours)', () => {
    const result = toPayslipData(PAYROLL_ROW, { currency: OMR });
    expect(result.payment_date).toBeUndefined();
    expect(result.days_worked).toBeUndefined();
    expect(result.regular_hours).toBeUndefined();
  });

  it('sources the currency block from the resolved CurrencyConfig (never USD)', () => {
    const result = toPayslipData(PAYROLL_ROW, { currency: OMR });
    expect(result.accounting_locales?.currency_symbol).toBe('ر.ع.');
    expect(result.accounting_locales?.currency_symbol).not.toBe('USD');
  });

  it('builds the employee and payroll_period blocks from relations', () => {
    const result = toPayslipData(PAYROLL_ROW, {
      currency: OMR,
      employee: { first_name: 'Sam', last_name: 'Lee', employee_number: 'E-1' },
      period: { period_name: 'Jan 2026', start_date: '2026-01-01', end_date: '2026-01-31' },
    });
    expect(result.employee).toEqual({ first_name: 'Sam', last_name: 'Lee', employee_number: 'E-1' });
    expect(result.payroll_period.period_name).toBe('Jan 2026');
  });
});

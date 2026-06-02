import { describe, it, expect, vi } from 'vitest';

// dataFetcher imports the Supabase client at module load; stub it so the pure
// transform functions can be tested in isolation (they never touch the network).
vi.mock('../supabaseClient', () => ({ supabase: {} }));
vi.mock('../companySettingsService', () => ({ getOrCreateCompanySettings: vi.fn() }));

import { toQuoteData, toInvoiceData } from './dataFetcher';

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

describe('toQuoteData — customer/company contract (regression: customer info shows N/A)', () => {
  it('populates customer from a separately-fetched customer row', () => {
    const result = toQuoteData(QUOTE_ROW, {
      customer: { id: 'cust1', customer_name: 'Midhilesh Krishnan', email: 'm@x.com', mobile_number: '+968 92495122', phone: null },
    });
    expect(result.customer?.customer_name).toBe('Midhilesh Krishnan');
    expect(result.customer?.email).toBe('m@x.com');
    expect(result.customer?.mobile_number).toBe('+968 92495122');
  });

  it('falls back from phone_number to the DB `phone` column', () => {
    const result = toQuoteData(QUOTE_ROW, { customer: { id: 'c', customer_name: 'No Mobile', phone: '12345' } });
    expect(result.customer?.phone_number).toBe('12345');
  });

  it('maps company and falls back company_name to name', () => {
    const result = toQuoteData(QUOTE_ROW, { company: { id: 'co', name: 'Acme LLC' } });
    expect(result.company?.company_name).toBe('Acme LLC');
  });

  it('maps the case reference and creator profile', () => {
    const result = toQuoteData(QUOTE_ROW, { createdByProfile: { id: 'u', full_name: 'Tech One' } });
    expect(result.cases?.case_no).toBe('CASE-1');
    expect(result.created_by_profile?.full_name).toBe('Tech One');
  });

  it('reduces the associated company to { id, company_name }', () => {
    const result = toQuoteData(QUOTE_ROW, {
      customerAssociatedCompany: { id: 'ac', company_name: 'Parent Co', email: 'x@x.com' },
    });
    expect(result.customer_associated_company).toEqual({ id: 'ac', company_name: 'Parent Co' });
  });

  it('coerces an unknown currency_position to a valid literal', () => {
    const result = toQuoteData(QUOTE_ROW, {
      locale: { currency_symbol: 'OMR', currency_position: 'weird', decimal_places: 3 },
    });
    expect(result.accounting_locales?.currency_position).toBe('before');
    expect(result.accounting_locales?.currency_symbol).toBe('OMR');
    expect(result.accounting_locales?.decimal_places).toBe(3);
  });

  it('leaves customer undefined when none is provided (no silent leak)', () => {
    const result = toQuoteData(QUOTE_ROW, {});
    expect(result.customer).toBeUndefined();
  });
});

describe('toInvoiceData — customer/company/bank contract', () => {
  it('populates customer and company from separately-fetched rows', () => {
    const result = toInvoiceData(INVOICE_ROW, {
      customer: { id: 'c', customer_name: 'Jane Doe', email: 'j@x.com', phone: '555' },
      company: { id: 'co', company_name: 'Globex' },
    });
    expect(result.customer?.customer_name).toBe('Jane Doe');
    expect(result.customer?.phone_number).toBe('555');
    expect(result.company?.company_name).toBe('Globex');
  });

  it('maps the embedded bank account (account_name alias) from the invoice row', () => {
    const result = toInvoiceData(INVOICE_ROW, {});
    expect(result.bank_accounts?.account_name).toBe('Main Account');
    expect(result.bank_accounts?.bank_name).toBe('BankX');
    expect(result.bank_accounts?.iban).toBe('IB99');
  });

  it('maps the case reference from the invoice row', () => {
    const result = toInvoiceData(INVOICE_ROW, {});
    expect(result.cases?.case_no).toBe('CASE-9');
  });

  it('leaves customer undefined when none is provided', () => {
    const result = toInvoiceData(INVOICE_ROW, {});
    expect(result.customer).toBeUndefined();
  });
});

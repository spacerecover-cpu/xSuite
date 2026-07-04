import type { InvoiceDocumentData } from '../types';

/** A 1×1 transparent PNG so the QR/footer image branches execute. */
export const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/**
 * Representative tax invoice WITH payment history, a discount, 5% VAT, and a
 * partial payment. Currency AED, 2 decimals, position 'after' → "1,500.00 AED".
 * Numbers chosen so the math is easy to read:
 *   subtotal 1500.00, discount 100.00 → net 1400.00, VAT 5% = 70.00,
 *   total 1470.00, amount paid 470.00 → balance due 1000.00.
 *
 * Extracted from `invoiceParity.test.ts` (was the inline `makeInvoiceData`) so
 * the compliance suite can reuse the exact same builder — a pure test refactor,
 * zero behavior change. Overrides accept any `InvoiceData` field, so compliance
 * tests can thread `tax_lines` / `buyer_*` / `supply_date` / `notations`.
 */
export function buildInvoiceFixture(
  overrides?: Partial<InvoiceDocumentData['invoiceData']>,
): InvoiceDocumentData {
  return {
    invoiceData: {
      id: 'inv-parity',
      invoice_number: 'INV-2026-0042',
      invoice_type: 'tax_invoice',
      invoice_date: '2026-06-13',
      due_date: '2026-06-27',
      status: 'issued',
      client_reference: 'PO-9001',
      subtotal: 1500,
      tax_rate: 5,
      tax_amount: 70,
      discount_amount: 100,
      total_amount: 1470,
      amount_paid: 470,
      balance_due: 1000,
      payment_terms: 'Net 14 days from the invoice date.',
      notes: 'Thank you for trusting our lab with your data recovery.',
      created_at: '2026-06-13T00:00:00Z',
      customer: {
        id: 'cust-1',
        customer_name: 'Jane Client',
        email: 'jane@client.test',
        mobile_number: '+971 50 123 4567',
      },
      cases: {
        id: 'case-1',
        case_no: 'CASE-0007',
        contact_name: 'Jane Client',
        contact_email: 'jane@client.test',
        contact_phone: '+971 50 123 4567',
      },
      bank_accounts: {
        id: 'bank-1',
        account_name: 'Acme Data Recovery LLC',
        bank_name: 'First National Bank',
        account_number: '0123456789',
        iban: 'AE12 0000 0000 0123 4567 89',
        swift_code: 'FNBKAEXX',
      },
      invoice_line_items: [
        { description: 'RAID-5 logical recovery', quantity: 1, unit_price: 1000, tax_rate: 5, line_total: 1000 },
        { description: 'Donor drive sourcing', quantity: 2, unit_price: 250, tax_rate: 5, line_total: 500 },
      ],
      accounting_locales: {
        currency_symbol: 'AED',
        currency_position: 'after',
        decimal_places: 2,
      },
      ...overrides,
    },
    companySettings: {
      basic_info: { company_name: 'Acme Data Recovery', legal_name: 'Acme Data Recovery LLC' },
      location: { address_line1: '12 Lab Street', city: 'Dubai', country: 'United Arab Emirates' },
      contact_info: { phone_primary: '+971 4 123 4567', email_general: 'lab@acme.test' },
      branding: { brand_tagline: 'Recovered. Verified. Delivered.' },
      online_presence: { website: 'https://acme.test' },
    },
    paymentHistory: [
      {
        payment_date: '2026-06-14',
        amount: 300,
        method: 'Bank Transfer',
        reference: 'TRX-1001',
        transaction_id: 'txn-1',
        status: 'completed',
        recorded_by: 'Alex Accounts',
        notes: null,
        doc_number: 'RCPT-0001',
        source: 'receipt',
        running_balance: 1170,
      },
      {
        payment_date: '2026-06-15',
        amount: 170,
        method: 'Cash',
        reference: 'CASH-9',
        transaction_id: 'txn-2',
        status: 'completed',
        recorded_by: 'Alex Accounts',
        notes: null,
        doc_number: 'RCPT-0002',
        source: 'receipt',
        running_balance: 1000,
      },
    ],
  };
}

import type { QuoteDocumentData } from '../types';

/** A 1×1 transparent PNG so the QR/footer image branches execute. */
export const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/**
 * Representative quote WITH an amount discount, 5% VAT, a bank box, terms and
 * notes. Currency AED, 2 decimals, position 'after' → "1,500.00 AED".
 * Math (mirrors the legacy builder, discount_type 'amount'):
 *   subtotal 1500.00, discount 100.00 → net 1400.00, VAT 5% = 70.00,
 *   total 1470.00.
 *
 * Extracted from `quoteParity.test.ts` (was the inline `makeQuoteData`) so the
 * compliance suite can reuse the exact same builder — a pure test refactor,
 * zero behavior change. Overrides accept any `QuoteData` field, so compliance
 * tests can thread `tax_lines` / `buyer_*` / `supply_date` / `notations`.
 */
export function buildQuoteFixture(
  overrides?: Partial<QuoteDocumentData['quoteData']>,
): QuoteDocumentData {
  return {
    quoteData: {
      id: 'quote-parity',
      quote_number: 'QUO-2026-0042',
      status: 'sent',
      title: 'RAID recovery quotation',
      valid_until: '2026-07-13',
      client_reference: 'PO-9001',
      subtotal: 1500,
      tax_rate: 5,
      tax_amount: 70,
      discount_amount: 100,
      discount_type: 'amount',
      total_amount: 1470,
      terms_and_conditions: 'Quote valid for 30 days. 50% advance required to begin.',
      notes: 'Diagnostics are non-destructive.',
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
      quote_items: [
        { description: 'RAID-5 logical recovery', quantity: 1, unit_price: 1000 },
        { description: 'Donor drive sourcing', quantity: 2, unit_price: 250 },
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
  };
}

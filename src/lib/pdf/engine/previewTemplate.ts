/**
 * previewTemplate — render a live PDF preview of a {@link DocumentTemplateConfig}
 * from synthetic sample data, returning an object-URL the UI can drop into an
 * `<iframe>`.
 *
 * This powers the M4 "Settings → Documents" editor's right-hand live preview: as
 * the tenant toggles sections, renames columns, or flips the language mode, the
 * editor re-resolves the config and calls this to produce a fresh preview blob.
 *
 * It reuses the EXISTING engine end-to-end (the same path the invoice pilot test
 * exercises): synthetic {@link InvoiceDocumentData} → {@link toEngineData} (the
 * adapter that owns all currency/math) → {@link renderTemplate} (the
 * config-driven assembler) → {@link createPdfWithFonts}`.getBlob()` →
 * `URL.createObjectURL`. Nothing here touches the legacy builders, the
 * production invoice flag, or the DB — it is a pure client-side render of
 * fixture data. The caller is responsible for `URL.revokeObjectURL` on the
 * returned url when it swaps in a new preview or unmounts.
 *
 * Fonts: the caller should ensure fonts are ready (e.g. `preloadAllFonts()`)
 * before invoking; we default the translation context to the Roboto/English
 * path so a preview always renders even before Arabic fonts load.
 */

import type { DocumentTemplateConfig } from '../templateConfig';
import type { InvoiceDocumentData, TranslationContext } from '../types';
import { toEngineData } from './adapters/invoiceAdapter';
import { renderTemplate } from './renderTemplate';
import { createPdfWithFonts } from '../fonts';

/**
 * A 1×1 transparent PNG so the QR/logo image branches execute without needing a
 * real asset. Kept tiny and inline — the preview is about layout, not artwork.
 */
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/**
 * A realistic, fully-populated sample invoice with a multi-line table, a
 * discount and 5% VAT, full company identity, a customer, and bank details — so
 * every financial section (header, parties, meta, line items, totals, terms,
 * bank, qr, footer) has data to render. Numbers are chosen to read cleanly:
 *   subtotal 1,500.00, discount 100.00 → net 1,400.00, VAT 5% = 70.00,
 *   total 1,470.00.
 */
export function sampleInvoiceData(): InvoiceDocumentData {
  return {
    invoiceData: {
      id: 'preview-invoice',
      invoice_number: 'INV-0042',
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
      amount_paid: 0,
      balance_due: 1470,
      payment_terms: 'Net 14 days from the invoice date. Late payments may incur a service charge.',
      notes: 'Thank you for trusting our lab with your data recovery.',
      created_at: '2026-06-13T00:00:00Z',
      customer: {
        id: 'preview-customer',
        customer_name: 'Jane Client',
        email: 'jane@client.example',
        mobile_number: '+971 50 123 4567',
      },
      cases: {
        id: 'preview-case',
        case_no: 'CASE-0007',
        contact_name: 'Jane Client',
        contact_email: 'jane@client.example',
        contact_phone: '+971 50 123 4567',
      },
      bank_accounts: {
        id: 'preview-bank',
        account_name: 'Acme Data Recovery LLC',
        bank_name: 'First National Bank',
        account_number: '0123456789',
        iban: 'AE12 0000 0000 0123 4567 89',
        swift_code: 'FNBKAEXX',
      },
      invoice_line_items: [
        { description: 'RAID-5 logical recovery (4 × 4TB)', quantity: 1, unit_price: 850, tax_rate: 5, line_total: 850 },
        { description: 'Clean-room head-stack transplant', quantity: 1, unit_price: 400, tax_rate: 5, line_total: 400 },
        { description: 'Donor drive sourcing', quantity: 2, unit_price: 125, tax_rate: 5, line_total: 250 },
      ],
      accounting_locales: {
        currency_symbol: 'AED',
        currency_position: 'after',
        decimal_places: 2,
      },
    },
    companySettings: {
      basic_info: {
        company_name: 'Acme Data Recovery',
        legal_name: 'Acme Data Recovery LLC',
        vat_number: 'TRN-100123456700003',
      },
      location: {
        address_line1: '12 Lab Street',
        city: 'Dubai',
        country: 'United Arab Emirates',
      },
      contact_info: {
        phone_primary: '+971 4 123 4567',
        email_general: 'lab@acme.example',
      },
      branding: { brand_tagline: 'Recovered. Verified. Delivered.' },
      online_presence: { website: 'https://acme.example' },
    },
    paymentHistory: [],
  };
}

/** A neutral English/LTR context — a preview always renders even before Arabic fonts load. */
const PREVIEW_CTX_EN: TranslationContext = {
  t: (_key: string, englishText: string) => englishText,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

/**
 * Render a live preview of `config` from synthetic invoice data and return a
 * blob object-URL suitable for an `<iframe src>`.
 *
 * @param config The resolved template config to preview (e.g. the cascade result
 *               the editor is currently editing).
 * @param ctx    Optional translation context; defaults to English/LTR/Roboto.
 * @returns A `blob:` URL — the caller MUST `URL.revokeObjectURL` it when done.
 */
export function previewTemplate(
  config: DocumentTemplateConfig,
  ctx: TranslationContext = PREVIEW_CTX_EN,
): Promise<string> {
  const data = sampleInvoiceData();
  const engineData = toEngineData(data, config);
  const docDefinition = renderTemplate(config, engineData, ctx, TINY_PNG, TINY_PNG);

  return new Promise<string>((resolve, reject) => {
    try {
      createPdfWithFonts(docDefinition).getBlob((blob: Blob) => {
        resolve(URL.createObjectURL(blob));
      });
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Failed to render template preview'));
    }
  });
}

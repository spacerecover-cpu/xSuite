import { describe, it, expect, vi } from 'vitest';
import type { CreditNoteDocumentData } from './types';

// generateCreditNote has no legacy feature flag: it always builds via the
// engine. The hand-written `buildCreditNoteDocument` was deleted in Task 10
// after final legacy↔engine parity, so the engine is now the sole credit-note
// render path. This exercises the unconditional route end-to-end: the
// engine-produced doc-definition must carry the credit-note number and total.

const fixture: CreditNoteDocumentData = {
  creditNoteData: {
    credit_note_number: 'CN-ROUTE-0001',
    credit_note_date: '2026-07-01',
    credit_type: 'refund',
    status: 'issued',
    reason_code: 'FAILED_RECOVERY',
    reason_notes: 'Refund — failed recovery',
    subtotal: 100,
    tax_rate: 5,
    tax_amount: 5,
    total_amount: 105,
    applied_amount: 0,
    invoice_number: 'INVO-0007',
    customer_name: 'Test Buyer',
    company_name: null,
    case_no: null,
    currency_symbol: 'OMR',
    currency_position: 'after',
    decimal_places: 3,
    items: [{ description: 'Refund — failed recovery', quantity: 1, unit_price: 100, line_total: 105 }],
  },
  companySettings: { basic_info: { company_name: 'Acme Data Recovery', legal_name: 'Acme Data Recovery LLC' } },
};

vi.mock('./dataFetcher', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./dataFetcher')>();
  return { ...actual, fetchCreditNoteData: vi.fn(async () => fixture) };
});

vi.mock('./fonts', () => ({
  initializePDFFonts: vi.fn(async () => true),
  createPdfWithFonts: vi.fn(() => ({ download: vi.fn(), open: vi.fn() })),
  getFontFamily: vi.fn(() => 'Roboto'),
}));

vi.mock('./loggingService', () => ({
  logPDFGeneration: vi.fn(async () => {}),
}));

vi.mock('./engine/profileResolver', async () => {
  const { gccTaxInvoiceProfile } = await import('../regimes/gcc_tax_invoice');
  return {
    resolveComplianceRenderInputs: vi.fn(async () => ({
      facts: null,
      profile: gccTaxInvoiceProfile,
      sellerRegistered: false,
      sellerTaxNumber: null,
    })),
    clearComplianceRenderCache: vi.fn(),
  };
});

vi.mock('../documentTemplateService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../documentTemplateService')>();
  return { ...actual, getDeployedVersionByType: vi.fn(async () => null) };
});

import { generateCreditNote } from './pdfService';
import { createPdfWithFonts } from './fonts';

// Recursively collect every `text` string in a pdfmake content tree.
function collectText(node: unknown, acc: string[]): void {
  if (node == null) return;
  if (typeof node === 'string') {
    acc.push(node);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((n) => collectText(n, acc));
    return;
  }
  if (typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (typeof o.text === 'string') acc.push(o.text);
    else if (o.text != null) collectText(o.text, acc);
    collectText(o.stack, acc);
    collectText(o.columns, acc);
    if (o.table && typeof o.table === 'object') {
      collectText((o.table as Record<string, unknown>).body, acc);
    }
  }
}

describe('generateCreditNote — unconditional engine route', () => {
  it('renders the engine-produced document', async () => {
    const result = await generateCreditNote('cn-1', false);

    expect(result.success).toBe(true);
    expect(createPdfWithFonts).toHaveBeenCalledTimes(1);

    const docDefinition = vi.mocked(createPdfWithFonts).mock.calls[0][0] as { content: unknown };
    const texts: string[] = [];
    collectText(docDefinition.content, texts);
    const blob = texts.join(' | ');
    expect(blob).toContain('CN-ROUTE-0001');
    expect(blob).toContain('105');
  });
});

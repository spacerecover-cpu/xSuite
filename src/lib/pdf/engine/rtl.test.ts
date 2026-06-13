import { describe, it, expect } from 'vitest';
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { renderTemplate } from './renderTemplate';
import type { EngineDocData } from './types';
import type { TranslationContext } from '../types';
import {
  BUILT_IN_TEMPLATE_CONFIGS,
  resolveTemplateConfig,
  type DocumentTemplateConfig,
} from '../templateConfig';
import { engineLayoutDirection, engineDefaultFont, bilingualLabelRuns } from './rtl';

// ---------------------------------------------------------------------------
// M6 — true RTL + bilingual layout. These tests assert the engine, when the
// resolved `config.language.mode` puts Arabic in the lead, (1) sets the document
// defaultStyle font to the Arabic family and the default alignment to right,
// (2) MIRRORS the line-item and payment-history table column order and swaps
// left/right cell alignments, (3) right-aligns labels, and (4) still surfaces
// the real Arabic label strings in bilingual_sidebyside. English-only mode must
// stay byte-for-byte LTR (the legacy default).
//
// As with renderTemplate.test.ts we do NOT snapshot — we walk the structural
// tree with helpers and make targeted assertions. All inputs are synthetic.
// ---------------------------------------------------------------------------

const bilingualArCtx: TranslationContext = {
  t: (_key: string, englishText: string) => englishText,
  isRTL: true,
  isBilingual: true,
  languageCode: 'ar',
  fontFamily: 'Roboto',
};

const englishCtx: TranslationContext = {
  t: (_key: string, englishText: string) => englishText,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/** A financial EngineDocData with a 3-column line-item table and a payment history. */
function makeData(): EngineDocData {
  return {
    documentTitle: { en: 'TAX INVOICE', ar: 'فاتورة ضريبية' },
    identity: {
      basic_info: { company_name: 'Acme Data Recovery', legal_name: 'Acme Data Recovery LLC' },
      location: { address_line1: '12 Lab Street', city: 'Muscat', country: 'Oman' },
      contact_info: { phone_primary: '+968 1234 5678', email_general: 'lab@acme.test' },
      branding: { brand_tagline: 'Recovered. Verified. Delivered.' },
      online_presence: { website: 'https://acme.test' },
    },
    parties: {
      to: {
        title: { en: 'Customer Information', ar: 'معلومات العميل' },
        name: 'Jane Client',
        rows: [{ label: { en: 'Phone:', ar: 'الهاتف:' }, value: '+968 9999 0000' }],
      },
    },
    meta: [{ label: { en: 'Invoice No:', ar: 'رقم الفاتورة:' }, value: 'INVO-0042' }],
    lineItems: {
      columns: [
        { key: 'description', visible: true, label: { en: 'Description', ar: 'الوصف' }, width: 220, align: 'left' },
        { key: 'quantity', visible: true, label: { en: 'Qty', ar: 'الكمية' }, width: 40, align: 'center' },
        { key: 'lineTotal', visible: true, label: { en: 'Total', ar: 'المجموع' }, align: 'right' },
      ],
      rows: [{ description: 'RAID-5 logical recovery', quantity: '1', lineTotal: '1000.000 OMR' }],
    },
    totals: [
      { label: { en: 'Subtotal:', ar: 'المجموع الفرعي:' }, value: '1000.000 OMR' },
      { label: { en: 'Total:', ar: 'الإجمالي:' }, value: '1050.000 OMR', emphasis: true },
    ],
    paymentHistory: {
      title: { en: 'Payment History', ar: 'سجل الدفعات' },
      columns: {
        date: { en: 'Date', ar: 'التاريخ' },
        document: { en: 'Document', ar: 'المستند' },
        method: { en: 'Method', ar: 'الطريقة' },
        reference: { en: 'Reference', ar: 'المرجع' },
        recordedBy: { en: 'Recorded By', ar: 'سجلها' },
        amount: { en: 'Amount', ar: 'المبلغ' },
        balance: { en: 'Balance', ar: 'الرصيد' },
      },
      rows: [
        {
          date: '13 Jun 2026',
          document: 'RCPT-0001',
          method: 'Cash',
          reference: 'REF-9',
          recordedBy: 'Lab Admin',
          amount: '500.000 OMR',
          runningBalance: '550.000 OMR',
        },
      ],
    },
    terms: { title: { en: 'Payment Terms', ar: 'شروط الدفع' }, body: 'Net 14 days.' },
    bank: null,
    qrCaption: 'Scan to pay this invoice',
  };
}

/** Collect every leaf `text` string in a pdfmake content tree (recursively). */
function collectTexts(node: unknown, out: string[]): void {
  if (node == null) return;
  if (typeof node === 'string') {
    out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectTexts(child, out);
    return;
  }
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if ('text' in obj) collectTexts(obj.text, out);
    for (const key of Object.keys(obj)) {
      if (key === 'text') continue;
      collectTexts(obj[key], out);
    }
  }
}

function allTexts(def: TDocumentDefinitions): string[] {
  const out: string[] = [];
  collectTexts(def.content, out);
  const footer = def.footer as
    | ((currentPage: number, pageCount: number, pageSize?: unknown) => Content)
    | Content
    | undefined;
  if (typeof footer === 'function') collectTexts(footer(1, 1), out);
  else if (footer != null) collectTexts(footer, out);
  return out;
}

/**
 * Find the FIRST pdfmake table whose header-row cells include the given header
 * text. Returns the `{ table }` node (with `.table.body`), or null.
 */
function findTableByHeader(node: unknown, headerText: string): { table: { body: TableCell[][]; widths?: unknown[] } } | null {
  if (node == null || typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;
  if ('table' in obj && obj.table && typeof obj.table === 'object') {
    const body = (obj.table as { body?: unknown }).body;
    if (Array.isArray(body) && body.length > 0) {
      const header = body[0];
      const headerTexts: string[] = [];
      collectTexts(header, headerTexts);
      if (headerTexts.some((t) => t.includes(headerText))) {
        return obj as { table: { body: TableCell[][]; widths?: unknown[] } };
      }
    }
  }
  // Recurse children.
  for (const key of Object.keys(obj)) {
    const found = findTableByHeader(obj[key], headerText);
    if (found) return found;
  }
  return null;
}

/** Ordered list of the leading text leaf of each cell in a table row. */
function rowCellTexts(row: TableCell[]): string[] {
  return row.map((cell) => {
    const texts: string[] = [];
    collectTexts(cell, texts);
    return texts[0] ?? '';
  });
}

/** The `alignment` of each cell in a row (undefined when not set). */
function rowCellAligns(row: TableCell[]): Array<string | undefined> {
  return row.map((cell) => {
    if (cell && typeof cell === 'object' && 'alignment' in (cell as Record<string, unknown>)) {
      return (cell as Record<string, unknown>).alignment as string | undefined;
    }
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// rtl helper unit
// ---------------------------------------------------------------------------

describe('rtl helper — direction & font derivation', () => {
  it('reports rtl for Arabic-only mode', () => {
    expect(engineLayoutDirection({ mode: 'ar', primary: 'ar' })).toBe('rtl');
  });

  it('reports rtl for a bilingual mode with Arabic primary', () => {
    expect(engineLayoutDirection({ mode: 'bilingual_sidebyside', primary: 'ar' })).toBe('rtl');
    expect(engineLayoutDirection({ mode: 'bilingual_stacked', primary: 'ar' })).toBe('rtl');
  });

  it('reports ltr for English-only and English-primary bilingual', () => {
    expect(engineLayoutDirection({ mode: 'en', primary: 'en' })).toBe('ltr');
    expect(engineLayoutDirection({ mode: 'bilingual_sidebyside', primary: 'en' })).toBe('ltr');
  });

  it('selects the Arabic font for rtl, the ctx font otherwise', () => {
    expect(engineDefaultFont({ mode: 'ar', primary: 'ar' }, 'Roboto')).toBe('Tajawal');
    expect(engineDefaultFont({ mode: 'en', primary: 'en' }, 'Roboto')).toBe('Roboto');
  });
});

describe('rtl helper — per-run bilingual font tagging', () => {
  it('emits a single English run (no Arabic font) in english-only mode', () => {
    const runs = bilingualLabelRuns(
      { en: 'Subtotal:', ar: 'المجموع الفرعي:' },
      { mode: 'en', primary: 'en' },
      'Roboto',
    );
    expect(runs).toEqual([{ text: 'Subtotal:' }]);
  });

  it('tags the Arabic run with the Arabic font and the English run with the base font (bilingual, English primary)', () => {
    const runs = bilingualLabelRuns(
      { en: 'Subtotal:', ar: 'المجموع الفرعي:' },
      { mode: 'bilingual_sidebyside', primary: 'en' },
      'Roboto',
    );
    // English first (primary en), then separator, then Arabic run tagged Tajawal.
    const englishRun = runs.find((r) => r.text === 'Subtotal:');
    const arabicRun = runs.find((r) => r.text === 'المجموع الفرعي:');
    expect(englishRun).toBeDefined();
    expect(arabicRun).toBeDefined();
    expect(arabicRun!.font).toBe('Tajawal');
    // English run keeps the base font (explicit, so a Tajawal default doesn't bleed in).
    expect(englishRun!.font).toBe('Roboto');
  });

  it('leads with the Arabic run when Arabic is primary', () => {
    const runs = bilingualLabelRuns(
      { en: 'Total:', ar: 'الإجمالي:' },
      { mode: 'ar', primary: 'ar' },
      'Roboto',
    );
    // Arabic-only mode → a single Arabic run, Arabic font.
    expect(runs).toEqual([{ text: 'الإجمالي:', font: 'Tajawal' }]);
  });

  it('degrades to the English run when no Arabic string exists', () => {
    const runs = bilingualLabelRuns(
      { en: 'VAT 0%:' },
      { mode: 'bilingual_sidebyside', primary: 'en' },
      'Roboto',
    );
    expect(runs).toEqual([{ text: 'VAT 0%:', font: 'Roboto' }]);
  });
});

// ---------------------------------------------------------------------------
// document-level RTL
// ---------------------------------------------------------------------------

describe('renderTemplate — RTL document defaults (mode ar)', () => {
  it('sets the Arabic font and right alignment in defaultStyle', () => {
    const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, {
      language: { mode: 'ar', primary: 'ar' },
    });
    const def = renderTemplate(config, makeData(), bilingualArCtx, null, TINY_PNG);
    expect((def.defaultStyle as { font?: string }).font).toBe('Tajawal');
    expect((def.defaultStyle as { alignment?: string }).alignment).toBe('right');
  });

  it('keeps LTR Roboto defaults for english-only mode (legacy unchanged)', () => {
    const def = renderTemplate(BUILT_IN_TEMPLATE_CONFIGS.invoice, makeData(), englishCtx, null, TINY_PNG);
    expect(def.defaultStyle).toEqual({ font: 'Roboto' });
    expect((def.defaultStyle as { alignment?: string }).alignment).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// table column mirroring under RTL
// ---------------------------------------------------------------------------

describe('renderTemplate — RTL line-item table mirroring', () => {
  it('mirrors line-item column order under Arabic RTL', () => {
    const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, {
      language: { mode: 'ar', primary: 'ar' },
    });
    const def = renderTemplate(config, makeData(), bilingualArCtx, null, null);
    const table = findTableByHeader(def.content, 'الوصف') ?? findTableByHeader(def.content, 'Description');
    expect(table).not.toBeNull();
    const headerOrder = rowCellTexts(table!.table.body[0]);
    // LTR order is [Description, Qty, Total]; mirrored RTL header order must end
    // with the Description column (leftmost LTR → rightmost reading start).
    expect(headerOrder[headerOrder.length - 1]).toContain('الوصف');
    expect(headerOrder[0]).toContain('المجموع');
  });

  it('keeps LTR line-item column order for english-only mode', () => {
    const def = renderTemplate(BUILT_IN_TEMPLATE_CONFIGS.invoice, makeData(), englishCtx, null, null);
    const table = findTableByHeader(def.content, 'Description');
    expect(table).not.toBeNull();
    const headerOrder = rowCellTexts(table!.table.body[0]);
    expect(headerOrder[0]).toContain('Description');
    expect(headerOrder[headerOrder.length - 1]).toContain('Total');
  });

  it('swaps left/right cell alignment under RTL (right-aligned col becomes left)', () => {
    const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, {
      language: { mode: 'ar', primary: 'ar' },
    });
    const def = renderTemplate(config, makeData(), bilingualArCtx, null, null);
    const table = findTableByHeader(def.content, 'الوصف') ?? findTableByHeader(def.content, 'Description');
    expect(table).not.toBeNull();
    const headerAligns = rowCellAligns(table!.table.body[0]);
    // The Total column was right-aligned in LTR; after mirroring it leads the
    // row and its alignment is swapped to 'left'. The Description column (left in
    // LTR) trails and is swapped to 'right'.
    expect(headerAligns[0]).toBe('left');
    expect(headerAligns[headerAligns.length - 1]).toBe('right');
  });
});

describe('renderTemplate — RTL payment-history table mirroring', () => {
  it('mirrors payment-history column order under Arabic RTL', () => {
    const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, {
      language: { mode: 'ar', primary: 'ar' },
    });
    const def = renderTemplate(config, makeData(), bilingualArCtx, null, null);
    const table = findTableByHeader(def.content, 'التاريخ') ?? findTableByHeader(def.content, 'Date');
    expect(table).not.toBeNull();
    const headerOrder = rowCellTexts(table!.table.body[0]);
    // LTR order leads with Date and ends with Balance; mirrored leads with Balance.
    expect(headerOrder[0]).toContain('الرصيد');
    expect(headerOrder[headerOrder.length - 1]).toContain('التاريخ');
  });

  it('keeps LTR payment-history order for english-only mode', () => {
    const def = renderTemplate(BUILT_IN_TEMPLATE_CONFIGS.invoice, makeData(), englishCtx, null, null);
    const table = findTableByHeader(def.content, 'Date');
    expect(table).not.toBeNull();
    const headerOrder = rowCellTexts(table!.table.body[0]);
    expect(headerOrder[0]).toContain('Date');
    expect(headerOrder[headerOrder.length - 1]).toContain('Balance');
  });
});

// ---------------------------------------------------------------------------
// bilingual side-by-side: real Arabic strings present, both languages adjacent
// ---------------------------------------------------------------------------

describe('renderTemplate — bilingual_sidebyside Arabic content', () => {
  it('surfaces the real Arabic labels alongside English', () => {
    const config: DocumentTemplateConfig = resolveTemplateConfig(
      BUILT_IN_TEMPLATE_CONFIGS.invoice,
      undefined,
      { language: { mode: 'bilingual_sidebyside', primary: 'ar' } },
    );
    const def = renderTemplate(config, makeData(), bilingualArCtx, null, TINY_PNG);
    const texts = allTexts(def);
    // Customer Information box title — both languages must be present.
    expect(texts.some((t) => t.includes('معلومات العميل'))).toBe(true);
    expect(texts.some((t) => t.includes('Customer Information'))).toBe(true);
    // Line-item heading Arabic ("Line Items" → البنود) present.
    expect(texts.some((t) => t.includes('البنود'))).toBe(true);
  });

  it('totals labels are right-aligned under RTL', () => {
    const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, {
      language: { mode: 'ar', primary: 'ar' },
    });
    const def = renderTemplate(config, makeData(), bilingualArCtx, null, null);
    // The emphasised grand total renders as a 2-cell table row; its label cell
    // must be right-aligned (already true in LTR, must remain so in RTL).
    const totalsTable = findTableByHeader(def.content, 'الإجمالي');
    expect(totalsTable).not.toBeNull();
    const aligns = rowCellAligns(totalsTable!.table.body[0]);
    expect(aligns.every((a) => a === 'right')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// english-only regression — content identical to no-RTL behavior
// ---------------------------------------------------------------------------

describe('renderTemplate — english-only LTR is unchanged', () => {
  it('does not surface Arabic strings in english-only mode', () => {
    const def = renderTemplate(BUILT_IN_TEMPLATE_CONFIGS.invoice, makeData(), englishCtx, null, null);
    const texts = allTexts(def);
    expect(texts.some((t) => t.includes('الوصف'))).toBe(false);
    expect(texts.some((t) => t.includes('معلومات العميل'))).toBe(false);
    expect(texts.some((t) => t.includes('Description'))).toBe(true);
  });
});

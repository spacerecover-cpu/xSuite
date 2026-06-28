// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { assembleTypst } from './assemble';
import { ctxFromLanguageConfig } from '../translationContext';
import { BUILT_IN_TEMPLATE_CONFIGS, resolveTemplateConfig, type LanguageConfig } from '../templateConfig';
import type { EngineDocData } from '../engine/types';

// A comprehensive bilingual (EN+AR) invoice fixture exercising EVERY section the
// assembler emits, so a Typst syntax error in any branch fails this compile.
const data = {
  documentTitle: { en: 'TAX INVOICE', ar: 'فاتورة ضريبية' },
  identity: { basic_info: { company_name: 'Acme Data Recovery LLC' } },
  parties: {
    to: {
      title: { en: 'Customer Information', ar: 'معلومات العميل' },
      name: 'Jane Client',
      rows: [
        { label: { en: 'Phone:', ar: 'الهاتف:' }, value: '+968 94971196' },
        { label: { en: 'Email:', ar: 'البريد:' }, value: 'jane@client.example' },
      ],
    },
  },
  meta: [
    { label: { en: 'Invoice No:', ar: 'رقم الفاتورة:' }, value: 'INV-0032' },
    { label: { en: 'Invoice Date:', ar: 'تاريخ الفاتورة:' }, value: '21 Jun 2026' },
  ],
  lineItems: {
    columns: [
      { key: 'description', visible: true, label: { en: 'Description', ar: 'الوصف' }, align: 'left' },
      { key: 'qty', visible: true, label: { en: 'Qty', ar: 'الكمية' }, align: 'center', width: 40 },
      { key: 'lineTotal', visible: true, label: { en: 'Total', ar: 'المجموع' }, align: 'right' },
    ],
    rows: [{ description: 'RAID-5 logical recovery (4 × 4TB)', qty: '1', lineTotal: '2,000.000 OMR' }],
  },
  totals: [
    { label: { en: 'Subtotal:', ar: 'المجموع الفرعي:' }, value: '2,000.000 OMR' },
    { label: { en: 'VAT 5%:', ar: 'ضريبة القيمة المضافة 5%:' }, value: '100.000 OMR' },
    { label: { en: 'Total:', ar: 'الإجمالي:' }, value: '2,100.000 OMR', emphasis: true },
  ],
  terms: { title: { en: 'Invoice Terms', ar: 'شروط الفاتورة' }, body: 'Net 14 days. Late payment may incur a charge.' },
  bank: {
    title: { en: 'Bank Account', ar: 'تفاصيل البنك' },
    rows: [
      { label: { en: 'Account Name:', ar: 'اسم الحساب:' }, value: 'Future Space LLC' },
      { label: { en: 'IBAN:', ar: 'الآيبان:' }, value: 'OM93 0300 0002 1702 0030438' },
    ],
  },
  paymentHistory: {
    title: { en: 'Payment History', ar: 'سجل الدفعات' },
    columns: {
      date: { en: 'Date', ar: 'التاريخ' }, document: { en: 'Document', ar: 'المستند' },
      method: { en: 'Method', ar: 'الطريقة' }, reference: { en: 'Reference', ar: 'المرجع' },
      recordedBy: { en: 'Recorded By', ar: 'سجلها' }, amount: { en: 'Amount', ar: 'المبلغ' },
      balance: { en: 'Balance', ar: 'الرصيد' },
    },
    rows: [{ date: '10/06/2026', document: 'RCPT-0009', method: 'Bank Transfer', reference: '-', recordedBy: 'Nitin Ziva', amount: '1,500.000 OMR', runningBalance: '600.000 OMR' }],
  },
  signatures: [{ en: 'Received by', ar: 'استلمها' }, { en: 'Authorized by', ar: 'اعتمدها' }],
} as unknown as EngineDocData;

function render(language: LanguageConfig): Buffer {
  const c = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, { language });
  const markup = assembleTypst(data, c, ctxFromLanguageConfig(c.language));
  const compiler = NodeCompiler.create({ fontArgs: [{ fontPaths: [path.resolve('public/fonts')] }] });
  return Buffer.from(compiler.pdf({ mainFileContent: markup }));
}

describe('typst node render', () => {
  it('compiles the bilingual AR invoice to a valid, reproducible PDF with fonts', () => {
    const language = { mode: 'bilingual_sidebyside', primary: 'ar', secondary: 'ar' } as LanguageConfig;
    const a = render(language);
    const b = render(language);
    expect(a.subarray(0, 5).toString()).toBe('%PDF-');
    expect(a.length).toBeGreaterThan(2000);
    expect(createHash('sha256').update(a).digest('hex')).toBe(createHash('sha256').update(b).digest('hex'));
  });

  it('compiles an English-only invoice', () => {
    const out = render({ mode: 'en', primary: 'en' } as LanguageConfig);
    expect(out.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('compiles with footer text, page-number counters, density, landscape + zebra/rowNumbering', () => {
    // Exercises the wired config branches through the real Typst compiler — a syntax
    // error in the footer page-counter, page geometry or table fill markup fails here.
    const c = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, {
      language: { mode: 'bilingual_sidebyside', primary: 'en', secondary: 'ar' } as LanguageConfig,
      footer: { customText: 'Thank you for your business', alignment: 'center', fontSize: 9 },
      pageNumbers: { enabled: true, format: 'Page {page} of {pages}', position: 'right' },
      pageFitting: { density: 'dense' },
      paper: { size: 'Letter', orientation: 'landscape', margins: [30, 30, 30, 30] },
      table: { zebra: true, rowNumbering: true },
      colors: { accent: '#0f766e' },
      sections: [{ key: 'taxBar', visible: true }],
      taxBar: { enabled: true, source: 'manual', value: 'OM1100110011', label: { en: 'VAT Reg. No.', ar: 'الرقم الضريبي' } },
      termsContent: { terms: { en: 'Net 14 days.\nLate fees apply.', ar: 'صافي ١٤ يومًا.' }, notes: { en: 'Thank you for your business.' } },
      watermark: { text: 'DRAFT', angle: -45, opacity: 0.12 },
    });
    const markup = assembleTypst(data, c, ctxFromLanguageConfig(c.language));
    const compiler = NodeCompiler.create({ fontArgs: [{ fontPaths: [path.resolve('public/fonts')] }] });
    const out = Buffer.from(compiler.pdf({ mainFileContent: markup }));
    expect(out.subarray(0, 5).toString()).toBe('%PDF-');
    expect(out.length).toBeGreaterThan(2000);
  });

  it('compiles with a mapped logo asset referenced via #image', () => {
    const c = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, {
      language: { mode: 'bilingual_sidebyside', primary: 'en', secondary: 'ar' } as LanguageConfig,
    });
    const markup = assembleTypst(data, c, ctxFromLanguageConfig(c.language), { logoPath: '/logo.png' });
    const compiler = NodeCompiler.create({ fontArgs: [{ fontPaths: [path.resolve('public/fonts')] }] });
    // A valid 1×1 PNG (same asset the preview placeholder uses).
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGN48OABAAVEAqEuYekCAAAAAElFTkSuQmCC',
      'base64',
    );
    // The browser VFS roots at '/', so the engine maps '/logo.png' + image("/logo.png").
    // The node-compiler roots its VFS at the real cwd, so image("/logo.png") resolves
    // to <cwd>/logo.png — map there (forward slashes) for this environment.
    compiler.mapShadow(path.resolve('logo.png').replace(/\\/g, '/'), png);
    const out = Buffer.from(compiler.pdf({ mainFileContent: markup }));
    expect(out.subarray(0, 5).toString()).toBe('%PDF-');
    expect(out.length).toBeGreaterThan(2000);
  });
});

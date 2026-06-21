import { describe, it, expect } from 'vitest';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../templateConfig';
import type { TranslationPolicyConfig } from '../templateConfig';
import { renderTemplate } from './renderTemplate';
import { buildPreviewEngineData } from './sampleData';
import type { TranslationContext } from '../types';
import type { PaymentHistoryBlock } from './types';

const ctx: TranslationContext = { t: (_k, en) => en, isRTL: false, isBilingual: false, languageCode: null, fontFamily: 'Roboto' };

const render = (policy?: TranslationPolicyConfig) => {
  const base = BUILT_IN_TEMPLATE_CONFIGS.invoice;
  const config = { ...base, language: { mode: 'bilingual_stacked' as const, primary: 'ar' as const }, translationPolicy: policy };
  return JSON.stringify(renderTemplate(config, buildPreviewEngineData('invoice', config), ctx, null, null));
};

// The sample invoice is Arabic-primary bilingual_stacked, so a SUPPRESSED field
// label collapses to the primary language (Arabic) and DROPS the English — the
// bilingual stacked join `<ar>\nName:` is therefore the true "is this label
// bilingual?" discriminator (the lone Arabic `الاسم` survives suppression and is
// not a valid signal). The box TITLE is always bilingual, so its Arabic
// (`معلومات العميل`) must persist regardless of policy.
describe('translationPolicy — field-label suppression', () => {
  // NB: substrings are matched against the JSON-serialized doc-definition, so the
  // stacked-bilingual newline appears as the two-char escape `\n` (`\\nName:`).
  it('all → the customer "Name" field label is bilingual (EN+AR stacked present)', () => {
    expect(render({ mode: 'all' })).toContain('\\nName:');
  });
  it('system_only → the customer field label is primary-only (no bilingual "\\nName:")', () => {
    expect(render({ mode: 'system_only' })).not.toContain('\\nName:');
  });
  it('system_only → a SYSTEM label (customer box TITLE) stays bilingual', () => {
    expect(render({ mode: 'system_only' })).toContain('معلومات العميل');
  });
  it('custom parties:false → parties field label suppressed', () => {
    expect(render({ mode: 'custom', groups: { parties: false } })).not.toContain('\\nName:');
  });
});

// A one-row payment-history block mirroring the invoice adapter's labels, so we
// can exercise the statement table the empty sample invoice never populates.
const SAMPLE_HISTORY: PaymentHistoryBlock = {
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
    { date: '21/06/2026', document: 'PAYM-0012', method: 'Bank Transfer', reference: '#123456', recordedBy: 'Nitin Ziva', amount: 'OMR 100.000', runningBalance: 'OMR 2000.000' },
  ],
};

const renderWithHistory = (policy?: TranslationPolicyConfig) => {
  const base = BUILT_IN_TEMPLATE_CONFIGS.invoice;
  const config = { ...base, language: { mode: 'bilingual_stacked' as const, primary: 'ar' as const }, translationPolicy: policy };
  const data = { ...buildPreviewEngineData('invoice', config), paymentHistory: SAMPLE_HISTORY };
  return JSON.stringify(renderTemplate(config, data, ctx, null, null));
};

describe('translationPolicy — payment-history heading suppression', () => {
  // Match the exact serialized header/title CELL (`"text":"…"`) so an assertion
  // can't pass on an Arabic substring that leaks in from some other cell.
  it('all → the "Date" column header is bilingual (Arabic + English stacked)', () => {
    expect(renderWithHistory({ mode: 'all' })).toContain('"text":"التاريخ\\nDate"');
  });
  it('custom { paymentHistory: false } → the column header drops to Arabic-only', () => {
    const out = renderWithHistory({ mode: 'custom', groups: { paymentHistory: false } });
    expect(out).not.toContain('"text":"التاريخ\\nDate"'); // bilingual header gone
    expect(out).toContain('"text":"التاريخ"');             // header is exactly the Arabic primary
  });
  it('system_only → the "Date" column header is primary-only (no English half)', () => {
    expect(renderWithHistory({ mode: 'system_only' })).not.toContain('"text":"التاريخ\\nDate"');
  });
  it('custom { paymentHistory: false } → the section TITLE stays bilingual', () => {
    expect(renderWithHistory({ mode: 'custom', groups: { paymentHistory: false } })).toContain('"text":"سجل الدفعات\\nPayment History"');
  });
});

import { describe, it, expect } from 'vitest';
import type { Content, TableCell } from 'pdfmake/interfaces';
import { renderTaxSummary } from './taxSummary';
import { renderTotals } from './totals';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../../templateConfig';
import type { EngineContext, EngineDocData } from '../types';
import type { TranslationContext } from '../../types';

// Regression lock for QA TBL-03 / TBL-04: the tax-summary and totals blocks
// hardcoded left/right alignment and never consulted engineLayoutDirection,
// while every sibling table mirrored. On an Arabic invoice the statutory VAT
// breakdown and the grand-total block — the two most consequential blocks on
// the page — read left-to-right inside a right-to-left document.

const CTX: TranslationContext = {
  t: (_k: string, en: string) => en,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

const engineFor = (mode: 'en' | 'ar'): EngineContext =>
  ({
    config: {
      ...BUILT_IN_TEMPLATE_CONFIGS.invoice,
      language: mode === 'ar' ? { mode: 'ar', secondary: 'ar' } : { mode: 'en' },
    },
    ctx: CTX,
  }) as unknown as EngineContext;

const DATA = {
  taxSummary: {
    title: { en: 'Tax Summary', ar: 'ملخص الضريبة' },
    columns: {
      rate: { en: 'Rate', ar: 'النسبة' },
      taxable: { en: 'Taxable', ar: 'الخاضع' },
      tax: { en: 'Tax', ar: 'الضريبة' },
    },
    rows: [{ rate: '5%', taxable: '100.000', tax: '5.000' }],
    total: { label: { en: 'Total', ar: 'الإجمالي' }, taxable: '100.000', tax: '5.000' },
  },
  totals: [
    { key: 'subtotal', label: { en: 'Subtotal', ar: 'المجموع' }, value: '100.000' },
    { key: 'total', label: { en: 'Total', ar: 'الإجمالي' }, value: '105.000', emphasis: true },
  ],
} as unknown as EngineDocData;

/** pdfmake table body out of a section result, whatever wrapper it uses. */
const bodyOf = (node: Content | null): TableCell[][] => {
  const n = node as unknown as Record<string, unknown>;
  if (n.table) return (n.table as { body: TableCell[][] }).body;
  const stack = n.stack as Record<string, unknown>[];
  const withTable = stack.find((s) => s.table) as { table: { body: TableCell[][] } };
  return withTable.table.body;
};

const alignments = (row: TableCell[]): (string | undefined)[] =>
  row.map((c) => (c as { alignment?: string }).alignment);

const texts = (row: TableCell[]): unknown[] => row.map((c) => (c as { text?: unknown }).text);

describe('tax summary RTL mirroring (TBL-03)', () => {
  it('keeps LTR order and alignment for an English document (parity)', () => {
    const body = bodyOf(renderTaxSummary(engineFor('en'), DATA));
    expect(alignments(body[0])).toEqual(['left', 'right', 'right']);
    expect(texts(body[1])).toEqual(['5%', '100.000', '5.000']);
  });

  it('reverses columns and mirrors alignment under RTL', () => {
    const body = bodyOf(renderTaxSummary(engineFor('ar'), DATA));
    // left→right, right→left, and the column order flips.
    expect(alignments(body[0])).toEqual(['left', 'left', 'right']);
    expect(texts(body[1])).toEqual(['5.000', '100.000', '5%']);
  });

  it('mirrors the totals row too, not just the data rows', () => {
    const body = bodyOf(renderTaxSummary(engineFor('ar'), DATA));
    const totalRow = body[body.length - 1];
    // The label moves to the last (rightmost) slot under RTL — and resolves to
    // the Arabic label, since an Arabic-lead document takes the `ar` side.
    expect((totalRow[totalRow.length - 1] as { text?: unknown }).text).toBe('الإجمالي');
    expect((totalRow[0] as { text?: unknown }).text).toBe('5.000');
  });
});

describe('totals block RTL mirroring (TBL-04)', () => {
  it('keeps the right-aligned, right-indented block for English (parity)', () => {
    const node = renderTotals(engineFor('en'), DATA) as unknown as Record<string, unknown>;
    expect(alignments(bodyOf(node as unknown as Content)[0])).toEqual(['right', 'right']);
    // Pushed to the right of the page by a large LEFT margin.
    expect(node.margin).toEqual([280, 8, 0, 8]);
    expect((node.table as { widths: unknown[] }).widths).toEqual(['*', 'auto']);
  });

  it('mirrors column order and the block indent under RTL', () => {
    const node = renderTotals(engineFor('ar'), DATA) as unknown as Record<string, unknown>;
    const body = bodyOf(node as unknown as Content);
    // Cell alignment stays RIGHT by design — currency figures keep numeric
    // alignment in both directions (pinned by rtl.test.ts). The MIRRORING is the
    // column order + block indent, not the in-cell text alignment.
    expect(alignments(body[0])).toEqual(['right', 'right']);
    // Value column leads under RTL, so widths flip with it.
    expect((node.table as { widths: unknown[] }).widths).toEqual(['auto', '*']);
    // The 280pt indent moves to the RIGHT so the block sits on the left edge.
    expect(node.margin).toEqual([0, 8, 280, 8]);
  });

  it('puts the value before the label under RTL', () => {
    const body = bodyOf(renderTotals(engineFor('ar'), DATA) as unknown as Content);
    expect((body[0][0] as { text?: unknown }).text).toBe('100.000');
  });
});

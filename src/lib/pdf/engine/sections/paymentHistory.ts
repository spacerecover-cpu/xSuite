/**
 * Payment-history section — a statement-style table of recorded payments:
 * date / document / method / reference / recorded-by / amount / running-balance.
 *
 * Generalized from `documents/InvoiceDocument.ts`'s `paymentHistorySection`
 * (lines ~321-368). The ADAPTER owns the decision to populate this (non-proforma
 * invoices with recorded payments) and pre-formats every cell — currency, dates,
 * fallbacks. This renderer only lays out the header + body, so it returns `null`
 * whenever there are no rows (proforma, or no payments yet).
 */

import type { Content, TableCell, Size } from 'pdfmake/interfaces';
import { PDF_COLORS } from '../../styles';
import { resolveLabel, fieldLabelLanguage } from '../labels';
import { engineLayoutDirection, mirrorAlign } from '../rtl';
import type {
  EngineContext,
  EngineDocData,
  LabelText,
  PaymentHistoryRow,
  SectionRenderer,
} from '../types';

/**
 * One payment-history column described as DATA: its header label, the row field
 * it reads, its width, and its base (LTR) alignment. Building the table from
 * this list — instead of seven hardcoded cells — lets the RTL path reverse the
 * column order and swap left/right alignments with the same `engine/rtl` helpers
 * the line-item table uses.
 */
interface HistoryColumn {
  label: LabelText;
  field: keyof PaymentHistoryRow;
  width: Size;
  align: 'left' | 'right';
  /** Value cell color (amount is success-green, balance bold default). */
  valueColor: string;
  valueBold?: boolean;
}

export const renderPaymentHistory: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const history = data.paymentHistory;
  if (!history || history.rows.length === 0) return null;

  const { language } = engine.config;
  const labelLang = fieldLabelLanguage(language, engine.config.translationPolicy, 'paymentHistory');
  const direction = engineLayoutDirection(language);
  const { columns } = history;

  // Column order matches the legacy statement layout (date → … → balance). Only
  // the description column star-sizes; the rest auto-size.
  const baseColumns: HistoryColumn[] = [
    { label: columns.date, field: 'date', width: 'auto', align: 'left', valueColor: PDF_COLORS.text },
    { label: columns.document, field: 'document', width: 'auto', align: 'left', valueColor: PDF_COLORS.text },
    { label: columns.method, field: 'method', width: 'auto', align: 'left', valueColor: PDF_COLORS.text },
    { label: columns.reference, field: 'reference', width: '*', align: 'left', valueColor: PDF_COLORS.text },
    { label: columns.recordedBy, field: 'recordedBy', width: 'auto', align: 'left', valueColor: PDF_COLORS.text },
    { label: columns.amount, field: 'amount', width: 'auto', align: 'right', valueColor: PDF_COLORS.success },
    { label: columns.balance, field: 'runningBalance', width: 'auto', align: 'right', valueColor: PDF_COLORS.text, valueBold: true },
  ];

  // Under RTL, reverse the columns and swap each cell's left/right alignment so
  // the statement reads right-to-left. LTR keeps the array as-is (legacy order).
  const ordered =
    direction === 'rtl'
      ? [...baseColumns].reverse().map((c) => ({ ...c, align: mirrorAlign(c.align) as 'left' | 'right' }))
      : baseColumns;

  const headerRow: TableCell[] = ordered.map((c) => ({
    text: resolveLabel(c.label, labelLang),
    fontSize: 8,
    bold: true,
    color: PDF_COLORS.textLight,
    alignment: c.align,
  }));

  const body: TableCell[][] = [headerRow];
  for (const r of history.rows) {
    body.push(
      ordered.map((c) => ({
        text: r[c.field],
        fontSize: 8,
        color: c.valueColor,
        alignment: c.align,
        ...(c.valueBold ? { bold: true } : {}),
      })),
    );
  }

  const widths: Size[] = ordered.map((c) => c.width);

  return {
    margin: [0, 10, 0, 0],
    stack: [
      {
        text: resolveLabel(history.title, language),
        fontSize: 10,
        bold: true,
        color: PDF_COLORS.text,
        margin: [0, 0, 0, 4],
      },
      {
        table: {
          headerRows: 1,
          widths,
          body,
        },
        layout: {
          fillColor: (rowIndex: number) => (rowIndex === 0 ? PDF_COLORS.background : null),
          hLineWidth: () => 0.5,
          vLineWidth: () => 0,
          hLineColor: () => PDF_COLORS.border,
        },
      },
    ],
  };
};

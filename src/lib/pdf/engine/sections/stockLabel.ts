/**
 * Stock-label section — the compact, print-friendly body for a physical stock
 * label: a company/category caption row, the item name (large + bold), an
 * optional brand line, a divider, then a short detail list (SKU / barcode /
 * price / location). Sized for the small CUSTOM label page (the `stock_label`
 * default uses `paper.size: 'custom'`, dimensions `[283, 170]`pt).
 *
 * Generalized from `buildSingleLabel` in `documents/StockLabelDocument.ts`
 * (lines ~15-125). Like the case-label section it is a self-contained document
 * body, not a table: every value is pre-formatted by the adapter and optional
 * fields are omitted to hide their row (matching the legacy conditional pushes).
 * Barcode/SKU values are pinned to the monospace `Roboto` font as in the legacy
 * builder. Returns null when there is no item name.
 */

import type { Content } from 'pdfmake/interfaces';
import { PDF_COLORS } from '../../styles';
import { safeString } from '../../utils';
import { resolveLabel } from '../labels';
import type { EngineContext, EngineDocData, LabelText, SectionRenderer } from '../types';

/** A single "Label: value" detail row; `mono` pins the value to Roboto. */
function detailRow(
  labelText: string,
  value: string,
  opts?: { mono?: boolean; emphasizeValue?: boolean },
): Content {
  return {
    columns: [
      { text: labelText, fontSize: 7, color: PDF_COLORS.textMuted, width: 48 },
      {
        text: value,
        fontSize: opts?.emphasizeValue ? 10 : 8,
        bold: true,
        color: opts?.emphasizeValue ? PDF_COLORS.primary : PDF_COLORS.text,
        width: '*',
        ...(opts?.mono ? { font: 'Roboto' } : {}),
      },
    ],
    margin: [0, 0, 0, 2],
  };
}

export const renderStockLabel: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const label = data.stockLabel;
  if (!label || !safeString(label.name)) return null;

  const { language } = engine.config;
  const labels = label.labels ?? {};
  const resolve = (l: LabelText | undefined, fallback: string): string =>
    l ? resolveLabel(l, language) : fallback;

  const stack: Content[] = [];

  // Top caption row: company name (left) + category (right).
  stack.push({
    columns: [
      { text: safeString(label.companyName) || 'Stock Label', fontSize: 7, color: PDF_COLORS.textMuted, width: '*' },
      label.category
        ? { text: label.category, fontSize: 7, color: PDF_COLORS.primary, alignment: 'right', width: 'auto' }
        : { text: '', width: 'auto' },
    ],
    margin: [0, 0, 0, 4],
  });

  // Item name — the label's focal point.
  stack.push({
    text: safeString(label.name),
    fontSize: 11,
    bold: true,
    color: PDF_COLORS.text,
    margin: [0, 0, 0, 2],
  });

  // Optional brand line.
  if (label.brand) {
    stack.push({ text: label.brand, fontSize: 9, color: PDF_COLORS.textLight, margin: [0, 0, 0, 4] });
  }

  // Divider before the detail list.
  stack.push({
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.5, lineColor: PDF_COLORS.border }],
    margin: [0, 2, 0, 4],
  });

  // Detail rows — each rendered only when its value is present.
  if (label.sku) stack.push(detailRow(resolve(labels.sku, 'SKU'), label.sku, { mono: true }));
  if (label.barcode) stack.push(detailRow(resolve(labels.barcode, 'Barcode'), label.barcode, { mono: true }));
  if (label.price) stack.push(detailRow(resolve(labels.price, 'Price'), label.price, { emphasizeValue: true }));
  if (label.location) stack.push(detailRow(resolve(labels.location, 'Location'), label.location));

  return { stack };
};

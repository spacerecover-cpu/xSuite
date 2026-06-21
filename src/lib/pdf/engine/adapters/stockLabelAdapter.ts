/**
 * Stock-label adapter — maps a {@link StockLabelData} (a stock item plus the
 * label print options) into the document-agnostic {@link EngineDocData} for the
 * physical `stock_label` document: the small print-friendly sticker for a stock
 * item. Mirrors `documents/StockLabelDocument.ts`'s `buildSingleLabel`
 * (lines ~15-125).
 *
 * A stock label is a self-contained body (no party blocks, no money totals, no
 * device table): a company/category caption, the item name (focal), an optional
 * brand line, then a short detail list (SKU / barcode / price / location). The
 * adapter owns ALL domain knowledge: the `showPrice` gate on the price row, the
 * `toLocaleString` 2-dp price formatting (no currency symbol — parity with the
 * legacy builder), and the `companyName ?? 'Stock Label'` caption fallback. The
 * section renderer stays dumb (it only omits a row when its value is absent).
 *
 * NOTE on `showBarcode`: the LEGACY `buildSingleLabel` ALWAYS renders the SKU and
 * barcode rows whenever the item carries them — it never reads the `showBarcode`
 * flag (only `showPrice` gates a row). To preserve content parity with the
 * reference builder, this adapter mirrors that exactly: SKU/barcode are shown
 * whenever present, NOT gated on `showBarcode`. The `showBarcode` option is thus
 * inert in BOTH paths — a pre-existing legacy quirk, intentionally left as-is so
 * the engine output matches the legacy default rather than silently changing it.
 *
 * NOTE on the `copies` option: the LEGACY builder repeats the single-label body
 * N times on one custom sheet (with a dashed divider between copies). The engine
 * renders ONE label body per document — copies are a print-loop concern, not a
 * document-body concern — so this adapter intentionally ignores `copies`. The
 * call site is responsible for invoking the engine once per copy if it wants the
 * multi-copy sheet. See the `stock_label` caveat in the wiring notes.
 */

import type { DocumentTemplateConfig } from '../../templateConfig';
import { safeString } from '../../utils';
import type { StockLabelData } from '../../documents/StockLabelDocument';
import type { EngineDocData, LabelText, StockLabelBlock } from '../types';

/** Bilingual detail-row labels (parity with the legacy hardcoded EN labels). */
const DETAIL_LABELS: NonNullable<StockLabelBlock['labels']> = {
  sku: { en: 'SKU', ar: 'رمز' },
  barcode: { en: 'Barcode', ar: 'الباركود' },
  price: { en: 'Price', ar: 'السعر' },
  location: { en: 'Location', ar: 'الموقع' },
};

/**
 * Format the selling price exactly like the legacy builder: a plain 2-dp number
 * via `toLocaleString` with NO currency symbol (the label is a sticker, not an
 * invoice). Returns undefined when no price should be shown.
 */
function formatPrice(value: number | null | undefined): string | undefined {
  if (value == null) return undefined;
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function toEngineData(
  data: StockLabelData,
  _config: DocumentTemplateConfig,
): EngineDocData {
  const { item, locationName, companyName, showPrice } = data;

  // ---- Title ---------------------------------------------------------------
  const documentTitle: LabelText = { en: 'STOCK LABEL', ar: 'ملصق المخزون' };

  // ---- Stock-label body block ----------------------------------------------
  // SKU + barcode render whenever present (the legacy builder never gates them on
  // `showBarcode` — see the header note); price is gated on `showPrice`. Optional
  // fields are simply omitted so the renderer drops their row (parity with the
  // legacy conditional pushes).
  const stockLabel: StockLabelBlock = {
    name: safeString(item.name),
    ...(item.stock_categories?.name ? { category: item.stock_categories.name } : {}),
    ...(item.brand ? { brand: item.brand } : {}),
    ...(item.sku ? { sku: item.sku } : {}),
    ...(item.barcode ? { barcode: item.barcode } : {}),
    ...(showPrice && formatPrice(item.selling_price) ? { price: formatPrice(item.selling_price) } : {}),
    ...(locationName ? { location: locationName } : {}),
    companyName: companyName ?? 'Stock Label',
    labels: DETAIL_LABELS,
  };

  return {
    documentTitle,
    identity: {}, // a stock label renders no company-identity header by default
    parties: {},
    meta: [],
    stockLabel,
    // A stock label carries no money, no party blocks, no device table.
    totals: undefined,
    paymentHistory: null,
    terms: null,
    bank: null,
    qrCaption: null,
  };
}

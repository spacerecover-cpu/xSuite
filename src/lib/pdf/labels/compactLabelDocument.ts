/**
 * Compact adhesive-label builder — the shared pdfmake renderer behind the
 * Case / Stock / Inventory device labels.
 *
 * Design constraints (why this file does NOT reuse PDF_COLORS/styles.ts):
 *  - Direct-thermal label printers are 1-bit devices: anything that isn't pure
 *    black dithers and blurs at 203dpi, so every mark here is #000000 on white.
 *  - The page IS the label (mm → pt exact), so the driver prints at 100% scale.
 *  - The identifier is the hero: it gets the largest type the column allows
 *    (fitFontSize), everything else yields space to it.
 *
 * Three layout classes, chosen from the physical geometry (labelSizes.sizeClass):
 *  - strip  (h ≤ 17mm)  : QR square left, identifier + ≤2 meta lines right
 *  - square (~1:1 stock): QR on top, identifier + 1 meta line beneath
 *  - card   (the rest)  : QR left column, identifier / rule / title / ≤4 lines /
 *                         footer right; wide stock (≥50×25mm) appends a Code128
 *                         strip across the bottom.
 */

import type { Content, ContentImage, ContentText, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { LabelSizePreset } from './labelSizes';
import { labelMarginPt, mmToPt, sizeClass, supportsBarcode } from './labelSizes';

export interface CompactLabelContent {
  /** Primary identifier (CASE-0042 / INV-00013 / STK-0005) — always rendered, dominant. */
  id: string;
  /** Pre-resolved QR PNG data URL (payload = the entity identifier). */
  qrDataUrl?: string | null;
  /** Pre-resolved Code128 PNG data URL — rendered only on wide stock. */
  barcodeDataUrl?: string | null;
  /** Main descriptive line: customer name / item name. */
  title?: string | null;
  /** Meta lines in priority order (serial, device, date…) — truncated to fit. */
  lines?: string[];
  /** Tiny trailing line, e.g. the lab name. */
  footer?: string | null;
  /** Device position on multi-device cases, e.g. "2/12". */
  index?: string | null;
}

const INK = '#000000';
const LINE_HEIGHT = 1.08;
/** pdfmake's rendered line box ≈ fontSize × fontLineHeight(≈1.17) × lineHeight,
 *  padded — every layout budgets heights with this so a label NEVER overflows
 *  its page (overflow silently spills onto a second physical label). */
const LINE_FACTOR = 1.35;
const lineBoxPt = (fontSize: number) => fontSize * LINE_FACTOR;

/**
 * Largest font size (in 0.5pt steps) at which `text` fits `maxWidthPt` on one
 * line, clamped to [minPt, basePt]. Uses a bold-sans average glyph width of
 * 0.6em — intentionally conservative so identifiers never clip.
 */
export function fitFontSize(text: string, maxWidthPt: number, basePt: number, minPt: number): number {
  const CHAR_EM = 0.6;
  const fitting = maxWidthPt / (Math.max(text.length, 1) * CHAR_EM);
  return Math.max(minPt, Math.min(basePt, Math.floor(fitting * 2) / 2));
}

/** Truncate with an ellipsis so a line never wraps (wraps overflow tiny pages).
 *  Default 0.62em average glyph width — label meta is caps/digit-heavy (serials,
 *  SKUs). The identifier passes `em = 0.6` to match {@link fitFontSize}, so a
 *  value the size-fitter already accepted is never spuriously truncated. */
function truncate(text: string, maxWidthPt: number, fontSize: number, em = 0.62): string {
  const maxChars = Math.floor(maxWidthPt / (fontSize * em));
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

/** The size the identifier actually renders at — the index chip reserves width first. */
function idRowSize(label: CompactLabelContent, maxWidthPt: number, basePt: number, minPt: number): number {
  const indexText = label.index ? ` ${label.index}` : '';
  const indexSize = Math.max(minPt, basePt * 0.5);
  const indexWidth = indexText.length * indexSize * 0.6;
  return fitFontSize(label.id, maxWidthPt - indexWidth, basePt, minPt);
}

function idRow(
  label: CompactLabelContent,
  maxWidthPt: number,
  basePt: number,
  minPt: number,
  /** Explicit rendered size (e.g. capped by an available height budget). */
  sizeOverride?: number,
): ContentText {
  const indexText = label.index ? ` ${label.index}` : '';
  const indexSize = Math.max(minPt, basePt * 0.5);
  const size = sizeOverride ?? idRowSize(label, maxWidthPt, basePt, minPt);
  // The identifier is the ONLY text that must never wrap: every builder budgets
  // it as exactly one line (the QR-height reservation, the square QR sizing, the
  // card `consumed` count). fitFontSize floors at minPt, so a value longer than
  // the column at minPt — e.g. a stock item with no SKU whose id falls back to a
  // 45-char free-text name — would otherwise wrap to 2-3 lines and spill onto a
  // second physical label (pushing the QR off). Truncate to the width budget at
  // the chosen size (index chip reserved first) and hard-set noWrap.
  const indexWidth = indexText.length * indexSize * 0.6;
  const idText = truncate(label.id, maxWidthPt - indexWidth, size, 0.6);
  const spans: Content[] = [{ text: idText, bold: true, fontSize: size, color: INK }];
  if (indexText) spans.push({ text: indexText, fontSize: indexSize, color: INK });
  return { text: spans, noWrap: true, lineHeight: LINE_HEIGHT };
}

function metaLine(text: string, maxWidthPt: number, fontSize: number, bold = false): ContentText {
  return {
    text: truncate(text, maxWidthPt, fontSize),
    fontSize,
    bold,
    color: INK,
    lineHeight: LINE_HEIGHT,
  };
}

function qrNode(dataUrl: string, sidePt: number, centered = false): ContentImage {
  return { image: dataUrl, width: sidePt, height: sidePt, ...(centered ? { alignment: 'center' as const } : {}) };
}

function hairline(widthPt: number): Content {
  return {
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: widthPt, y2: 0, lineWidth: 0.6, lineColor: INK }],
    margin: [0, 1.5, 0, 1.5],
  };
}

/** Below this side length a printed QR drops under ~6.3mm and stops scanning reliably. */
const MIN_QR_SIDE_PT = 18;

/**
 * Strips are too short for a title block: the mapper encodes priority in
 * `lines`, and only the first two fit.
 *
 * Two variants by available width: wide strips (40×12) put a full-height QR
 * beside the text; narrow strips (26×15, 25×13) would starve the identifier
 * that way, so the identifier spans the full width on top and the QR drops
 * into the bottom row — omitted entirely if it would print too small to scan.
 */
function buildStrip(label: CompactLabelContent, contentW: number, contentH: number): Content {
  const gap = 3;
  const metaSize = 5;

  const sideBySideTextW = contentW - contentH - gap;
  if (label.qrDataUrl && sideBySideTextW >= 45) {
    const qrSide = contentH;
    const idSize = idRowSize(label, sideBySideTextW, 10, 5.5);
    const textStack: Content[] = [idRow(label, sideBySideTextW, 10, 5.5)];
    let remaining = contentH - lineBoxPt(idSize);
    for (const line of (label.lines ?? []).slice(0, 2)) {
      if (remaining < lineBoxPt(metaSize)) break;
      textStack.push(metaLine(line, sideBySideTextW, metaSize));
      remaining -= lineBoxPt(metaSize);
    }
    return {
      columns: [
        { width: qrSide, stack: [qrNode(label.qrDataUrl, qrSide)] },
        { width: '*', stack: textStack },
      ],
      columnGap: gap,
    };
  }

  // A scannable QR is the label's entire purpose, so when the stock is tall
  // enough to seat BOTH a scannable QR and a legible identifier, reserve the
  // QR's height FIRST and size the id to what remains. Previously the id took
  // its natural (width-fit) size and the QR got only the leftover height — a
  // short, index-less id (STK-0005, INV-00013) rendered large and squeezed the
  // QR off the label, leaving stock/inventory labels un-scannable while
  // multi-device case labels (whose index chip shrinks the id) kept theirs.
  // Too-short stock (25×13) still can't fit both, so it keeps the legible id
  // and omits the QR, exactly as before.
  const gapV = 2;
  const canFitQr = !!label.qrDataUrl && contentH >= MIN_QR_SIDE_PT + lineBoxPt(7) + gapV;
  const qrSide = canFitQr
    ? Math.max(MIN_QR_SIDE_PT, Math.min(contentH * 0.55, contentH - lineBoxPt(7) - gapV))
    : 0;
  const topH = qrSide ? contentH - qrSide - gapV : contentH;
  const widthFit = idRowSize(label, contentW, 11, 5.5);
  const idSize = qrSide
    ? Math.max(5.5, Math.min(widthFit, Math.floor((topH / LINE_FACTOR) * 2) / 2))
    : widthFit;

  const stack: Content[] = [idRow(label, contentW, 11, 5.5, idSize)];
  const metaW = qrSide ? contentW - qrSide - gap : contentW;
  const metaBudgetH = qrSide ? qrSide : contentH - lineBoxPt(idSize) - 2;
  const maxMetaLines = Math.min(2, Math.max(0, Math.floor(metaBudgetH / lineBoxPt(metaSize))));
  const metaStack = (label.lines ?? [])
    .slice(0, maxMetaLines)
    .map((line) => metaLine(line, metaW, metaSize));

  if (qrSide && label.qrDataUrl) {
    stack.push({
      columns: [
        { width: qrSide, stack: [qrNode(label.qrDataUrl, qrSide)] },
        { width: '*', stack: metaStack, margin: [0, 1, 0, 0] },
      ],
      columnGap: gap,
      margin: [0, 1, 0, 0],
    });
  } else {
    stack.push(...metaStack);
  }
  return { stack };
}

function buildSquare(label: CompactLabelContent, contentW: number, contentH: number): Content {
  // Show the discriminating meta, not just the title: on a case label `title`
  // is the customer (always present) while `lines[0]` is the device serial — so
  // keying only off `title` silently dropped the serial from every square case
  // label. Render the title AND the first meta line (typically the serial),
  // each only while the height budget allows, so the device data survives.
  const idSize = fitFontSize(label.id, contentW, 9, 5);
  const metaSize = 5;
  const metaCandidates = [label.title, label.lines?.[0]].filter(
    (m): m is string => !!m && m.trim().length > 0,
  );
  const stack: Content[] = [];
  if (label.qrDataUrl) {
    const qrSide = Math.min(
      contentW,
      contentH - lineBoxPt(idSize) - metaCandidates.length * lineBoxPt(metaSize) - 4,
    );
    if (qrSide >= MIN_QR_SIDE_PT) {
      stack.push({ ...qrNode(label.qrDataUrl, qrSide, true), margin: [0, 0, 0, 2] });
    }
  }
  stack.push({ ...idRow(label, contentW, 9, 5), alignment: 'center' });
  // Budget the remaining height for meta lines so a second line never overflows.
  const usedH = stack.reduce((h, n) => {
    const img = n as { height?: number };
    return h + (typeof img.height === 'number' ? img.height + 2 : lineBoxPt(idSize));
  }, 0);
  let remaining = contentH - usedH;
  for (const meta of metaCandidates) {
    if (remaining < lineBoxPt(metaSize)) break;
    stack.push({ ...metaLine(meta, contentW, metaSize), alignment: 'center' });
    remaining -= lineBoxPt(metaSize);
  }
  return { stack };
}

function buildCard(label: CompactLabelContent, size: LabelSizePreset, contentW: number, contentH: number): Content {
  const barcode = supportsBarcode(size) && label.barcodeDataUrl ? label.barcodeDataUrl : null;
  const barcodeH = barcode ? mmToPt(6) + 2 : 0;
  const textZoneH = contentH - barcodeH;

  const gap = 4;
  // Cap the QR at 35% of the width so small card stock (30×20) keeps enough
  // column for a readable identifier; below scannable size, drop it entirely.
  let qrSide = label.qrDataUrl ? Math.min(textZoneH, mmToPt(14), contentW * 0.35) : 0;
  if (qrSide < MIN_QR_SIDE_PT) qrSide = 0;
  const textW = contentW - (qrSide ? qrSide + gap : 0);

  const idBase = 12;
  const idSize = fitFontSize(label.id, textW, idBase, 5.5);
  const ruleH = 5;
  const textStack: Content[] = [idRow(label, textW, idBase, 5.5), hairline(textW)];

  let consumed = lineBoxPt(idSize) + ruleH;
  if (label.title) {
    textStack.push(metaLine(label.title, textW, 6.5, true));
    consumed += lineBoxPt(6.5);
  }
  const perLine = lineBoxPt(5.5);
  let footer = label.footer ?? null;
  let footerH = footer ? lineBoxPt(4.5) + 1.5 : 0;
  let lineBudget = Math.min(4, Math.max(0, Math.floor((textZoneH - consumed - footerH - 1) / perLine)));
  // Data outranks branding: when nothing else fits, the footer yields its slot
  // to the first meta line (serial numbers matter more than the lab name).
  if (lineBudget === 0 && footer && (label.lines?.length ?? 0) > 0) {
    footer = null;
    footerH = 0;
    lineBudget = Math.min(4, Math.max(0, Math.floor((textZoneH - consumed - 1) / perLine)));
  }
  for (const line of (label.lines ?? []).slice(0, lineBudget)) {
    textStack.push(metaLine(line, textW, 5.5));
  }
  if (footer) {
    textStack.push({ ...metaLine(footer, textW, 4.5), margin: [0, 1.5, 0, 0] });
  }

  const body: Content =
    qrSide && label.qrDataUrl
      ? {
          columns: [
            { width: qrSide, stack: [qrNode(label.qrDataUrl, qrSide)] },
            { width: '*', stack: textStack },
          ],
          columnGap: gap,
        }
      : { stack: textStack };

  if (!barcode) return { stack: [body] };
  return {
    stack: [body, { image: barcode, width: contentW, height: mmToPt(6), margin: [0, 2, 0, 0] }],
  };
}

export function buildCompactLabelDocument(
  labels: CompactLabelContent[],
  size: LabelSizePreset,
  fontFamily = 'Roboto',
): TDocumentDefinitions {
  const margin = labelMarginPt(size);
  const pageW = mmToPt(size.widthMm);
  const pageH = mmToPt(size.heightMm);
  const contentW = pageW - margin * 2;
  const contentH = pageH - margin * 2;
  const cls = sizeClass(size);

  const pages: Content[] = labels.map((label, i) => {
    const body =
      cls === 'strip'
        ? buildStrip(label, contentW, contentH)
        : cls === 'square'
          ? buildSquare(label, contentW, contentH)
          : buildCard(label, size, contentW, contentH);
    return i === 0 ? { stack: [body] } : { stack: [body], pageBreak: 'before' };
  });

  return {
    pageSize: { width: pageW, height: pageH },
    pageMargins: [margin, margin, margin, margin],
    defaultStyle: { font: fontFamily, fontSize: 5.5, color: INK },
    content: pages,
    info: { title: 'Labels' },
  };
}

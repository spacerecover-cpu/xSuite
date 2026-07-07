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

/** Truncate with an ellipsis so a line never wraps (wraps overflow tiny pages). */
function truncate(text: string, maxWidthPt: number, fontSize: number): string {
  const maxChars = Math.floor(maxWidthPt / (fontSize * 0.55));
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

function idRow(label: CompactLabelContent, maxWidthPt: number, basePt: number, minPt: number): ContentText {
  const indexText = label.index ? ` ${label.index}` : '';
  const indexSize = Math.max(minPt, basePt * 0.5);
  const indexWidth = indexText.length * indexSize * 0.6;
  const size = fitFontSize(label.id, maxWidthPt - indexWidth, basePt, minPt);
  const spans: Content[] = [{ text: label.id, bold: true, fontSize: size, color: INK }];
  if (indexText) spans.push({ text: indexText, fontSize: indexSize, color: INK });
  return { text: spans, lineHeight: LINE_HEIGHT };
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

function buildStrip(label: CompactLabelContent, contentW: number, contentH: number): Content {
  const qrSide = contentH;
  const gap = 3;
  const textW = label.qrDataUrl ? contentW - qrSide - gap : contentW;

  // Strips are too short for a title block: the mapper encodes priority in
  // `lines`, and only the first two fit.
  const textStack: Content[] = [idRow(label, textW, 10, 5.5)];
  for (const line of (label.lines ?? []).slice(0, 2)) {
    textStack.push(metaLine(line, textW, 5));
  }

  if (!label.qrDataUrl) return { stack: textStack };
  return {
    columns: [
      { width: qrSide, stack: [qrNode(label.qrDataUrl, qrSide)] },
      { width: '*', stack: textStack },
    ],
    columnGap: gap,
  };
}

function buildSquare(label: CompactLabelContent, contentW: number, contentH: number): Content {
  const stack: Content[] = [];
  if (label.qrDataUrl) {
    const qrSide = Math.min(contentW, contentH - 16);
    stack.push({ ...qrNode(label.qrDataUrl, qrSide, true), margin: [0, 0, 0, 2] });
  }
  stack.push({ ...idRow(label, contentW, 9, 5), alignment: 'center' });
  const meta = label.title ?? label.lines?.[0];
  if (meta) stack.push({ ...metaLine(meta, contentW, 5), alignment: 'center' });
  return { stack };
}

function buildCard(label: CompactLabelContent, size: LabelSizePreset, contentW: number, contentH: number): Content {
  const barcode = supportsBarcode(size) && label.barcodeDataUrl ? label.barcodeDataUrl : null;
  const barcodeH = barcode ? mmToPt(6) + 2 : 0;
  const textZoneH = contentH - barcodeH;

  const gap = 4;
  const qrSide = label.qrDataUrl ? Math.min(textZoneH, mmToPt(14)) : 0;
  const textW = contentW - (qrSide ? qrSide + gap : 0);

  const idBase = 12;
  const idSize = fitFontSize(label.id, textW, idBase, 5.5);
  const textStack: Content[] = [idRow(label, textW, idBase, 5.5), hairline(textW)];

  let consumed = idSize * 1.3 + 4;
  if (label.title) {
    textStack.push(metaLine(label.title, textW, 6.5, true));
    consumed += 6.5 * 1.25;
  }
  const footerH = label.footer ? 4.5 * 1.5 : 0;
  const perLine = 5.5 * 1.15;
  const lineBudget = Math.min(4, Math.max(0, Math.floor((textZoneH - consumed - footerH) / perLine)));
  for (const line of (label.lines ?? []).slice(0, lineBudget)) {
    textStack.push(metaLine(line, textW, 5.5));
  }
  if (label.footer) {
    textStack.push({ ...metaLine(label.footer, textW, 4.5), margin: [0, 1.5, 0, 0] });
  }

  const body: Content = label.qrDataUrl
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

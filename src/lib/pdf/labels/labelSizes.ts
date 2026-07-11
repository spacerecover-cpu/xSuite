/**
 * Industry-standard adhesive-label size presets for device labelling.
 *
 * Sizes are the PRINTED footprint (width × height in mm as the label reads when
 * stuck on a drive) — e.g. Niimbot's "15×26" roll (15mm tape) prints a 26mm-wide,
 * 15mm-tall landscape label. The registry covers the small-format stock used by
 * the thermal printers common in data-recovery labs: Niimbot D/B series, Dymo
 * LabelWriter, Brother QL (DK rolls) and generic Zebra asset-tag stock.
 *
 * The pdfmake page is sized to the label exactly (mm → pt), so the printer
 * driver prints at 100% with no scaling or cropping.
 */

export interface LabelSizePreset {
  id: string;
  /** Display name, e.g. "26 × 15 mm" */
  name: string;
  /** Printer/stock hint, e.g. "Niimbot D11/D110 (15×26 roll)" */
  printers: string;
  /** Printed label width in mm */
  widthMm: number;
  /** Printed label height in mm */
  heightMm: number;
}

export type LabelSizeClass = 'strip' | 'square' | 'card';

export const LABEL_SIZE_PRESETS: readonly LabelSizePreset[] = [
  { id: 'nb_15x26', name: '26 × 15 mm', printers: 'Niimbot D11/D110 (15×26 roll)', widthMm: 26, heightMm: 15 },
  { id: 'nb_12x40', name: '40 × 12 mm', printers: 'Niimbot D11 (12×40 roll)', widthMm: 40, heightMm: 12 },
  { id: 'dymo_30333', name: '25 × 13 mm', printers: 'Dymo 30333 (½″ × 1″)', widthMm: 25, heightMm: 13 },
  { id: 'nb_30x20', name: '30 × 20 mm', printers: 'Niimbot B21/B1 (30×20 roll)', widthMm: 30, heightMm: 20 },
  { id: 'sq_25', name: '25 × 25 mm', printers: '1″ × 1″ square (Zebra/generic)', widthMm: 25, heightMm: 25 },
  { id: 'nb_40x30', name: '40 × 30 mm', printers: 'Niimbot B1/B21 (40×30 roll)', widthMm: 40, heightMm: 30 },
  { id: 'zebra_2x1', name: '51 × 25 mm', printers: '2″ × 1″ asset tag (Zebra/generic)', widthMm: 51, heightMm: 25 },
  { id: 'dymo_30336', name: '54 × 25 mm', printers: 'Dymo 30336 (1″ × 2⅛″)', widthMm: 54, heightMm: 25 },
  { id: 'nb_50x30', name: '50 × 30 mm', printers: 'Niimbot B1 / Phomemo (50×30 roll)', widthMm: 50, heightMm: 30 },
  { id: 'zebra_225x125', name: '57 × 32 mm', printers: '2¼″ × 1¼″ (Zebra/generic)', widthMm: 57, heightMm: 32 },
  { id: 'brother_dk11209', name: '62 × 29 mm', printers: 'Brother DK-11209', widthMm: 62, heightMm: 29 },
  { id: 'dymo_30252', name: '89 × 28 mm', printers: 'Dymo 30252 address', widthMm: 89, heightMm: 28 },
  { id: 'brother_dk11201', name: '90 × 29 mm', printers: 'Brother DK-11201', widthMm: 90, heightMm: 29 },
];

export const DEFAULT_LABEL_SIZE_ID = 'nb_15x26';

export function getLabelSize(id: string | null | undefined): LabelSizePreset {
  return (
    LABEL_SIZE_PRESETS.find((p) => p.id === id) ??
    LABEL_SIZE_PRESETS.find((p) => p.id === DEFAULT_LABEL_SIZE_ID)!
  );
}

export function mmToPt(mm: number): number {
  return (mm * 72) / 25.4;
}

/**
 * Layout class: strip = too short for stacked layout (single row, QR left);
 * square = near-square stock (QR on top); card = QR left column + text block.
 */
export function sizeClass(p: LabelSizePreset): LabelSizeClass {
  if (p.heightMm <= 17) return 'strip';
  if (p.widthMm / p.heightMm < 1.2 && p.heightMm >= 20) return 'square';
  return 'card';
}

/** Code128 needs ~40mm of quiet-zone-safe width; only offer it on wide stock. */
export function supportsBarcode(p: LabelSizePreset): boolean {
  return p.widthMm >= 50 && p.heightMm >= 25;
}

/** Thermal printers have ~1mm unprintable edge; keep margins tight but safe. */
export function labelMarginPt(p: LabelSizePreset): number {
  return mmToPt(p.widthMm <= 30 ? 1.5 : 2);
}

/** UI grouping for size pickers (Label Studio + the print-time options dialog). */
export const LABEL_SIZE_GROUPS: readonly { cls: LabelSizeClass; label: string }[] = [
  { cls: 'strip', label: 'Strip — narrow rolls' },
  { cls: 'square', label: 'Square' },
  { cls: 'card', label: 'Card — wider stock' },
];

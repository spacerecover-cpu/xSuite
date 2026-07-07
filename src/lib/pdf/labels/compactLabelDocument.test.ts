import { describe, it, expect } from 'vitest';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { buildCompactLabelDocument, fitFontSize } from './compactLabelDocument';
import type { CompactLabelContent } from './compactLabelDocument';
import { getLabelSize, mmToPt } from './labelSizes';

const QR_PNG = 'data:image/png;base64,qr';
const BARCODE_PNG = 'data:image/png;base64,code128';

function label(overrides: Partial<CompactLabelContent> = {}): CompactLabelContent {
  return {
    id: 'CASE-0042',
    qrDataUrl: QR_PNG,
    title: 'Ahmed Al Mansoori',
    lines: ['SN WD-WX91A123', 'WD Blue 2TB', '07/07/2026'],
    footer: 'Space Data Recovery',
    index: '1/3',
    ...overrides,
  };
}

/** Depth-first walk over every node in a pdfmake doc definition. */
function walk(node: unknown, visit: (n: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit));
    return;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    visit(obj);
    for (const key of ['stack', 'columns', 'content', 'text']) {
      if (key in obj && typeof obj[key] === 'object') walk(obj[key], visit);
    }
  }
}

function collectImages(doc: TDocumentDefinitions): string[] {
  const images: string[] = [];
  walk(doc.content, (n) => {
    if (typeof n.image === 'string') images.push(n.image);
  });
  return images;
}

function collectTexts(doc: TDocumentDefinitions): Array<Record<string, unknown>> {
  const texts: Array<Record<string, unknown>> = [];
  walk(doc.content, (n) => {
    if (typeof n.text === 'string') texts.push(n);
  });
  return texts;
}

describe('buildCompactLabelDocument', () => {
  it('sizes the page exactly to the label stock in points', () => {
    const size = getLabelSize('nb_15x26');
    const doc = buildCompactLabelDocument([label()], size);
    const page = doc.pageSize as { width: number; height: number };
    expect(page.width).toBeCloseTo(mmToPt(26), 1);
    expect(page.height).toBeCloseTo(mmToPt(15), 1);
  });

  it('renders one page per label via pageBreak on subsequent labels', () => {
    const doc = buildCompactLabelDocument(
      [label({ index: '1/3' }), label({ index: '2/3' }), label({ index: '3/3' })],
      getLabelSize('nb_15x26'),
    );
    const pages = doc.content as Content[];
    expect(pages).toHaveLength(3);
    expect((pages[0] as unknown as Record<string, unknown>).pageBreak).toBeUndefined();
    expect((pages[1] as unknown as Record<string, unknown>).pageBreak).toBe('before');
    expect((pages[2] as unknown as Record<string, unknown>).pageBreak).toBe('before');
  });

  it('strip layout renders the QR image and the bold identifier', () => {
    const doc = buildCompactLabelDocument([label()], getLabelSize('nb_15x26'));
    expect(collectImages(doc)).toContain(QR_PNG);
    const idNode = collectTexts(doc).find((t) => t.text === 'CASE-0042');
    expect(idNode).toBeDefined();
    expect(idNode!.bold).toBe(true);
  });

  it('strip layout keeps at most two meta lines', () => {
    const doc = buildCompactLabelDocument(
      [label({ lines: ['one', 'two', 'three', 'four'] })],
      getLabelSize('nb_15x26'),
    );
    const rendered = collectTexts(doc).map((t) => t.text);
    expect(rendered).toContain('one');
    expect(rendered).toContain('two');
    expect(rendered).not.toContain('three');
    expect(rendered).not.toContain('four');
  });

  it('card layout keeps at most four meta lines and renders title + footer', () => {
    const doc = buildCompactLabelDocument(
      [label({ lines: ['one', 'two', 'three', 'four', 'five'] })],
      getLabelSize('zebra_225x125'),
    );
    const rendered = collectTexts(doc).map((t) => t.text);
    expect(rendered).toContain('Ahmed Al Mansoori');
    expect(rendered).toContain('Space Data Recovery');
    expect(rendered).toContain('four');
    expect(rendered).not.toContain('five');
  });

  it('renders the barcode only on wide stock that supports it', () => {
    const wide = buildCompactLabelDocument(
      [label({ barcodeDataUrl: BARCODE_PNG })],
      getLabelSize('brother_dk11209'),
    );
    expect(collectImages(wide)).toContain(BARCODE_PNG);

    const narrow = buildCompactLabelDocument(
      [label({ barcodeDataUrl: BARCODE_PNG })],
      getLabelSize('nb_15x26'),
    );
    expect(collectImages(narrow)).not.toContain(BARCODE_PNG);
  });

  it('omits the QR node when no QR image resolved', () => {
    const doc = buildCompactLabelDocument([label({ qrDataUrl: null })], getLabelSize('nb_15x26'));
    expect(collectImages(doc)).toHaveLength(0);
  });

  it('omits the QR on stock too small to print a scannable code (25×13)', () => {
    const doc = buildCompactLabelDocument([label()], getLabelSize('dymo_30333'));
    expect(collectImages(doc)).toHaveLength(0);
  });

  it('keeps the QR on wide strips (40×12) and narrow strips (26×15)', () => {
    expect(collectImages(buildCompactLabelDocument([label()], getLabelSize('nb_12x40')))).toContain(QR_PNG);
    expect(collectImages(buildCompactLabelDocument([label()], getLabelSize('nb_15x26')))).toContain(QR_PNG);
  });

  it('guarantees the QR on the default strip even for a short, index-less id', () => {
    // Stock (STK-0005) and inventory (INV-00013) ids are short and carry no
    // device index, so the identifier used to render at full size and squeeze
    // the QR off the label — leaving it un-scannable, unlike a multi-device
    // case label. The QR is the label's purpose: it must survive.
    for (const id of ['STK-0005', 'INV-00013']) {
      const doc = buildCompactLabelDocument(
        [label({ id, index: undefined, title: null, lines: ['Donor Drives'] })],
        getLabelSize('nb_15x26'),
      );
      expect(collectImages(doc), `${id} QR`).toContain(QR_PNG);
      const idNode = collectTexts(doc).find((t) => t.text === id);
      // The identifier stays clearly legible alongside the guaranteed QR.
      expect(idNode!.fontSize as number, `${id} id size`).toBeGreaterThanOrEqual(8);
    }
  });

  it('gives the identifier the full label width on narrow strips (26×15)', () => {
    const doc = buildCompactLabelDocument([label()], getLabelSize('nb_15x26'));
    const idNode = collectTexts(doc).find((t) => t.text === 'CASE-0042');
    // Full 26mm width fits CASE-0042 + index at ~9.5pt; the old side-by-side layout starved it to 5.5pt.
    expect(idNode!.fontSize).toBeGreaterThanOrEqual(9);
  });

  it('truncates an over-long identifier to one line so it never wraps or evicts the QR', () => {
    // A stock item with no SKU falls back to its free-text name as the id; at
    // 45 chars it used to wrap to 2-3 lines, overflowing the page and pushing
    // the QR off. It must collapse to one ellipsised line with the QR intact.
    const longId = 'Seagate Barracuda 2TB SATA 3.5in Internal HDD';
    const doc = buildCompactLabelDocument(
      [label({ id: longId, index: undefined, title: null, lines: ['Donor Drives'] })],
      getLabelSize('nb_15x26'),
    );
    expect(collectImages(doc)).toContain(QR_PNG);
    const idSpans: string[] = [];
    walk(doc.content, (n) => {
      if (typeof n.text === 'string' && n.text.startsWith('Seagate')) idSpans.push(n.text);
    });
    expect(idSpans.length).toBeGreaterThan(0);
    expect(idSpans.every((t) => t.length < longId.length)).toBe(true);
    expect(idSpans.some((t) => t.endsWith('…'))).toBe(true);
  });

  it('square layout keeps the device serial, not just the customer title', () => {
    // title (customer) is always present, so keying only off it dropped the
    // serial from square case labels — the serial must still print.
    const doc = buildCompactLabelDocument(
      [label({ title: 'Ahmed Al Mansoori', lines: ['SN WD-WX91A123', 'WD Blue 2TB'] })],
      getLabelSize('sq_25'),
    );
    expect(collectTexts(doc).map((t) => t.text)).toContain('SN WD-WX91A123');
  });

  it('square layout stacks QR above the identifier', () => {
    const doc = buildCompactLabelDocument([label()], getLabelSize('sq_25'));
    const page = (doc.content as Content[])[0] as { stack: Content[] };
    const flat = JSON.stringify(page.stack);
    expect(flat.indexOf(QR_PNG)).toBeGreaterThan(-1);
    expect(flat.indexOf(QR_PNG)).toBeLessThan(flat.indexOf('CASE-0042'));
  });

  it('is strictly monochrome — every explicit color is black', () => {
    const doc = buildCompactLabelDocument([label()], getLabelSize('nb_50x30'));
    walk(doc.content, (n) => {
      if (typeof n.color === 'string') expect(n.color).toBe('#000000');
    });
    expect((doc.defaultStyle as Record<string, unknown>).color).toBe('#000000');
  });

  it('renders the device index for multi-device cases', () => {
    const doc = buildCompactLabelDocument([label({ index: '2/12' })], getLabelSize('nb_40x30'));
    expect(collectTexts(doc).some((t) => (t.text as string).includes('2/12'))).toBe(true);
  });
});

describe('fitFontSize', () => {
  it('keeps the base size when text fits', () => {
    expect(fitFontSize('CASE-0042', 200, 11, 5)).toBe(11);
  });

  it('shrinks long identifiers to fit the column', () => {
    const short = fitFontSize('CASE-0042', 60, 11, 5);
    const long = fitFontSize('CASE-2026-000123-RAID', 60, 11, 5);
    expect(long).toBeLessThan(short);
  });

  it('never goes below the minimum readable size', () => {
    expect(fitFontSize('X'.repeat(300), 40, 11, 5)).toBe(5);
  });
});

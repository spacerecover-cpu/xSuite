/**
 * Compact-label print orchestrator — the one entry point every label surface
 * (creation wizards, list actions, print modals, /print/label route) calls.
 *
 * Responsibilities: resolve the tenant's default label stock (unless the caller
 * picked one), map the entity to label content, rasterize QR / Code128 images,
 * build the pdfmake document and emit it.
 *
 * `output: 'print'` is the Direct Print path: pdfmake renders the PDF into a
 * hidden iframe and opens the browser's print dialog immediately — no PDF tab,
 * no download step. (Browsers cannot bypass the dialog entirely; pair a
 * defaulted label printer or Chrome --kiosk-printing for zero-click.)
 *
 * All pdf/barcode dependencies are dynamically imported so creation wizards
 * don't pull pdfmake into their initial bundles (same pattern as
 * inventoryLabelPrint / PrintLabelsModal before this module).
 */

import type { LabelEntity } from '../../labelPrefsService';
import type { LanguageCode } from '../../documentTranslations';
import type { InventoryItemWithDetails } from '../../inventory/inventoryLabelTypes';
import type { StockLabelItem, StockLabelOptions, MappedLabel } from './labelContent';
import type { CompactLabelContent } from './compactLabelDocument';
import type { LabelSizePreset } from './labelSizes';
import { getLabelSize, supportsBarcode } from './labelSizes';

export type LabelOutput = 'print' | 'open' | 'download';

export interface LabelPrintOptions {
  /** How to emit the PDF. Default 'print' (direct to the browser print dialog). */
  output?: LabelOutput;
  /** Label-stock preset id; defaults to the tenant's per-entity preference. */
  sizeId?: string;
  /** Copies of each label (extra pages). Default 1. */
  copies?: number;
}

export interface LabelPrintResult {
  success: boolean;
  error?: string;
}

async function resolveSize(entity: LabelEntity, sizeId?: string): Promise<LabelSizePreset> {
  if (sizeId) return getLabelSize(sizeId);
  const { getLabelPrintingPrefs } = await import('../../labelPrefsService');
  const prefs = await getLabelPrintingPrefs();
  return getLabelSize(prefs.sizes[entity]);
}

async function resolveImages(
  mapped: MappedLabel[],
  size: LabelSizePreset,
): Promise<CompactLabelContent[]> {
  const [{ generateQrPngDataUrl }, { generateCode128DataUrl }] = await Promise.all([
    import('../qrImage'),
    import('../barcodeImage'),
  ]);
  const barcodeCapable = supportsBarcode(size);
  return Promise.all(
    mapped.map(async (m) => {
      const [qrDataUrl, barcodeDataUrl] = await Promise.all([
        generateQrPngDataUrl(m.qrPayload),
        barcodeCapable && m.barcodeValue ? generateCode128DataUrl(m.barcodeValue) : Promise.resolve(null),
      ]);
      return { ...m.content, qrDataUrl, barcodeDataUrl };
    }),
  );
}

function withCopies(labels: CompactLabelContent[], copies: number | undefined): CompactLabelContent[] {
  const n = Math.max(1, Math.min(20, Math.floor(copies ?? 1)));
  if (n === 1) return labels;
  return labels.flatMap((label) => Array.from({ length: n }, () => label));
}

async function buildAndEmit(
  labels: CompactLabelContent[],
  size: LabelSizePreset,
  fontFamily: string,
  output: LabelOutput,
  filename: string,
): Promise<void> {
  const [{ createPdfWithFonts }, { buildCompactLabelDocument }] = await Promise.all([
    import('../fonts'),
    import('./compactLabelDocument'),
  ]);
  const pdf = createPdfWithFonts(buildCompactLabelDocument(labels, size, fontFamily));
  if (output === 'download') pdf.download(filename);
  else if (output === 'open') pdf.open();
  else pdf.print();
}

/**
 * Case labels: one per tracked device (chain-of-custody: devices are labelled
 * individually), single case label when no devices are captured.
 */
export async function printCaseLabels(
  caseId: string,
  opts: LabelPrintOptions = {},
): Promise<LabelPrintResult> {
  try {
    const [{ fetchReceiptData }, { initializePDFFonts }, { createTranslationContext }, { caseLabelContents }] =
      await Promise.all([
        import('../dataFetcher'),
        import('../fonts'),
        import('../translationContext'),
        import('./labelContent'),
      ]);

    const data = await fetchReceiptData(caseId);
    const size = await resolveSize('case', opts.sizeId);

    // Same secondary-language font fallback as generateCaseLabel: labels render
    // values only (customer names may be Arabic), so we need the right family.
    const languageSettings = data.companySettings.localization?.document_language_settings;
    let languageCode = (languageSettings?.secondary_language ?? null) as LanguageCode | null;
    const fontsLoaded = await initializePDFFonts(languageCode);
    if (!fontsLoaded && languageCode) {
      languageCode = null;
      await initializePDFFonts(null);
    }
    const ctx = createTranslationContext('english_only', languageCode);

    const mapped = caseLabelContents(data, size);
    const labels = withCopies(await resolveImages(mapped, size), opts.copies);
    const caseNo = data.caseData.case_number ?? data.caseData.case_no;
    await buildAndEmit(labels, size, ctx.fontFamily, opts.output ?? 'print', `Labels_${caseNo}.pdf`);
    return { success: true };
  } catch (error) {
    console.error('Error generating case labels:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to generate case labels' };
  }
}

export interface StockLabelBatchEntry {
  item: StockLabelItem;
  /** Pre-formatted price line for this item (tenant currency formatting is the caller's). */
  priceText?: string | null;
}

/** One document for the whole batch: items × copies pages, one print dialog. */
export async function printStockLabelBatch(
  entries: StockLabelBatchEntry[],
  opts: LabelPrintOptions & Pick<StockLabelOptions, 'locationName' | 'companyName'> = {},
): Promise<LabelPrintResult> {
  try {
    if (entries.length === 0) return { success: false, error: 'No items to label' };
    const [{ initializePDFFonts }, { stockLabelContent }] = await Promise.all([
      import('../fonts'),
      import('./labelContent'),
    ]);
    await initializePDFFonts();
    const size = await resolveSize('stock', opts.sizeId);

    const mapped = entries.map(({ item, priceText }) =>
      stockLabelContent(item, {
        priceText,
        locationName: opts.locationName,
        companyName: opts.companyName,
      }),
    );
    const labels = withCopies(await resolveImages(mapped, size), opts.copies);
    const filename =
      entries.length === 1
        ? `stock-label-${entries[0].item.sku ?? entries[0].item.name.replace(/\s+/g, '-')}.pdf`
        : 'stock-labels.pdf';
    await buildAndEmit(labels, size, 'Roboto', opts.output ?? 'print', filename);
    return { success: true };
  } catch (error) {
    console.error('Error generating stock labels:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to generate stock labels' };
  }
}

export async function printInventoryLabels(
  items: InventoryItemWithDetails[],
  opts: LabelPrintOptions = {},
): Promise<LabelPrintResult> {
  try {
    if (items.length === 0) return { success: false, error: 'No items to label' };
    const [{ initializePDFFonts }, { inventoryLabelContent }] = await Promise.all([
      import('../fonts'),
      import('./labelContent'),
    ]);
    await initializePDFFonts();
    const size = await resolveSize('inventory', opts.sizeId);

    const mapped = items.map(inventoryLabelContent);
    const labels = withCopies(await resolveImages(mapped, size), opts.copies);
    const first = items[0];
    const filename =
      items.length === 1 ? `inv-label-${first.item_number ?? first.id}.pdf` : 'inventory-labels.pdf';
    await buildAndEmit(labels, size, 'Roboto', opts.output ?? 'print', filename);
    return { success: true };
  } catch (error) {
    console.error('Error generating inventory labels:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to generate inventory labels' };
  }
}

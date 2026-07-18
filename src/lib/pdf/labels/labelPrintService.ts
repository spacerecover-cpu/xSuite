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

import type { LabelEntity, LabelEntityConfig } from '../../labelPrefsService';
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
  /** Label-stock preset id; overrides the tenant's per-entity preference. */
  sizeId?: string;
  /** Copies of each label (extra pages); overrides the tenant preference. */
  copies?: number;
  /** Full design override — the LabelStudio previews an unsaved config through
   *  the exact print path so preview == print. */
  config?: LabelEntityConfig;
}

export interface LabelPrintResult {
  success: boolean;
  error?: string;
}

/** The resolved design for one print, with `sizeId`/`copies` overrides applied. */
export interface ResolvedLabelConfig extends LabelEntityConfig {
  size: LabelSizePreset;
}

/** Resolve the effective design: an explicit `config` (LabelStudio) or the tenant
 *  preference, with per-call `sizeId` / `copies` overrides layered on top. */
export async function resolveLabelConfig(entity: LabelEntity, opts: LabelPrintOptions): Promise<ResolvedLabelConfig> {
  let base = opts.config;
  if (!base) {
    const { getLabelEntityConfig } = await import('../../labelPrefsService');
    base = await getLabelEntityConfig(entity);
  }
  const sizeId = opts.sizeId ?? base.sizeId;
  return { ...base, sizeId, copies: opts.copies ?? base.copies, size: getLabelSize(sizeId) };
}

/**
 * The font a label should render its VALUES in. Labels print customer / item
 * names, which may be non-Latin (Arabic/CJK/Thai), so — like the document
 * generators — resolve the tenant's configured secondary language and load its
 * family into the VFS; without this a Roboto-only label prints Arabic names as
 * missing-glyph boxes. `isRTL` drives per-value word-order correction.
 */
async function resolveLabelFont(): Promise<{ fontFamily: string; isRTL: boolean }> {
  const [{ fetchCompanySettings }, { initializePDFFonts, getFontFamily }, { isRTLLanguage }] =
    await Promise.all([import('../dataFetcher'), import('../fonts'), import('../../documentTranslations')]);
  let languageCode: LanguageCode | null = null;
  try {
    const cs = await fetchCompanySettings();
    languageCode = (cs.localization?.document_language_settings?.secondary_language ?? null) as LanguageCode | null;
  } catch {
    /* no tenant settings reachable — fall back to the Latin default */
  }
  const loaded = await initializePDFFonts(languageCode);
  if (!loaded && languageCode) {
    languageCode = null;
    await initializePDFFonts(null);
  }
  return { fontFamily: getFontFamily(languageCode), isRTL: isRTLLanguage(languageCode) };
}

export async function resolveLabelImages(
  mapped: MappedLabel[],
  size: LabelSizePreset,
  opts: { isRTL?: boolean; showQr?: boolean; showBarcode?: boolean } = {},
): Promise<CompactLabelContent[]> {
  const { isRTL = false, showQr = true, showBarcode = true } = opts;
  const [{ generateQrPngDataUrl }, { generateCode128DataUrl }, { reverseArabicText }] = await Promise.all([
    import('../qrImage'),
    import('../barcodeImage'),
    import('../fonts'),
  ]);
  const barcodeCapable = showBarcode && supportsBarcode(size);
  // pdfmake has no bidi pass, so a multi-word RTL value (Arabic customer / item
  // names) renders with reversed word order. Correct it here; reverseArabicText
  // no-ops on Latin/CJK, so it is safe to apply to every free-text value. The
  // identifier and device index stay LTR codes and are left untouched.
  const fix = (s: string): string => (isRTL ? reverseArabicText(s) : s);
  return Promise.all(
    mapped.map(async (m) => {
      const [qrDataUrl, barcodeDataUrl] = await Promise.all([
        showQr ? generateQrPngDataUrl(m.qrPayload) : Promise.resolve(null),
        barcodeCapable && m.barcodeValue ? generateCode128DataUrl(m.barcodeValue) : Promise.resolve(null),
      ]);
      const c = m.content;
      return {
        ...c,
        title: c.title ? fix(c.title) : c.title,
        lines: c.lines?.map(fix),
        footer: c.footer ? fix(c.footer) : c.footer,
        qrDataUrl,
        barcodeDataUrl,
      };
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
  else {
    // Direct print: hand the exact-size PDF to QZ Tray (silent, correct size).
    // If QZ isn't installed/running, fall back to the browser print dialog.
    const { tryQzPrint } = await import('./qzPrintService');
    const handled = await tryQzPrint(pdf, size);
    if (!handled) pdf.print();
  }
}

/** Render labels to a blob object-URL for the LabelStudio live preview iframe.
 *  Same builder as printing, so the preview is byte-identical to the print. */
export async function buildLabelBlobUrl(
  labels: CompactLabelContent[],
  size: LabelSizePreset,
  fontFamily: string,
): Promise<string> {
  const [{ createPdfWithFonts }, { buildCompactLabelDocument }] = await Promise.all([
    import('../fonts'),
    import('./compactLabelDocument'),
  ]);
  const pdf = createPdfWithFonts(buildCompactLabelDocument(labels, size, fontFamily));
  return new Promise<string>((resolve, reject) => {
    pdf.getBlob(
      (blob: Blob) => resolve(URL.createObjectURL(blob)),
      undefined,
      (err: unknown) => reject(err instanceof Error ? err : new Error('Label preview render failed')),
    );
  });
}

/** Same builder as printing, returned as a raw base64 PDF (no data: prefix) for
 *  the QZ Tray pixel-print path (LabelStudio Test print / direct print). */
export async function buildLabelBase64(
  labels: CompactLabelContent[],
  size: LabelSizePreset,
  fontFamily: string,
): Promise<string> {
  const [{ createPdfWithFonts }, { buildCompactLabelDocument }] = await Promise.all([
    import('../fonts'),
    import('./compactLabelDocument'),
  ]);
  const pdf = createPdfWithFonts(buildCompactLabelDocument(labels, size, fontFamily));
  return new Promise<string>((resolve) => pdf.getBase64((data: string) => resolve(data)));
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
    const cfg = await resolveLabelConfig('case', opts);

    // Same secondary-language font fallback as generateCaseLabel: labels render
    // values only (customer names may be Arabic), so we need the right family.
    const { isRTLLanguage } = await import('../../documentTranslations');
    const languageSettings = data.companySettings.localization?.document_language_settings;
    let languageCode = (languageSettings?.secondary_language ?? null) as LanguageCode | null;
    const fontsLoaded = await initializePDFFonts(languageCode);
    if (!fontsLoaded && languageCode) {
      languageCode = null;
      await initializePDFFonts(null);
    }
    const ctx = createTranslationContext('english_only', languageCode);

    const mapped = caseLabelContents(data, cfg.size, cfg.fields);
    const images = await resolveLabelImages(mapped, cfg.size, {
      isRTL: isRTLLanguage(languageCode),
      showQr: cfg.showQr,
      showBarcode: cfg.showBarcode,
    });
    const labels = withCopies(images, cfg.copies);
    const caseNo = data.caseData.case_number ?? data.caseData.case_no;
    await buildAndEmit(labels, cfg.size, ctx.fontFamily, opts.output ?? 'print', `Labels_${caseNo}.pdf`);
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
    const { stockLabelContent } = await import('./labelContent');
    const { fontFamily, isRTL } = await resolveLabelFont();
    const cfg = await resolveLabelConfig('stock', opts);

    const mapped = entries.map(({ item, priceText }) =>
      stockLabelContent(
        item,
        { priceText, locationName: opts.locationName, companyName: opts.companyName },
        cfg.fields,
      ),
    );
    const images = await resolveLabelImages(mapped, cfg.size, { isRTL, showQr: cfg.showQr, showBarcode: cfg.showBarcode });
    const labels = withCopies(images, cfg.copies);
    const filename =
      entries.length === 1
        ? `stock-label-${entries[0].item.sku ?? entries[0].item.name.replace(/\s+/g, '-')}.pdf`
        : 'stock-labels.pdf';
    await buildAndEmit(labels, cfg.size, fontFamily, opts.output ?? 'print', filename);
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
    const { inventoryLabelContent } = await import('./labelContent');
    const { fontFamily, isRTL } = await resolveLabelFont();
    const cfg = await resolveLabelConfig('inventory', opts);

    const mapped = items.map((item) => inventoryLabelContent(item, cfg.fields));
    const images = await resolveLabelImages(mapped, cfg.size, { isRTL, showQr: cfg.showQr, showBarcode: cfg.showBarcode });
    const labels = withCopies(images, cfg.copies);
    const first = items[0];
    const filename =
      items.length === 1 ? `inv-label-${first.item_number ?? first.id}.pdf` : 'inventory-labels.pdf';
    await buildAndEmit(labels, cfg.size, fontFamily, opts.output ?? 'print', filename);
    return { success: true };
  } catch (error) {
    console.error('Error generating inventory labels:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to generate inventory labels' };
  }
}

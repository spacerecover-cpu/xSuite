import pdfMake from 'pdfmake/build/pdfmake';
import * as pdfFonts from 'pdfmake/build/vfs_fonts';
import type { LanguageCode } from '../documentTranslations';
import { loadFontsByFamily, type FontLoadResult, type FontFamily } from './fontLoader';

let fontsInitialized = false;
let loadedFontFamilies = new Set<string>();
let fontLoadingStatus: 'idle' | 'loading' | 'loaded' | 'error' = 'idle';
let cachedFonts: { [key: string]: string } = {};
let originalVFS: any = null;

export const PDF_FONTS: Record<string, { normal: string; bold: string; italics: string; bolditalics: string }> = {
  Roboto: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Bold.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-BoldItalic.ttf',
  },
  // `Courier` is referenced by hash-value / barcode runs (chain-of-custody hash
  // table, legacy builder) for a monospace look. This pdfmake build only renders
  // fonts present in the VFS, and there is no Courier .ttf — so leaving it
  // undeclared made pdfmake throw "Font 'Courier' is not defined" ASYNC during
  // rasterization, which never fires the getBlob callback → the preview hangs
  // forever. Map it to the Roboto faces already in the VFS so those runs render
  // (slightly less monospace, but legible) instead of hanging. This changes only
  // rasterization, not any doc-definition structure, so golden snapshots that
  // record `font: 'Courier'` stay valid.
  Courier: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Bold.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-BoldItalic.ttf',
  },
  Tajawal: {
    normal: 'Tajawal-Regular.ttf',
    bold: 'Tajawal-Bold.ttf',
    italics: 'Tajawal-Regular.ttf',
    bolditalics: 'Tajawal-Bold.ttf',
  },
  NotoSansArabic: {
    normal: 'NotoSansArabic-Regular.ttf',
    bold: 'NotoSansArabic-Bold.ttf',
    italics: 'NotoSansArabic-Regular.ttf',
    bolditalics: 'NotoSansArabic-Bold.ttf',
  },
  NotoSansKR: {
    normal: 'NotoSansKR-Regular.ttf',
    bold: 'NotoSansKR-Bold.ttf',
    italics: 'NotoSansKR-Regular.ttf',
    bolditalics: 'NotoSansKR-Bold.ttf',
  },
  NotoSansThai: {
    normal: 'NotoSansThai-Regular.ttf',
    bold: 'NotoSansThai-Bold.ttf',
    italics: 'NotoSansThai-Regular.ttf',
    bolditalics: 'NotoSansThai-Bold.ttf',
  },
  NotoSansJP: {
    normal: 'NotoSansJP-Regular.ttf',
    bold: 'NotoSansJP-Bold.ttf',
    italics: 'NotoSansJP-Regular.ttf',
    bolditalics: 'NotoSansJP-Bold.ttf',
  },
  NotoSansSC: {
    normal: 'NotoSansSC-Regular.ttf',
    bold: 'NotoSansSC-Bold.ttf',
    italics: 'NotoSansSC-Regular.ttf',
    bolditalics: 'NotoSansSC-Bold.ttf',
  },
};

function getBaseVFS(): any {
  if (originalVFS) {
    return originalVFS;
  }

  let vfs: any;
  if ((pdfFonts as any).pdfMake?.vfs) {
    vfs = (pdfFonts as any).pdfMake.vfs;
  } else if ((pdfFonts as any).vfs) {
    vfs = (pdfFonts as any).vfs;
  } else if ((pdfFonts as any).default?.pdfMake?.vfs) {
    vfs = (pdfFonts as any).default.pdfMake.vfs;
  } else {
    vfs = pdfFonts as any;
  }

  originalVFS = vfs;
  return vfs;
}

function initVFSWithBaseFont(): void {
  if (fontsInitialized) {
    return;
  }

  try {
    const baseVFS = getBaseVFS();
    (pdfMake as any).vfs = { ...baseVFS, ...cachedFonts };
    (pdfMake as any).fonts = PDF_FONTS;
    fontsInitialized = true;
  } catch (error) {
    console.error('[PDF Fonts] ✗ Failed to initialize VFS:', error);
    throw error;
  }
}

async function loadAndCacheFonts(family: FontFamily, fontName: string): Promise<boolean> {
  if (loadedFontFamilies.has(fontName)) {
    return true;
  }

  fontLoadingStatus = 'loading';

  try {
    const result: FontLoadResult = await loadFontsByFamily(family);

    if (!result.success || !result.fonts) {
      fontLoadingStatus = 'error';
      console.error(`[PDF Fonts] ✗ Failed to load ${fontName} fonts`);
      return false;
    }

    for (const font of result.fonts) {
      cachedFonts[font.name] = font.base64;
    }

    loadedFontFamilies.add(fontName);

    const baseVFS = getBaseVFS();
    const completeVFS = {
      ...baseVFS,
      ...cachedFonts,
    };

    (pdfMake as any).vfs = completeVFS;
    (pdfMake as any).fonts = PDF_FONTS;

    fontsInitialized = true;
    fontLoadingStatus = 'loaded';
    return true;
  } catch (error) {
    fontLoadingStatus = 'error';
    console.error(`[PDF Fonts] ✗ Failed to initialize VFS with ${fontName} fonts:`, error);
    return false;
  }
}

function getLanguageFontMapping(languageCode: LanguageCode): { family: FontFamily; fontName: string } | null {
  const mapping: Record<LanguageCode, { family: FontFamily; fontName: string } | null> = {
    ar: { family: 'tajawal', fontName: 'Tajawal' },
    ko: { family: 'korean', fontName: 'NotoSansKR' },
    th: { family: 'thai', fontName: 'NotoSansThai' },
    pl: { family: 'roboto', fontName: 'Roboto' },
    ru: { family: 'roboto', fontName: 'Roboto' },
    fr: { family: 'roboto', fontName: 'Roboto' },
    de: { family: 'roboto', fontName: 'Roboto' },
    it: { family: 'roboto', fontName: 'Roboto' },
    es: { family: 'roboto', fontName: 'Roboto' },
    tr: { family: 'roboto', fontName: 'Roboto' },
    pt: { family: 'roboto', fontName: 'Roboto' },
    uk: { family: 'roboto', fontName: 'Roboto' },
    cs: { family: 'roboto', fontName: 'Roboto' },
  };

  return mapping[languageCode] || null;
}

export function getFontFamily(languageCode: LanguageCode | null): string {
  if (!languageCode) {
    return 'Roboto';
  }

  const mapping = getLanguageFontMapping(languageCode);
  if (mapping && loadedFontFamilies.has(mapping.fontName)) {
    return mapping.fontName;
  }

  return 'Roboto';
}

export async function initializePDFFonts(languageCode: LanguageCode | null = null): Promise<boolean> {
  if (!languageCode) {
    if (!loadedFontFamilies.has('Roboto')) {
      await loadAndCacheFonts('roboto', 'Roboto');
    }
    initVFSWithBaseFont();
    return true;
  }

  const mapping = getLanguageFontMapping(languageCode);

  if (!mapping) {
    if (!loadedFontFamilies.has('Roboto')) {
      await loadAndCacheFonts('roboto', 'Roboto');
    }
    initVFSWithBaseFont();
    return true;
  }

  if (loadedFontFamilies.has(mapping.fontName)) {
    return true;
  }

  try {
    const loaded = await loadAndCacheFonts(mapping.family, mapping.fontName);
    if (!loaded) {
      console.error(`[PDF Fonts] ${mapping.fontName} fonts unavailable, loading Roboto fallback`);
      if (!loadedFontFamilies.has('Roboto')) {
        await loadAndCacheFonts('roboto', 'Roboto');
      }
      initVFSWithBaseFont();
    }
    return loaded;
  } catch (error) {
    console.error('[PDF Fonts] Error initializing fonts:', error);
    try {
      if (!loadedFontFamilies.has('Roboto')) {
        await loadAndCacheFonts('roboto', 'Roboto');
      }
      initVFSWithBaseFont();
    } catch (fallbackError) {
      console.error('[PDF Fonts] Fallback initialization also failed:', fallbackError);
    }
    return false;
  }
}

export function reverseArabicText(text: string): string {
  if (!text) return '';

  const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

  if (!arabicPattern.test(text)) {
    return text;
  }

  const words = text.split(' ');
  const reversedWords = words.reverse();
  return reversedWords.join(' ');
}

export function processTextForPDF(text: string, isRTL: boolean = false): string {
  if (!text) return '';

  if (isRTL) {
    return reverseArabicText(text);
  }

  return text;
}

export function createBilingualContent(
  englishText: string,
  arabicText: string | null,
  isRTL: boolean = false
): string {
  if (!arabicText) return englishText;

  const processedArabic = isRTL ? reverseArabicText(arabicText) : arabicText;
  return `${englishText} | ${processedArabic}`;
}

export function getFontsLoadingStatus(): 'idle' | 'loading' | 'loaded' | 'error' {
  return fontLoadingStatus;
}

export function areFontsLoaded(languageCode: LanguageCode | null): boolean {
  if (!languageCode) {
    return fontsInitialized;
  }

  const mapping = getLanguageFontMapping(languageCode);
  if (mapping) {
    return loadedFontFamilies.has(mapping.fontName);
  }

  return fontsInitialized;
}

export async function preloadAllFonts(): Promise<void> {
  if (!loadedFontFamilies.has('Roboto')) {
    await loadAndCacheFonts('roboto', 'Roboto');
  }
  // The document template studio can preview ANY language (single Arabic or
  // bilingual), and the engine's doc-definition references the Arabic family
  // (Tajawal) for those modes. Those font files must be in the VFS too — without
  // them pdfmake throws "file not found" ASYNC at rasterization, which surfaces as
  // "Could not render the preview". Load them here so Arabic/bilingual previews
  // render. Failures are non-fatal (loadAndCacheFonts swallows errors): a missing
  // Arabic font degrades to the base font, it never hangs the preview.
  if (!loadedFontFamilies.has('Tajawal')) {
    await loadAndCacheFonts('tajawal', 'Tajawal');
  }
  if (!loadedFontFamilies.has('NotoSansArabic')) {
    await loadAndCacheFonts('arabic', 'NotoSansArabic');
  }
  // KO/TH (NotoSansKR / NotoSansThai) are intentionally NOT eager-loaded here.
  // Their binaries are not bundled and the raw-TTF CDN URL 404s, so eager-loading
  // them failed on EVERY preview render — flooding the console AND adding the
  // latency of 4 doomed fetches (local→SPA-HTML, then CDN→404) to each re-render,
  // which is what made non-Arabic previews feel broken/laggy. They now load
  // on-demand (previewTemplate → initializePDFFonts) ONLY when ko/th is the
  // selected secondary, and degrade to the base font if the binary is absent.
  // The 11 other languages (8 Latin via Roboto, ru/uk Cyrillic via Roboto, ar via
  // local Tajawal/NotoSansArabic) need nothing further and now render cleanly+fast.
  initVFSWithBaseFont();
}

export function resetFontLoadingState(): void {
  fontsInitialized = false;
  loadedFontFamilies.clear();
  fontLoadingStatus = 'idle';
  cachedFonts = {};
}

export function ensurePDFMakeFontsReady(): void {
  if (fontsInitialized) {
    const vfs = getBaseVFS();
    const completeVFS = {
      ...vfs,
      ...cachedFonts,
    };

    (pdfMake as any).vfs = completeVFS;
    (pdfMake as any).fonts = PDF_FONTS;
  }
}

export function getCurrentVFS(): Record<string, string> {
  const vfs = getBaseVFS();
  return {
    ...vfs,
    ...cachedFonts,
  };
}

/**
 * A font table that is GUARANTEED consistent with the supplied VFS: any declared
 * family whose face files are not present in the VFS is remapped to the Roboto
 * faces (which are always loaded). This is the proven `Courier` remap (above)
 * generalized to every family.
 *
 * Why it matters: the engine emits a DETERMINISTIC family name for a chosen
 * secondary language (e.g. `NotoSansKR` / `NotoSansThai`) regardless of whether
 * that font actually loaded. Korean/Thai fonts are fetched from a CDN
 * (`fonts.gstatic.com`) which the app CSP `connect-src` blocks, so they never
 * enter the VFS. pdfmake then throws "file not found" ASYNCHRONOUSLY during
 * rasterization — which never fires the getBlob callback, so the Studio preview
 * hangs and ultimately surfaces "Could not render the preview". Pointing the
 * unresolved family at Roboto degrades a missing secondary script to legible
 * Latin (English fallback) instead of crashing the render. The English half of a
 * bilingual document is unaffected; a font that DID load is left untouched.
 */
export function fontTableForVFS(vfs: Record<string, string>): typeof PDF_FONTS {
  const table: typeof PDF_FONTS = {};
  for (const [family, faces] of Object.entries(PDF_FONTS)) {
    const allPresent =
      vfs[faces.normal] != null &&
      vfs[faces.bold] != null &&
      vfs[faces.italics] != null &&
      vfs[faces.bolditalics] != null;
    table[family] = allPresent ? faces : PDF_FONTS.Roboto;
  }
  return table;
}

export function createPdfWithFonts(docDefinition: any): any {
  const vfs = getCurrentVFS();
  return pdfMake.createPdf(docDefinition, undefined, fontTableForVFS(vfs), vfs);
}

export { pdfMake };

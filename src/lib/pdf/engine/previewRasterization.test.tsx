import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { BUILT_IN_TEMPLATE_CONFIGS, type TemplateDocumentType } from '../templateConfig';
import { buildPreviewEngineData } from './sampleData';
import { renderTemplate } from './renderTemplate';
import { pdfMake, PDF_FONTS } from '../fonts';
import { PREVIEW_PLACEHOLDER_IMAGE } from './previewTemplate';
import type { TranslationContext } from '../types';

// ---------------------------------------------------------------------------
// End-to-end rasterization guard. The previous tests only BUILT the
// doc-definition; they never called getBlob, so two bugs that only surface at
// rasterization shipped: (1) `font: 'Courier'` was unregistered → pdfmake threw
// async → getBlob never called back → the preview hung forever; (2) the 1-bit
// placeholder PNG was rejected by pdfmake's decoder (same async-hang).
//
// This test actually rasterizes every doc type's seeded preview (real Roboto
// faces in the VFS — matching the browser preview's font set — plus the exact
// placeholder image the preview injects) and asserts it produces a blob without
// hanging or erroring.
// ---------------------------------------------------------------------------

const ctx: TranslationContext = {
  t: (_k, en) => en,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

const ttf = (f: string) => readFileSync(`public/fonts/${f}`).toString('base64');
// Roboto only — matches the browser preview's preloadAllFonts. `Courier` maps to
// Roboto in PDF_FONTS, so the chain-of-custody hash run resolves here too.
const VFS: Record<string, string> = {
  'Roboto-Regular.ttf': ttf('Roboto-Regular.ttf'),
  'Roboto-Bold.ttf': ttf('Roboto-Bold.ttf'),
  'Roboto-Italic.ttf': ttf('Roboto-Italic.ttf'),
  'Roboto-BoldItalic.ttf': ttf('Roboto-BoldItalic.ttf'),
};

type CreatePdf = (
  dd: unknown,
  tableLayouts: undefined,
  fonts: unknown,
  vfs: Record<string, string>,
) => { getBlob: (cb: (b: Blob) => void, opts: undefined, err: (e: unknown) => void) => void };
const createPdf = (pdfMake as unknown as { createPdf: CreatePdf }).createPdf;

describe('preview rasterization — every document type renders to a blob', () => {
  const docTypes = Object.keys(BUILT_IN_TEMPLATE_CONFIGS) as TemplateDocumentType[];

  it.each(docTypes)('rasterizes "%s" without hanging or erroring', async (docType) => {
    const config = BUILT_IN_TEMPLATE_CONFIGS[docType];
    const docDef = renderTemplate(
      config,
      buildPreviewEngineData(docType, config),
      ctx,
      PREVIEW_PLACEHOLDER_IMAGE,
      PREVIEW_PLACEHOLDER_IMAGE,
    );
    const outcome = await new Promise<string>((resolve) => {
      const timer = setTimeout(() => resolve('HANG (getBlob never called back)'), 12000);
      try {
        createPdf(docDef, undefined, PDF_FONTS, VFS).getBlob(
          () => {
            clearTimeout(timer);
            resolve('OK');
          },
          undefined,
          (err: unknown) => {
            clearTimeout(timer);
            resolve(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
          },
        );
      } catch (err) {
        clearTimeout(timer);
        resolve(`THROW: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
    expect(outcome, `${docType} failed to rasterize`).toBe('OK');
  }, 20000);
});

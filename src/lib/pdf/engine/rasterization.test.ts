import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import pdfMake from 'pdfmake/build/pdfmake';
import { renderTemplate } from './renderTemplate';
import { toEngineData as invoiceToEngine } from './adapters/invoiceAdapter';
import { sampleInvoiceData } from './sampleData';
import { PDF_FONTS } from '../fonts';
import { BUILT_IN_TEMPLATE_CONFIGS, resolveTemplateConfig } from '../templateConfig';
import type { LanguageMode } from '../templateConfig';
import type { TranslationContext } from '../types';

// Real rasterization smoke test: proves a bilingual/Arabic invoice doc-definition
// actually rasterizes once the Arabic font is in the VFS (the exact failure mode
// behind "Could not render the preview"). Loads the local TTFs from public/fonts.

const ctx: TranslationContext = {
  t: (_k, en) => en,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

function b64(path: string): string {
  return readFileSync(path).toString('base64');
}

/** Replicate the VFS the app builds after preloadAllFonts(): Roboto + Tajawal. */
function vfsWithArabic(): Record<string, string> {
  return {
    'Roboto-Regular.ttf': b64('public/fonts/Roboto-Regular.ttf'),
    'Roboto-Bold.ttf': b64('public/fonts/Roboto-Bold.ttf'),
    'Roboto-Italic.ttf': b64('public/fonts/Roboto-Italic.ttf'),
    'Roboto-BoldItalic.ttf': b64('public/fonts/Roboto-BoldItalic.ttf'),
    'Tajawal-Regular.ttf': b64('public/fonts/Tajawal-Regular.ttf'),
    'Tajawal-Bold.ttf': b64('public/fonts/Tajawal-Bold.ttf'),
  };
}

function rasterizes(mode: LanguageMode): Promise<number> {
  const config =
    mode === 'en'
      ? BUILT_IN_TEMPLATE_CONFIGS.invoice
      : resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, {
          language: { mode, primary: mode === 'ar' ? 'ar' : 'en' },
        });
  const data = invoiceToEngine(sampleInvoiceData(), config);
  const def = renderTemplate(config, data, ctx, null, null);
  const pdf = (pdfMake as any).createPdf(def, undefined, PDF_FONTS, vfsWithArabic());
  return new Promise<number>((resolve, reject) => {
    try {
      pdf.getBuffer((buf: Uint8Array) => resolve(buf.byteLength), undefined, (err: unknown) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

describe('rasterization smoke: invoice renders in every language mode', () => {
  it.each(['en', 'ar', 'bilingual_stacked', 'bilingual_sidebyside'] as LanguageMode[])(
    'produces PDF bytes for mode %s without throwing',
    async (mode) => {
      const bytes = await rasterizes(mode);
      expect(bytes).toBeGreaterThan(1000);
    },
    30000,
  );
});

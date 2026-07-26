import { describe, it, expect } from 'vitest';
import { renderTemplate } from './renderTemplate';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../templateConfig';
import { sampleInvoiceData } from './sampleData';
import { toEngineData } from './adapters/invoiceAdapter';
import type { TranslationContext } from '../types';

// Regression lock for QA RND-01: `watermark.image` was a documented config
// field that resolveWatermarkSettings computed and NOTHING rendered —
// renderTemplate built a watermark only from `wm.text`, so an image-only
// watermark produced no watermark at all. pdfmake's `watermark` property is
// text-only, so the image is drawn as a page `background` instead.

const CTX: TranslationContext = {
  t: (_k: string, en: string) => en,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

const LOGO = { kind: 'raster' as const, dataUrl: 'data:image/png;base64,AAAA' };

const build = (watermark: Record<string, unknown>, logo: unknown = LOGO) => {
  const config = {
    ...BUILT_IN_TEMPLATE_CONFIGS.invoice,
    watermark: watermark as never,
  };
  const data = toEngineData(sampleInvoiceData(), config);
  return renderTemplate(config, data, CTX, logo as never);
};

describe('image watermark (RND-01)', () => {
  it('renders a background image when watermark.image is set with no text', () => {
    const doc = build({ image: true, opacity: 0.2 });
    expect(doc.background).toBeDefined();
    const node = typeof doc.background === 'function'
      ? doc.background(1, { width: 595, height: 842, orientation: 'portrait' })
      : doc.background;
    expect(node).toMatchObject({ image: LOGO.dataUrl, opacity: 0.2 });
  });

  it('scales and centres the watermark against the actual page box', () => {
    const doc = build({ image: true });
    const node = (doc.background as unknown as (
      p: number,
      s: { width: number; height: number; orientation: string },
    ) => Record<string, unknown>)(1, { width: 1000, height: 500, orientation: 'landscape' });
    // Width follows the page, not a hardcoded A4 assumption.
    expect(node.width).toBe(600);
    expect(node.alignment).toBe('center');
  });

  it('does not emit a text watermark when the image variant is chosen', () => {
    const doc = build({ image: true, text: 'DRAFT' });
    expect(doc.background).toBeDefined();
    expect(doc.watermark).toBeUndefined();
  });

  it('falls back to the text watermark when no image is available', () => {
    const doc = build({ image: true, text: 'DRAFT' }, { kind: 'none', reason: 'empty' });
    expect(doc.background).toBeUndefined();
    expect(doc.watermark).toMatchObject({ text: 'DRAFT' });
  });

  it('leaves the text-only watermark path untouched (parity)', () => {
    const doc = build({ text: 'CONFIDENTIAL', opacity: 0.4 });
    expect(doc.background).toBeUndefined();
    expect(doc.watermark).toMatchObject({ text: 'CONFIDENTIAL', opacity: 0.4 });
  });

  it('emits no watermark at all when neither text nor a usable image is present', () => {
    const doc = build({ image: true }, { kind: 'none', reason: 'empty' });
    expect(doc.background).toBeUndefined();
    expect(doc.watermark).toBeUndefined();
  });
});

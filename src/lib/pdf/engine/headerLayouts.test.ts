import { describe, it, expect } from 'vitest';
import type { Content } from 'pdfmake/interfaces';
import { renderHeader } from './sections/header';
import type { EngineContext, EngineDocData } from './types';
import type { TranslationContext } from '../types';
import { BUILT_IN_TEMPLATE_CONFIGS, resolveTemplateConfig } from '../templateConfig';
import type { HeaderLayout, TemplateConfigOverride } from '../templateConfig';

const ctx: TranslationContext = {
  t: (_k, en) => en,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

function data(): EngineDocData {
  return {
    documentTitle: { en: 'QUOTATION', ar: 'عرض سعر' },
    identity: {
      basic_info: { company_name: 'Future Space', legal_name: 'Future Space LLC', vat_number: 'OM1100' },
      location: { address_line1: 'Azaiba Mall', city: 'Muscat', country: 'Oman' },
      contact_info: { phone_primary: '+968 1', email_general: 'hi@fx.test' },
      branding: {},
      online_presence: {},
    },
    parties: {},
    meta: [],
    qrCaption: null,
  };
}

function engine(override?: TemplateConfigOverride): EngineContext {
  const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.quote, undefined, override);
  return { config, ctx, logoBase64: 'LOGO', qrCodeBase64: null };
}

function collectText(node: unknown, out: string[]): void {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((c) => collectText(c, out));
  const obj = node as Record<string, unknown>;
  if (typeof obj.text === 'string') out.push(obj.text);
  Object.values(obj).forEach((v) => collectText(v, out));
}
function collectLineWidths(node: unknown, out: number[]): void {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((c) => collectLineWidths(c, out));
  const obj = node as Record<string, unknown>;
  if (obj.type === 'line' && typeof obj.lineWidth === 'number') out.push(obj.lineWidth);
  Object.values(obj).forEach((v) => collectLineWidths(v, out));
}
function hasImage(node: unknown): boolean {
  if (node == null || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(hasImage);
  const obj = node as Record<string, unknown>;
  if (obj.image !== undefined) return true;
  return Object.values(obj).some(hasImage);
}

describe('renderHeader — legacy path parity', () => {
  it('with no header/organization config, renders logo + name + a thin rule + title', () => {
    const out = renderHeader(engine(), data()) as Content[];
    expect(hasImage(out)).toBe(true);
    const texts: string[] = [];
    collectText(out, texts);
    expect(texts).toContain('Future Space LLC');
    expect(texts).toContain('QUOTATION');
    expect(texts).not.toContain('VAT: OM1100'); // legacy path never shows tax id
    const widths: number[] = [];
    collectLineWidths(out, widths);
    expect(widths).toContain(0.5); // thin rule
  });
});

describe('renderHeader — builder layouts', () => {
  const layouts: HeaderLayout[] = ['classic', 'modern', 'minimal', 'boxed', 'split', 'spreadsheet'];
  for (const layout of layouts) {
    it(`renders the ${layout} layout with logo + name + title`, () => {
      const out = renderHeader(engine({ header: { layout } }), data()) as Content[];
      expect(hasImage(out)).toBe(true);
      const texts: string[] = [];
      collectText(out, texts);
      expect(texts).toContain('Future Space LLC');
      expect(texts).toContain('QUOTATION');
    });
  }

  it('honors divider: none (no rule) and thick (2pt)', () => {
    const none: number[] = [];
    collectLineWidths(renderHeader(engine({ header: { divider: 'none' } }), data()), none);
    expect(none).toHaveLength(0);

    const thick: number[] = [];
    collectLineWidths(renderHeader(engine({ header: { divider: 'thick' } }), data()), thick);
    expect(thick).toContain(2);
  });

  it('hides the logo when organization.show.logo is false', () => {
    const out = renderHeader(engine({ organization: { show: { logo: false } } }), data());
    expect(hasImage(out)).toBe(false);
  });

  it('shows the tax id when organization.show.taxId is on', () => {
    const out = renderHeader(engine({ organization: { show: { taxId: true } } }), data());
    const texts: string[] = [];
    collectText(out, texts);
    expect(texts.some((t) => t.includes('OM1100'))).toBe(true);
  });

  it('uses manual organization values when source is manual', () => {
    const out = renderHeader(
      engine({ organization: { source: 'manual', manual: { legalName: 'Manual Co LLC' } } }),
      data(),
    );
    const texts: string[] = [];
    collectText(out, texts);
    expect(texts).toContain('Manual Co LLC');
  });
});

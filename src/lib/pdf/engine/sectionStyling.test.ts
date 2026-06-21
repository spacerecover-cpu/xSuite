import { describe, it, expect } from 'vitest';
import type { Content, DynamicContent } from 'pdfmake/interfaces';
import { renderTemplate } from './renderTemplate';
import type { EngineDocData } from './types';
import type { TranslationContext } from '../types';
import { BUILT_IN_TEMPLATE_CONFIGS, resolveTemplateConfig } from '../templateConfig';

const ctx: TranslationContext = {
  t: (_k, en) => en,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

function data(): EngineDocData {
  return {
    documentTitle: { en: 'TAX INVOICE', ar: 'فاتورة ضريبية' },
    identity: {
      basic_info: { company_name: 'FX', legal_name: 'FX LLC', vat_number: 'OM-VAT-99' },
      location: { city: 'Muscat' },
      contact_info: {},
      branding: { brand_tagline: 'Recovered.' },
      online_presence: { website: 'https://fx.test' },
    },
    parties: {},
    meta: [],
    lineItems: {
      columns: [
        { key: 'description', visible: true, label: { en: 'Description' }, width: 220, align: 'left' },
        { key: 'lineTotal', visible: true, label: { en: 'Total' }, align: 'right' },
      ],
      rows: [
        { description: 'Item A', lineTotal: '10' },
        { description: 'Item B', lineTotal: '20' },
      ],
    },
    qrCaption: null,
  };
}

function collectText(node: unknown, out: string[]): void {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((c) => collectText(c, out));
  const o = node as Record<string, unknown>;
  if (typeof o.text === 'string') out.push(o.text);
  Object.values(o).forEach((v) => collectText(v, out));
}
function anyLayoutHasFillColor(node: unknown): boolean {
  if (node == null || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(anyLayoutHasFillColor);
  const o = node as Record<string, unknown>;
  const layout = o.layout as { fillColor?: unknown } | undefined;
  if (layout && typeof layout === 'object' && typeof layout.fillColor === 'function') return true;
  return Object.values(o).some(anyLayoutHasFillColor);
}
function findHeaderFill(node: unknown, headerText: string): string | undefined {
  const texts: string[] = [];
  collectText(node, texts);
  if (node == null || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) {
    for (const c of node) {
      const f = findHeaderFill(c, headerText);
      if (f) return f;
    }
    return undefined;
  }
  const o = node as Record<string, unknown>;
  if (o.text === headerText && typeof o.fillColor === 'string') return o.fillColor;
  for (const v of Object.values(o)) {
    const f = findHeaderFill(v, headerText);
    if (f) return f;
  }
  return undefined;
}

describe('line-item table styling', () => {
  it('has no S/N column or zebra fill by default (parity)', () => {
    const def = renderTemplate(BUILT_IN_TEMPLATE_CONFIGS.invoice, data(), ctx, null, null);
    const texts: string[] = [];
    collectText(def.content, texts);
    expect(texts).not.toContain('#');
    expect(anyLayoutHasFillColor(def.content)).toBe(false);
  });

  it('adds an S/N column when rowNumbering is on', () => {
    const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, {
      table: { rowNumbering: true },
    });
    const def = renderTemplate(config, data(), ctx, null, null);
    const texts: string[] = [];
    collectText(def.content, texts);
    expect(texts).toContain('#');
    expect(texts).toContain('1');
    expect(texts).toContain('2');
  });

  it('adds a zebra fillColor layout when zebra is on', () => {
    const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, {
      table: { zebra: true },
    });
    const def = renderTemplate(config, data(), ctx, null, null);
    expect(anyLayoutHasFillColor(def.content)).toBe(true);
  });

  it('uses a custom table header background', () => {
    const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, {
      table: { headerBackground: '#ecfdf5' },
    });
    const def = renderTemplate(config, data(), ctx, null, null);
    expect(findHeaderFill(def.content, 'Description')).toBe('#ecfdf5');
  });
});

describe('footer config', () => {
  const pageSize = { width: 595, height: 842 } as never;

  it('uses custom footer text when configured', () => {
    const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, {
      footer: { customText: 'Thank you for your business', alignment: 'right' },
    });
    const def = renderTemplate(config, data(), ctx, null, null);
    const out = (def.footer as DynamicContent)(1, 1, pageSize) as Content;
    const texts: string[] = [];
    collectText(out, texts);
    expect(texts).toContain('Thank you for your business');
  });
});

describe('VAT/GST tax bar', () => {
  it('is absent by default', () => {
    const def = renderTemplate(BUILT_IN_TEMPLATE_CONFIGS.invoice, data(), ctx, null, null);
    const texts: string[] = [];
    collectText(def.content, texts);
    expect(texts.some((t) => t.includes('OM-VAT-99'))).toBe(false);
  });

  it('renders the supplier registration number when enabled + visible', () => {
    const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, {
      taxBar: { enabled: true, label: { en: 'VAT Reg. No.' } },
      sections: [{ key: 'taxBar', visible: true }],
    });
    const def = renderTemplate(config, data(), ctx, null, null);
    const texts: string[] = [];
    collectText(def.content, texts);
    expect(texts.some((t) => t.includes('VAT Reg. No.') && t.includes('OM-VAT-99'))).toBe(true);
  });
});

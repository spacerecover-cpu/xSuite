import { describe, it, expect } from 'vitest';
import { TEMPLATE_PRESETS, categoriesFor } from './presetTemplates';
import { BUILT_IN_TEMPLATE_CONFIGS, resolveTemplateConfig, type TemplateDocumentType } from '../../lib/pdf/templateConfig';
import { renderTemplate } from '../../lib/pdf/engine/renderTemplate';
import type { EngineDocData } from '../../lib/pdf/engine/types';
import type { TranslationContext } from '../../lib/pdf/types';

const ctx: TranslationContext = {
  t: (_k, en) => en,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

const data: EngineDocData = {
  documentTitle: { en: 'DOCUMENT' },
  identity: {
    basic_info: { company_name: 'C', legal_name: 'C LLC', vat_number: 'VAT1' },
    location: { city: 'Muscat' },
    contact_info: {},
    branding: { brand_tagline: 'T' },
    online_presence: { website: 'https://x.test' },
  },
  parties: {},
  meta: [],
  qrCaption: null,
};

const allPresets = Object.values(TEMPLATE_PRESETS).flat();

describe('TEMPLATE_PRESETS', () => {
  it('has a non-empty preset list for every document type', () => {
    for (const docType of Object.keys(BUILT_IN_TEMPLATE_CONFIGS) as TemplateDocumentType[]) {
      expect(TEMPLATE_PRESETS[docType]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('uses globally-unique preset ids', () => {
    const ids = allPresets.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps each preset on its own document type', () => {
    for (const [docType, presets] of Object.entries(TEMPLATE_PRESETS)) {
      for (const p of presets) expect(p.docType).toBe(docType);
    }
  });

  it('every preset resolves + renders to a content array without throwing', () => {
    for (const preset of allPresets) {
      const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS[preset.docType], undefined, preset.config);
      const def = renderTemplate(config, data, ctx, 'LOGO', 'QR');
      expect(Array.isArray(def.content), `preset ${preset.id}`).toBe(true);
    }
  });

  it('exposes the categories present for a doc type', () => {
    expect(categoriesFor('invoice')).toContain('vip');
    expect(categoriesFor('quote').length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// The Premium Lab intake presets reorder every intake section by key
// (PREMIUM_INTAKE_ORDERS). A key missing from that map keeps its BASE order and
// silently collides with whichever section already holds that slot — so the
// depositor handover box lands in an ambiguous position instead of between the
// device table and the consent text. These tests pin the depositor block's
// visibility AND its position for both intake doc types.
// ---------------------------------------------------------------------------

const INTAKE_DOC_TYPES = ['office_receipt', 'customer_copy'] as const;

/** A minimal depositor handover block, as `receiptAdapter` emits it. */
const dataWithCollector: EngineDocData = {
  ...data,
  collector: {
    title: { en: 'Handover Information', ar: 'معلومات التسليم' },
    rows: [{ label: { en: 'Delivered by' }, value: 'Sam Okafor — on behalf of Jane Client' }],
  },
};

/** Every leaf `text` string in a pdfmake content tree. */
function collectTexts(node: unknown, out: string[]): void {
  if (node == null) return;
  if (typeof node === 'string') {
    out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectTexts(child, out);
    return;
  }
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if ('text' in obj) collectTexts(obj.text, out);
    for (const key of Object.keys(obj)) {
      if (key === 'text') continue;
      collectTexts(obj[key], out);
    }
  }
}

describe('Premium Lab intake presets keep the depositor handover block', () => {
  const premiumIntake = (docType: (typeof INTAKE_DOC_TYPES)[number]) => {
    const preset = TEMPLATE_PRESETS[docType].find((p) => p.id === `${docType}-premium-lab`);
    expect(preset, `${docType} must ship a Premium Lab preset`).toBeDefined();
    return resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS[docType], undefined, preset!.config);
  };

  it.each(INTAKE_DOC_TYPES)('%s resolves a visible collector section', (docType) => {
    const collector = premiumIntake(docType).sections.find((s) => s.key === 'collector');
    expect(collector, `${docType} premium preset must keep a collector section`).toBeDefined();
    expect(collector?.visible).toBe(true);
  });

  it.each(INTAKE_DOC_TYPES)('%s orders collector between devices and legalTerms', (docType) => {
    const sections = premiumIntake(docType).sections;
    const orderOf = (key: string) => sections.find((s) => s.key === key)?.order;
    const devices = orderOf('devices');
    const collector = orderOf('collector');
    const legalTerms = orderOf('legalTerms');

    expect(devices).toBeDefined();
    expect(collector).toBeDefined();
    expect(legalTerms).toBeDefined();
    expect(collector!).toBeGreaterThan(devices!);
    expect(collector!).toBeLessThan(legalTerms!);
  });

  it.each(INTAKE_DOC_TYPES)('%s renders the handover box onto the page', (docType) => {
    const def = renderTemplate(premiumIntake(docType), dataWithCollector, ctx, 'LOGO', 'QR');
    const texts: string[] = [];
    collectTexts(def.content, texts);
    const joined = texts.join('|');
    expect(joined).toContain('Handover Information');
    expect(joined).toContain('Sam Okafor — on behalf of Jane Client');
  });
});

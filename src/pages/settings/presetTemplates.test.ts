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

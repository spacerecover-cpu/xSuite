import { describe, it, expect } from 'vitest';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { renderTemplate } from './renderTemplate';
import { resolvePresentation } from './branding';
import { toEngineData as receiptToEngine, docRefBannerActive } from './adapters/receiptAdapter';
import { sampleReceiptData } from './sampleData';
import type { EngineDocData } from './types';
import type { TranslationContext } from '../types';
import {
  BUILT_IN_TEMPLATE_CONFIGS,
  resolveTemplateConfig,
  type PresentationConfig,
  type TemplateConfigOverride,
} from '../templateConfig';
import { TEMPLATE_PRESETS } from '../../../pages/settings/presetTemplates';

// ---------------------------------------------------------------------------
// Premium presentation finish — every knob is gated on the presence of the
// `presentation` group (and, for the banner, a visible `docRef` section), so an
// unconfigured template renders byte-identically to the legacy finish.
// ---------------------------------------------------------------------------

const ctx: TranslationContext = {
  t: (_k, en) => en,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

function collect(node: unknown, pred: (o: Record<string, unknown>) => boolean, out: Record<string, unknown>[]): void {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) collect(child, pred, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  if (pred(obj)) out.push(obj);
  for (const value of Object.values(obj)) collect(value, pred, out);
}

function findAll(def: TDocumentDefinitions, pred: (o: Record<string, unknown>) => boolean): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  collect(def.content as Content, pred, out);
  return out;
}

const PREMIUM: PresentationConfig = {
  infoCardStyle: 'open',
  tableHeaderStyle: 'light',
  titleStyle: 'display',
  docRef: 'banner',
  signatureStyle: 'dotted',
  signatureAlign: 'center',
  termsStyle: 'open',
  footerSocialIcons: true,
  headerWebsite: true,
  deviceIcons: true,
};

function receiptRender(override?: TemplateConfigOverride): TDocumentDefinitions {
  const config = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.office_receipt, undefined, override);
  const data = receiptToEngine(sampleReceiptData(), config, 'office');
  return renderTemplate(config, data, ctx, 'LOGO', null);
}

describe('resolvePresentation', () => {
  it('resolves the legacy finish when the group is absent', () => {
    const resolved = resolvePresentation({});
    expect(resolved).toEqual({
      infoCardStyle: 'band',
      tableHeaderStyle: 'filled',
      titleStyle: 'inline',
      docRef: 'none',
      signatureStyle: 'solid',
      signatureAlign: 'left',
      termsStyle: 'boxed',
      footerSocialIcons: false,
      headerWebsite: false,
      deviceIcons: false,
    });
  });

  it('degrades unknown values to the legacy finish instead of breaking a render', () => {
    const resolved = resolvePresentation({
      presentation: {
        infoCardStyle: 'sparkly' as never,
        docRef: 'marquee' as never,
        footerSocialIcons: 'yes' as never,
      },
    });
    expect(resolved.infoCardStyle).toBe('band');
    expect(resolved.docRef).toBe('none');
    expect(resolved.footerSocialIcons).toBe(false);
  });

  it('passes configured premium values through', () => {
    const resolved = resolvePresentation({ presentation: PREMIUM });
    expect(resolved.infoCardStyle).toBe('open');
    expect(resolved.tableHeaderStyle).toBe('light');
    expect(resolved.titleStyle).toBe('display');
    expect(resolved.docRef).toBe('banner');
    expect(resolved.signatureStyle).toBe('dotted');
    expect(resolved.deviceIcons).toBe(true);
  });
});

describe('presentation gating (office receipt)', () => {
  it('renders no rounded banner rect and no dotted rules by default', () => {
    const def = receiptRender();
    expect(findAll(def, (o) => o.type === 'rect' && typeof o.r === 'number')).toHaveLength(0);
    expect(findAll(def, (o) => o.type === 'line' && o.dash !== undefined)).toHaveLength(0);
    // The adapter emits preparedBy, but the legacy finish never renders it.
    expect(JSON.stringify(def.content)).not.toContain('Registered by:');
  });

  it('renders the Case ID banner when the docRef section + presentation opt in', () => {
    const def = receiptRender({
      presentation: { docRef: 'banner' },
      sections: [{ key: 'docRef', visible: true, order: 1 }],
    });
    const rects = findAll(def, (o) => o.type === 'rect' && typeof o.r === 'number');
    expect(rects.length).toBeGreaterThan(0);
    expect(JSON.stringify(def.content)).toContain('Case ID');
    // The banner takes over the case number: the Case Details card drops its
    // row, so the case number appears exactly once (in the banner).
    const caseNo = JSON.stringify(def.content).match(/CASE-0007/g) ?? [];
    expect(caseNo).toHaveLength(1);
  });

  it('renders no banner when the presentation style is none even with a visible section', () => {
    const def = receiptRender({ sections: [{ key: 'docRef', visible: true, order: 1 }] });
    expect(findAll(def, (o) => o.type === 'rect' && typeof o.r === 'number')).toHaveLength(0);
    // Without the banner the Case Details card keeps its Case ID row.
    expect(JSON.stringify(def.content)).toContain('Case ID:');
  });

  it('renders dotted centered signatures + the Registered by line under the premium finish', () => {
    const def = receiptRender({ presentation: PREMIUM });
    expect(findAll(def, (o) => o.type === 'line' && o.dash !== undefined).length).toBeGreaterThan(0);
    expect(JSON.stringify(def.content)).toContain('Registered by:');
  });

  it('drops the filled info-card band under the open finish', () => {
    const legacy = receiptRender();
    const premium = receiptRender({ presentation: { infoCardStyle: 'open' } });
    const legacyBands = findAll(legacy, (o) => o.fillColor === '#f8fafc' || o.fillColor === '#F1F5F9');
    const premiumBands = findAll(premium, (o) => o.fillColor === '#f8fafc' || o.fillColor === '#F1F5F9');
    expect(legacyBands.length).toBeGreaterThan(0);
    expect(premiumBands.length).toBeLessThan(legacyBands.length);
  });

  it('white-fills the device table header under the light finish', () => {
    const def = receiptRender({ presentation: { tableHeaderStyle: 'light' } });
    const white = findAll(def, (o) => o.fillColor === '#ffffff' && o.style === 'tableHeader');
    expect(white.length).toBeGreaterThan(0);
  });
});

describe('display title follows the bilingual layout mode', () => {
  const EN_TITLE = 'DEVICE CHECK-IN RECEIPT';
  const AR_TITLE_WORD = 'إيصال'; // a word of the built-in Arabic title

  /** Two-line display treatment: a stack pairing the EN line with the AR line. */
  const titleStacks = (def: TDocumentDefinitions) =>
    findAll(
      def,
      (o) =>
        Array.isArray(o.stack) &&
        (o.stack as Record<string, unknown>[]).some((l) => l?.text === EN_TITLE) &&
        (o.stack as Record<string, unknown>[]).some(
          (l) => typeof l?.text === 'string' && (l.text as string).includes(AR_TITLE_WORD),
        ),
    );

  /** One-line treatment: a single rich-text node carrying runs of BOTH languages. */
  const titleLines = (def: TDocumentDefinitions) =>
    findAll(
      def,
      (o) =>
        Array.isArray(o.text) &&
        JSON.stringify(o.text).includes(EN_TITLE) &&
        JSON.stringify(o.text).includes(AR_TITLE_WORD),
    );

  it('side-by-side keeps both languages on ONE line', () => {
    const def = receiptRender({
      language: { mode: 'bilingual_sidebyside', primary: 'en', secondary: 'ar' },
      presentation: { titleStyle: 'display' },
    });
    const lines = titleLines(def);
    expect(lines).toHaveLength(1);
    expect(JSON.stringify(lines[0].text)).toContain(' | ');
    expect(titleStacks(def)).toHaveLength(0);
  });

  it('stacked keeps the two-line display treatment', () => {
    const def = receiptRender({
      language: { mode: 'bilingual_stacked', primary: 'en', secondary: 'ar' },
      presentation: { titleStyle: 'display' },
    });
    expect(titleStacks(def)).toHaveLength(1);
    expect(titleLines(def)).toHaveLength(0);
  });
});

describe('docRefBannerActive', () => {
  it('requires both the presentation style and a visible docRef section', () => {
    const base = BUILT_IN_TEMPLATE_CONFIGS.office_receipt;
    expect(docRefBannerActive(base)).toBe(false);
    const styleOnly = resolveTemplateConfig(base, undefined, { presentation: { docRef: 'banner' } });
    expect(docRefBannerActive(styleOnly)).toBe(false);
    const sectionOnly = resolveTemplateConfig(base, undefined, {
      sections: [{ key: 'docRef', visible: true, order: 1 }],
    });
    expect(docRefBannerActive(sectionOnly)).toBe(false);
    const both = resolveTemplateConfig(base, undefined, {
      presentation: { docRef: 'banner' },
      sections: [{ key: 'docRef', visible: true, order: 1 }],
    });
    expect(docRefBannerActive(both)).toBe(true);
  });
});

describe('premium gallery presets', () => {
  it('ships a premium preset for every non-label document type', () => {
    for (const docType of [
      'office_receipt', 'customer_copy', 'checkout_form', 'report',
      'invoice', 'quote', 'credit_note', 'payment_receipt',
      'payslip', 'chain_of_custody',
    ] as const) {
      const premium = TEMPLATE_PRESETS[docType].filter((p) => p.category === 'premium');
      expect(premium.length, docType).toBeGreaterThan(0);
    }
  });

  it('premium lab presets opt into the docRef banner and hide the QR section', () => {
    const preset = TEMPLATE_PRESETS.office_receipt.find((p) => p.id === 'office_receipt-premium-lab')!;
    expect(preset.config.presentation?.docRef).toBe('banner');
    const sections = preset.config.sections ?? [];
    expect(sections.some((s) => s.key === 'docRef' && s.visible)).toBe(true);
    expect(sections.some((s) => s.key === 'qr' && s.visible === false)).toBe(true);
  });
});

describe('EngineDocData premium fields stay inert without presentation', () => {
  it('ignores docRef/preparedBy data on an unconfigured template', () => {
    const config = BUILT_IN_TEMPLATE_CONFIGS.checkout_form;
    const data: EngineDocData = {
      documentTitle: { en: 'DOC' },
      identity: { basic_info: { company_name: 'C' } },
      parties: {},
      meta: [],
      docRef: { value: 'CASE-1' },
      preparedBy: 'Prepared by: X',
    };
    const def = renderTemplate(config, data, ctx, null, null);
    const text = JSON.stringify(def.content);
    expect(text).not.toContain('Prepared by: X');
    expect(findAll(def, (o) => o.type === 'rect' && typeof o.r === 'number')).toHaveLength(0);
  });
});

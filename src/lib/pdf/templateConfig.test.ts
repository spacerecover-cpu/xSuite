import { describe, it, expect } from 'vitest';
import {
  BUILT_IN_TEMPLATE_CONFIGS,
  resolveTemplateConfig,
  type DocumentTemplateConfig,
  type TemplateConfigOverride,
  type TemplateDocumentType,
} from './templateConfig';

const ALL_DOC_TYPES: TemplateDocumentType[] = [
  'office_receipt',
  'customer_copy',
  'checkout_form',
  'case_label',
  'quote',
  'invoice',
  'payment_receipt',
  'payslip',
  'chain_of_custody',
  'report',
  'stock_label',
];

describe('BUILT_IN_TEMPLATE_CONFIGS', () => {
  it('has a default for every document type', () => {
    for (const docType of ALL_DOC_TYPES) {
      const cfg = BUILT_IN_TEMPLATE_CONFIGS[docType];
      expect(cfg, `missing default for ${docType}`).toBeDefined();
      // Paper size must be one of the supported values; a 'custom' size (physical
      // labels) must additionally carry a [width, height] dimensions pair.
      expect(['A4', 'Letter', 'custom']).toContain(cfg.paper.size);
      if (cfg.paper.size === 'custom') {
        expect(cfg.paper.dimensions, `custom paper for ${docType} needs dimensions`).toHaveLength(2);
      }
      expect(cfg.branding.logo).toBe(true);
      expect(cfg.language.mode).toBe('en');
      expect(cfg.sections.length).toBeGreaterThan(0);
    }
  });

  it('exposes exactly the 11 supported document types', () => {
    expect(Object.keys(BUILT_IN_TEMPLATE_CONFIGS).sort()).toEqual([...ALL_DOC_TYPES].sort());
  });

  it('orders sections by ascending order with no gaps in the default', () => {
    const orders = BUILT_IN_TEMPLATE_CONFIGS.invoice.sections.map((s) => s.order);
    const sorted = [...orders].sort((a, b) => a - b);
    expect(orders).toEqual(sorted);
  });

  it('gives invoice and quote distinct titles', () => {
    expect(BUILT_IN_TEMPLATE_CONFIGS.invoice.labels.documentTitle.en).toBe('TAX INVOICE');
    expect(BUILT_IN_TEMPLATE_CONFIGS.quote.labels.documentTitle.en).toBe('QUOTATION');
  });
});

describe('resolveTemplateConfig — cascade', () => {
  const base: DocumentTemplateConfig = BUILT_IN_TEMPLATE_CONFIGS.invoice;

  it('returns the built-in unchanged when no overrides are supplied', () => {
    const resolved = resolveTemplateConfig(base);
    expect(resolved.paper).toEqual(base.paper);
    expect(resolved.labels.documentTitle.en).toBe('TAX INVOICE');
  });

  it('does not mutate the built-in input', () => {
    const before = JSON.stringify(base);
    resolveTemplateConfig(base, { paper: { size: 'Letter' } }, undefined, {
      sections: [{ key: 'terms', visible: false }],
    });
    expect(JSON.stringify(base)).toBe(before);
  });

  it('most-specific-wins: instance paper.size beats doc-type beats built-in', () => {
    // built-in = A4. theme sets Letter, doc-type sets A4, instance sets Letter.
    const resolved = resolveTemplateConfig(
      base,
      { paper: { size: 'Letter' } },
      { paper: { size: 'A4' } },
      { paper: { size: 'Letter' } },
    );
    expect(resolved.paper.size).toBe('Letter');
  });

  it('doc-type beats built-in when instance is absent', () => {
    const resolved = resolveTemplateConfig(base, undefined, { paper: { orientation: 'landscape' } });
    expect(resolved.paper.orientation).toBe('landscape');
    // untouched scalar falls through from the built-in
    expect(resolved.paper.size).toBe('A4');
  });

  it('merges partial paper without dropping sibling fields', () => {
    const resolved = resolveTemplateConfig(base, undefined, undefined, { paper: { size: 'Letter' } });
    expect(resolved.paper.size).toBe('Letter');
    expect(resolved.paper.orientation).toBe(base.paper.orientation);
    expect(resolved.paper.margins).toEqual(base.paper.margins);
  });
});

describe('resolveTemplateConfig — section visibility & order merge', () => {
  const base = BUILT_IN_TEMPLATE_CONFIGS.invoice;

  it('toggles a single section visible flag by key, leaving others intact', () => {
    const resolved = resolveTemplateConfig(base, undefined, undefined, {
      sections: [{ key: 'terms', visible: false }],
    });
    const terms = resolved.sections.find((s) => s.key === 'terms');
    const header = resolved.sections.find((s) => s.key === 'header');
    expect(terms?.visible).toBe(false);
    expect(header?.visible).toBe(true);
    // same number of sections — nothing dropped
    expect(resolved.sections.length).toBe(base.sections.length);
  });

  it('re-sorts sections when an override changes order', () => {
    const resolved = resolveTemplateConfig(base, undefined, undefined, {
      sections: [{ key: 'footer', order: -1 }],
    });
    expect(resolved.sections[0].key).toBe('footer');
    // global ordering is monotonic
    const orders = resolved.sections.map((s) => s.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it('adds a brand-new section introduced only by an override', () => {
    const resolved = resolveTemplateConfig(base, undefined, undefined, {
      sections: [{ key: 'customNotice', visible: true, order: 99 }],
    });
    const added = resolved.sections.find((s) => s.key === 'customNotice');
    expect(added).toBeDefined();
    expect(resolved.sections[resolved.sections.length - 1].key).toBe('customNotice');
  });

  it('merges totals line toggles without clobbering untouched lines', () => {
    const resolved = resolveTemplateConfig(base, undefined, undefined, {
      sections: [{ key: 'totals', lines: { amountInWords: true } }],
    });
    const totals = resolved.sections.find((s) => s.key === 'totals');
    expect(totals?.lines?.amountInWords).toBe(true);
    expect(totals?.lines?.subtotal).toBe(true); // untouched, still present
  });

  it('merges a column override by key (visibility, width, label)', () => {
    const resolved = resolveTemplateConfig(base, undefined, undefined, {
      sections: [
        {
          key: 'lineItems',
          columns: [{ key: 'quantity', visible: false, width: 60 }],
        },
      ],
    });
    const lineItems = resolved.sections.find((s) => s.key === 'lineItems');
    const qty = lineItems?.columns?.find((c) => c.key === 'quantity');
    const desc = lineItems?.columns?.find((c) => c.key === 'description');
    expect(qty?.visible).toBe(false);
    expect(qty?.width).toBe(60);
    expect(qty?.label.en).toBe('Qty'); // label preserved from built-in
    expect(desc?.visible).toBe(true); // sibling column untouched
  });
});

describe('resolveTemplateConfig — label merge', () => {
  const base = BUILT_IN_TEMPLATE_CONFIGS.invoice;

  it('overrides an existing label key', () => {
    const resolved = resolveTemplateConfig(base, undefined, undefined, {
      labels: { documentTitle: { en: 'VAT INVOICE', ar: 'فاتورة القيمة المضافة' } },
    });
    expect(resolved.labels.documentTitle.en).toBe('VAT INVOICE');
    expect(resolved.labels.documentTitle.ar).toBe('فاتورة القيمة المضافة');
  });

  it('adds a new label key while keeping existing ones', () => {
    const resolved = resolveTemplateConfig(base, undefined, undefined, {
      labels: { poNumber: { en: 'PO Number', ar: 'رقم الطلب' } },
    });
    expect(resolved.labels.poNumber.en).toBe('PO Number');
    expect(resolved.labels.documentTitle.en).toBe('TAX INVOICE'); // original retained
  });

  it('later cascade layers win on the same label key', () => {
    const theme: TemplateConfigOverride = { labels: { documentTitle: { en: 'FROM THEME' } } };
    const docType: TemplateConfigOverride = { labels: { documentTitle: { en: 'FROM DOC TYPE' } } };
    const instance: TemplateConfigOverride = { labels: { documentTitle: { en: 'FROM INSTANCE' } } };
    const resolved = resolveTemplateConfig(base, theme, docType, instance);
    expect(resolved.labels.documentTitle.en).toBe('FROM INSTANCE');
  });
});

describe('resolveTemplateConfig — branding & language', () => {
  const base = BUILT_IN_TEMPLATE_CONFIGS.invoice;

  it('opts into an accent and watermark via override', () => {
    const resolved = resolveTemplateConfig(base, { branding: { accent: '#162660', watermark: 'DRAFT' } });
    expect(resolved.branding.accent).toBe('#162660');
    expect(resolved.branding.watermark).toBe('DRAFT');
    expect(resolved.branding.logo).toBe(true); // sibling preserved
  });

  it('switches to a bilingual side-by-side Arabic-primary mode', () => {
    const resolved = resolveTemplateConfig(base, undefined, {
      language: { mode: 'bilingual_sidebyside', primary: 'ar' },
    });
    expect(resolved.language.mode).toBe('bilingual_sidebyside');
    expect(resolved.language.primary).toBe('ar');
  });
});

describe('resolveTemplateConfig — premium control groups', () => {
  const base = BUILT_IN_TEMPLATE_CONFIGS.invoice;

  it('leaves every premium group absent when no override sets it (parity)', () => {
    const resolved = resolveTemplateConfig(base);
    expect(resolved.colors).toBeUndefined();
    expect(resolved.typography).toBeUndefined();
    expect(resolved.header).toBeUndefined();
    expect(resolved.footer).toBeUndefined();
    expect(resolved.pageNumbers).toBeUndefined();
    expect(resolved.continuation).toBeUndefined();
    expect(resolved.organization).toBeUndefined();
    expect(resolved.taxBar).toBeUndefined();
    expect(resolved.table).toBeUndefined();
    expect(resolved.pageFitting).toBeUndefined();
    expect(resolved.watermark).toBeUndefined();
  });

  it('surfaces a scalar color group from an override', () => {
    const resolved = resolveTemplateConfig(base, undefined, undefined, {
      colors: { accent: '#10b981', headerBackground: '#ecfdf5' },
    });
    expect(resolved.colors?.accent).toBe('#10b981');
    expect(resolved.colors?.headerBackground).toBe('#ecfdf5');
  });

  it('merges color fields across cascade layers without dropping siblings', () => {
    const resolved = resolveTemplateConfig(
      base,
      { colors: { accent: '#10b981' } },
      { colors: { text: '#064e3b' } },
      { colors: { label: '#6b7280' } },
    );
    expect(resolved.colors?.accent).toBe('#10b981'); // from theme
    expect(resolved.colors?.text).toBe('#064e3b'); // from doc-type
    expect(resolved.colors?.label).toBe('#6b7280'); // from instance
  });

  it('later layer wins on the same color field', () => {
    const resolved = resolveTemplateConfig(
      base,
      { colors: { accent: '#111111' } },
      { colors: { accent: '#222222' } },
    );
    expect(resolved.colors?.accent).toBe('#222222');
  });

  it('deep-merges typography.sizes by key across layers', () => {
    const resolved = resolveTemplateConfig(
      base,
      { typography: { fontFamily: 'Tajawal', sizes: { documentTitle: 18 } } },
      { typography: { sizes: { tableHeader: 9 } } },
    );
    expect(resolved.typography?.fontFamily).toBe('Tajawal');
    expect(resolved.typography?.sizes?.documentTitle).toBe(18); // preserved
    expect(resolved.typography?.sizes?.tableHeader).toBe(9); // added
  });

  it('deep-merges header.dividerNudge while replacing scalar header fields', () => {
    const resolved = resolveTemplateConfig(
      base,
      { header: { layout: 'modern', dividerNudge: { start: 10 } } },
      { header: { divider: 'thick', dividerNudge: { end: 20 } } },
    );
    expect(resolved.header?.layout).toBe('modern');
    expect(resolved.header?.divider).toBe('thick');
    expect(resolved.header?.dividerNudge?.start).toBe(10); // preserved
    expect(resolved.header?.dividerNudge?.end).toBe(20); // added
  });

  it('deep-merges organization.show toggles across layers', () => {
    const resolved = resolveTemplateConfig(
      base,
      { organization: { show: { logo: false } } },
      { organization: { source: 'manual', show: { taxId: false } } },
    );
    expect(resolved.organization?.source).toBe('manual');
    expect(resolved.organization?.show?.logo).toBe(false); // preserved
    expect(resolved.organization?.show?.taxId).toBe(false); // added
  });

  it('does not mutate the built-in input when premium groups are applied', () => {
    const before = JSON.stringify(base);
    resolveTemplateConfig(base, { colors: { accent: '#10b981' } }, undefined, {
      header: { layout: 'boxed' },
    });
    expect(JSON.stringify(base)).toBe(before);
  });
});

describe('translationPolicy cascade', () => {
  const base = BUILT_IN_TEMPLATE_CONFIGS.invoice;
  it('is absent by default (→ all behavior)', () => {
    expect(resolveTemplateConfig(base).translationPolicy).toBeUndefined();
  });
  it('takes an override and deep-merges groups', () => {
    const a = resolveTemplateConfig(base, { translationPolicy: { mode: 'custom', groups: { parties: false } } });
    expect(a.translationPolicy).toEqual({ mode: 'custom', groups: { parties: false } });
    const b = resolveTemplateConfig(base,
      { translationPolicy: { mode: 'custom', groups: { parties: false } } },
      { translationPolicy: { groups: { meta: false } } },
    );
    expect(b.translationPolicy).toEqual({ mode: 'custom', groups: { parties: false, meta: false } });
  });
});

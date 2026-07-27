import { describe, it, expect } from 'vitest';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { renderTemplate } from './renderTemplate';
import { footerContentWidth, footerSideInsets, resolvePageBox, SHEET_POINTS } from './pageGeometry';
import { resolveWatermarkSettings } from './branding';
import { PDF_COLORS, PDF_STYLES } from '../styles';
import type { EngineDocData } from './types';
import type { TranslationContext } from '../types';
import {
  BUILT_IN_TEMPLATE_CONFIGS,
  resolveTemplateConfig,
  type DocumentTemplateConfig,
  type TemplateConfigOverride,
} from '../templateConfig';

// ---------------------------------------------------------------------------
// QA batch A — renderer core (RND-03/04/05/06/08, TBL-02, BIND-05/06).
//
// Every case here pairs a behaviour assertion with the PARITY assertion that
// matters for it: an unconfigured, English, A4-portrait template must come out
// of `renderTemplate` with exactly today's numbers. Each new behaviour is either
// opt-in (a config group the built-ins never populate) or derived from a value
// whose default reproduces the old constant.
// ---------------------------------------------------------------------------

const englishCtx: TranslationContext = {
  t: (_key: string, englishText: string) => englishText,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

/** The page-size argument pdfmake hands a footer callback (A4 portrait). */
const A4_BOX = { width: SHEET_POINTS.A4[0], height: SHEET_POINTS.A4[1] };

function makeData(): EngineDocData {
  return {
    documentTitle: { en: 'TAX INVOICE', ar: 'فاتورة ضريبية' },
    identity: {
      basic_info: { company_name: 'Acme Data Recovery', legal_name: 'Acme Data Recovery LLC' },
      location: { address_line1: '12 Lab Street', city: 'Muscat', country: 'Oman' },
      contact_info: { phone_primary: '+968 1234 5678', email_general: 'lab@acme.test' },
      branding: { brand_tagline: 'Recovered. Verified. Delivered.' },
      online_presence: { website: 'https://acme.test' },
    },
    parties: {
      to: {
        title: { en: 'Customer Information', ar: 'معلومات العميل' },
        name: 'Jane Client',
        rows: [{ label: { en: 'Phone:', ar: 'الهاتف:' }, value: '+968 9999 0000' }],
      },
    },
    meta: [{ label: { en: 'Invoice No:', ar: 'رقم الفاتورة:' }, value: 'INVO-0042' }],
    lineItems: {
      columns: [
        { key: 'description', visible: true, label: { en: 'Description', ar: 'الوصف' }, width: 220, align: 'left' },
        { key: 'lineTotal', visible: true, label: { en: 'Total', ar: 'المجموع' }, align: 'right' },
      ],
      rows: [{ description: 'RAID-5 logical recovery', lineTotal: '1000.000 OMR' }],
    },
    totals: [{ label: { en: 'Total:', ar: 'الإجمالي:' }, value: '1050.000 OMR', emphasis: true }],
    terms: { title: { en: 'Payment Terms', ar: 'شروط الدفع' }, body: 'Net 14 days.' },
    bank: null,
  };
}

const invoiceWith = (over: TemplateConfigOverride): DocumentTemplateConfig =>
  resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined, over);

const render = (config: DocumentTemplateConfig, qr: string | null = null): TDocumentDefinitions =>
  renderTemplate(config, makeData(), englishCtx, null, qr);

/** Invoke the page-footer callback and return the emitted node. */
function footerNode(def: TDocumentDefinitions): Record<string, unknown> {
  const fn = def.footer as (cp: number, pc: number, ps: typeof A4_BOX) => Content;
  expect(typeof fn).toBe('function');
  return fn(1, 1, A4_BOX) as unknown as Record<string, unknown>;
}

/** Every `canvas` line `x2` in a pdfmake tree (the divider rule widths). */
function ruleWidths(node: unknown, out: number[] = []): number[] {
  if (Array.isArray(node)) {
    node.forEach((n) => ruleWidths(n, out));
    return out;
  }
  if (!node || typeof node !== 'object') return out;
  const o = node as Record<string, unknown>;
  if (Array.isArray(o.canvas)) {
    for (const c of o.canvas as Record<string, unknown>[]) {
      if (c.type === 'line' && typeof c.x2 === 'number') out.push(c.x2);
    }
  }
  Object.values(o).forEach((v) => ruleWidths(v, out));
  return out;
}

/** The first node in a tree whose `text` is exactly `needle`. */
function findText(node: unknown, needle: string): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findText(n, needle);
      if (hit) return hit;
    }
    return null;
  }
  if (!node || typeof node !== 'object') return null;
  const o = node as Record<string, unknown>;
  if (o.text === needle) return o;
  for (const v of Object.values(o)) {
    const hit = findText(v, needle);
    if (hit) return hit;
  }
  return null;
}

/** Collect every `pageBreak` value present in a tree. */
function pageBreaks(node: unknown, out: unknown[] = []): unknown[] {
  if (Array.isArray(node)) {
    node.forEach((n) => pageBreaks(n, out));
    return out;
  }
  if (!node || typeof node !== 'object') return out;
  const o = node as Record<string, unknown>;
  if (o.pageBreak !== undefined) out.push(o.pageBreak);
  Object.values(o).forEach((v) => pageBreaks(v, out));
  return out;
}

// ---------------------------------------------------------------------------
// The parity lock. If this test fails, the batch has changed default output.
// ---------------------------------------------------------------------------

describe('PARITY — unconfigured English A4-portrait invoice', () => {
  it('reproduces every legacy geometry constant exactly', () => {
    const def = render(BUILT_IN_TEMPLATE_CONFIGS.invoice);

    expect(def.pageSize).toBe('A4');
    expect(def.pageOrientation).toBe('portrait');
    expect(def.pageMargins).toEqual([40, 40, 40, 40]);

    // Page footer: the legacy 35pt side inset and 525pt divider rule.
    const node = footerNode(def);
    expect(node.margin).toEqual([35, 10, 35, 25]);
    expect(ruleWidths(node)).toEqual([525]);

    // No opt-in feature leaks into the default document.
    expect(def.watermark).toBeUndefined();
    expect(def.background).toBeUndefined();
    expect(pageBreaks(def.content)).toEqual([]);
    expect(findText(node, 'Page 1 of 1')).toBeNull();
    expect((def.content as Content[]).length).toBeGreaterThan(0);
  });

  it('keeps the QR footer variant on its legacy inset too', () => {
    const def = render(BUILT_IN_TEMPLATE_CONFIGS.invoice, 'QR');
    const node = footerNode(def);
    expect(node.margin).toEqual([35, 0, 35, 25]);
    expect(ruleWidths(node)).toEqual([525]);
  });
});

// ---------------------------------------------------------------------------
// RND-03 — the page footer follows the configured paper margins.
// ---------------------------------------------------------------------------

describe('RND-03 — page-footer inset follows paper margins', () => {
  /** [leftInset, rightInset] read back off the emitted footer node. */
  const insets = (def: TDocumentDefinitions): [number, number] => {
    const m = footerNode(def).margin as [number, number, number, number];
    return [m[0], m[2]];
  };

  it('insets a narrow-margin template with its own margins', () => {
    const def = render(invoiceWith({ paper: { margins: [20, 20, 20, 20] } }));
    expect(insets(def)).toEqual([15, 15]);
  });

  it('insets a wide-margin template with its own margins', () => {
    const def = render(invoiceWith({ paper: { margins: [60, 60, 60, 60] } }));
    expect(insets(def)).toEqual([55, 55]);
  });

  it('tracks asymmetric left/right margins independently', () => {
    // CSS order [top, right, bottom, left].
    const def = render(invoiceWith({ paper: { margins: [40, 24, 40, 72] } }));
    expect(insets(def)).toEqual([67, 19]);
  });

  it('never lets the divider width desync from the emitted inset', () => {
    for (const margins of [[20, 20, 20, 20], [60, 60, 60, 60], [40, 24, 40, 72], [40, 40, 40, 40]]) {
      const paper = { margins: margins as [number, number, number, number] };
      const def = render(invoiceWith({ paper }));
      const [l, r] = insets(def);
      const expected = Math.round(SHEET_POINTS.A4[0] - l - r);
      expect(ruleWidths(footerNode(def))).toEqual([expected]);
      // …and the exported helper agrees with what was drawn.
      expect(footerContentWidth({ ...BUILT_IN_TEMPLATE_CONFIGS.invoice.paper, ...paper })).toBe(expected);
    }
  });

  it('clamps a margin pair wider than the sheet before insetting', () => {
    const def = render(invoiceWith({ paper: { margins: [40, 900, 40, 900] } }));
    const [l, r] = insets(def);
    expect(l).toBeGreaterThanOrEqual(0);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(SHEET_POINTS.A4[0] - l - r).toBeGreaterThan(0);
  });

  it('footerSideInsets reproduces the legacy 35pt pair on the default margins', () => {
    expect(footerSideInsets(BUILT_IN_TEMPLATE_CONFIGS.invoice.paper)).toEqual([35, 35]);
  });

  it('applies to the report page footer as well', () => {
    const base = BUILT_IN_TEMPLATE_CONFIGS.report;
    const def = renderTemplate(
      resolveTemplateConfig(base, undefined, { paper: { margins: [20, 20, 20, 20] } }),
      {
        ...makeData(),
        reportFooter: {
          confidentiality: { en: 'Confidential' },
          copyright: '© 2026 Acme',
          reportLine: 'Report ID: R-1',
        },
      },
      englishCtx,
      null,
      null,
    );
    const node = footerNode(def);
    const m = node.margin as [number, number, number, number];
    expect([m[0], m[2]]).toEqual([15, 15]);
    expect(ruleWidths(node)).toEqual([Math.round(SHEET_POINTS.A4[0] - 30)]);
  });
});

// ---------------------------------------------------------------------------
// RND-04 / RND-05 — the page-number line.
// ---------------------------------------------------------------------------

describe('RND-04 — page-number colour follows the resolved palette', () => {
  const numberNode = (over: TemplateConfigOverride) => {
    const def = render(invoiceWith({ pageNumbers: { enabled: true }, ...over }));
    const node = findText(footerNode(def), 'Page 1 of 1');
    expect(node).not.toBeNull();
    return node as Record<string, unknown>;
  };

  it('keeps the neutral muted grey when no colors group is configured', () => {
    expect(numberNode({}).color).toBe(PDF_COLORS.textMuted);
  });

  it('uses the configured label colour when a colors group is present', () => {
    expect(numberNode({ colors: { label: '#112233' } }).color).toBe('#112233');
  });

  it('falls back to the neutral label colour for a colors group without a label', () => {
    expect(numberNode({ colors: { accent: '#0a5c36' } }).color).toBe(PDF_COLORS.textLight);
  });
});

describe('RND-05 — page-number gutters follow the margins and mirror for RTL', () => {
  const numberMargin = (over: TemplateConfigOverride): number[] => {
    const def = render(invoiceWith({ pageNumbers: { enabled: true }, ...over }));
    const node = findText(footerNode(def), 'Page 1 of 1') as Record<string, unknown>;
    return node.margin as number[];
  };

  it('reproduces the legacy [40, 4, 40, 0] on the default margins (parity)', () => {
    expect(numberMargin({})).toEqual([40, 4, 40, 0]);
  });

  it('follows asymmetric paper margins in LTR', () => {
    // CSS [top, right, bottom, left] = [10, 20, 30, 40] → gutters left 40, right 20.
    expect(numberMargin({ paper: { margins: [10, 20, 30, 40] } })).toEqual([40, 4, 20, 0]);
  });

  it('mirrors the gutters for an RTL document', () => {
    expect(
      numberMargin({ paper: { margins: [10, 20, 30, 40] }, language: { mode: 'ar', primary: 'ar' } }),
    ).toEqual([20, 4, 40, 0]);
  });

  it('is a no-op mirror when the margins are symmetric', () => {
    expect(numberMargin({ language: { mode: 'ar', primary: 'ar' } })).toEqual([40, 4, 40, 0]);
  });
});

// ---------------------------------------------------------------------------
// RND-06 — watermark colour.
// ---------------------------------------------------------------------------

describe('RND-06 — watermark colour is configurable', () => {
  const NEUTRAL = (PDF_STYLES.watermark as { color: string }).color;

  it('defaults to exactly the legacy neutral wash', () => {
    const def = render(invoiceWith({ watermark: { text: 'DRAFT' } }));
    expect((def.watermark as { color?: string }).color).toBe(NEUTRAL);
  });

  it('keeps the legacy branding.watermark path neutral', () => {
    const def = render(invoiceWith({ branding: { watermark: 'DRAFT' } }));
    expect((def.watermark as { color?: string }).color).toBe(NEUTRAL);
  });

  it('honours an explicit watermark colour', () => {
    const def = render(invoiceWith({ watermark: { text: 'DRAFT', color: '#C81E1E' } }));
    expect((def.watermark as { color?: string }).color).toBe('#c81e1e');
  });

  it('degrades a malformed colour back to the neutral wash', () => {
    expect(resolveWatermarkSettings({ watermark: { text: 'X', color: 'not-a-hex' } })?.color).toBe(NEUTRAL);
    expect(resolveWatermarkSettings({ watermark: { text: 'X' } })?.color).toBe(NEUTRAL);
  });
});

// ---------------------------------------------------------------------------
// RND-08 — A3 / A5 / Legal.
// ---------------------------------------------------------------------------

describe('RND-08 — the predefined sheet set', () => {
  it.each([
    ['A3', 'A3'],
    ['A5', 'A5'],
    ['Legal', 'LEGAL'],
    ['Letter', 'LETTER'],
    ['A4', 'A4'],
  ] as const)('maps paper.size %s to pdfmake %s', (size, expected) => {
    const def = render(invoiceWith({ paper: { size } }));
    expect(def.pageSize).toBe(expected);
  });

  it('resolves the new sheets to their real point dimensions', () => {
    const paper = BUILT_IN_TEMPLATE_CONFIGS.invoice.paper;
    expect(resolvePageBox({ ...paper, size: 'A3' })).toEqual({ width: 841.89, height: 1190.55 });
    expect(resolvePageBox({ ...paper, size: 'A5' })).toEqual({ width: 419.53, height: 595.28 });
    expect(resolvePageBox({ ...paper, size: 'Legal' })).toEqual({ width: 612, height: 1008 });
  });

  it('derives divider widths from the new sheet instead of silently using A4', () => {
    const def = render(invoiceWith({ paper: { size: 'A3' } }));
    expect(ruleWidths(footerNode(def))).toEqual([Math.round(841.89 - 70)]);
    // A5 is NARROWER than A4 — the A4 fallback would have overflowed the sheet.
    const a5 = render(invoiceWith({ paper: { size: 'A5' } }));
    expect(ruleWidths(footerNode(a5))).toEqual([Math.round(419.53 - 70)]);
  });
});

// ---------------------------------------------------------------------------
// TBL-02 — opt-in per-section page break.
// ---------------------------------------------------------------------------

describe('TBL-02 — section pageBreakBefore', () => {
  it('emits no pageBreak anywhere by default (parity)', () => {
    const def = render(BUILT_IN_TEMPLATE_CONFIGS.invoice);
    expect(pageBreaks(def.content)).toEqual([]);
  });

  it('marks the requesting section with pageBreak before', () => {
    const def = render(invoiceWith({ sections: [{ key: 'totals', pageBreakBefore: true }] }));
    expect(pageBreaks(def.content)).toEqual(['before']);
  });

  it('does not start the document with a blank page', () => {
    // The first rendered section cannot usefully break — pdfmake would emit an
    // empty leading page.
    const config = invoiceWith({ sections: [{ key: 'header', pageBreakBefore: true }] });
    const def = render(config);
    expect(pageBreaks(def.content)).toEqual([]);
  });

  it('flags only the first block of a multi-block section', () => {
    // `header` emits three blocks; hiding it makes `parties` the opener so the
    // break on `lineItems` is not suppressed as a leading break.
    const def = render(
      invoiceWith({
        sections: [
          { key: 'header', visible: false },
          { key: 'lineItems', pageBreakBefore: true },
        ],
      }),
    );
    expect(pageBreaks(def.content)).toEqual(['before']);
  });
});

// ---------------------------------------------------------------------------
// BIND-05 / BIND-06 — assembler guards.
// ---------------------------------------------------------------------------

describe('BIND-05 — never hand pdfmake an empty content array', () => {
  it('guards a footer-only configuration', () => {
    const base = BUILT_IN_TEMPLATE_CONFIGS.invoice;
    const config = invoiceWith({
      sections: base.sections.map((s) => ({
        key: s.key,
        visible: s.key === 'footer' || s.key === 'qr',
      })),
    });
    const def = render(config);
    expect(Array.isArray(def.content)).toBe(true);
    expect((def.content as Content[]).length).toBeGreaterThan(0);
    // The page footer still renders — the guard only backfills the body.
    expect(typeof def.footer).toBe('function');
  });

  it('leaves a normal document body untouched (parity)', () => {
    const def = render(BUILT_IN_TEMPLATE_CONFIGS.invoice);
    const texts = JSON.stringify(def.content);
    expect(texts).toContain('RAID-5 logical recovery');
  });
});

describe('BIND-06 — density margin scaling floor', () => {
  it('does not scale margins at all without a pageFitting group (parity)', () => {
    const def = render(BUILT_IN_TEMPLATE_CONFIGS.invoice);
    expect(def.pageMargins).toEqual([40, 40, 40, 40]);
  });

  it('keeps a comfortable density identical to the default (parity)', () => {
    const def = render(invoiceWith({ pageFitting: { density: 'comfortable' } }));
    expect(def.pageMargins).toEqual([40, 40, 40, 40]);
  });

  it('CORRECTION: the audited 1–2pt case never actually rounded to zero', () => {
    // The finding claimed "at dense (0.78) with auto-fit (×0.9 → ~0.70), a 1–2pt
    // margin rounds to 0". It does not. `minScale` enters through Math.max, so
    // it is a FLOOR — the smallest reachable scale is dense × 0.9 = 0.702, and
    // neither 1pt nor 2pt rounds away at that scale. The guard's real (narrow)
    // trigger is a sub-0.71pt fractional margin, which only a stored or
    // hand-edited config can produce.
    const SMALLEST_SCALE = 0.78 * 0.9;
    expect(Math.round(1 * SMALLEST_SCALE)).toBe(1);
    expect(Math.round(2 * SMALLEST_SCALE)).toBe(1);
    expect(Math.round(0.6 * SMALLEST_SCALE)).toBe(0);

    const def = render(
      invoiceWith({
        paper: { margins: [1, 2, 1, 2] },
        pageFitting: { density: 'dense', autoFitOnePage: true, minScale: 0.1 },
      }),
    );
    expect(def.pageMargins).toEqual([1, 1, 1, 1]);
  });

  it('never rounds a non-zero margin away to nothing', () => {
    // 0.6pt × the smallest reachable scale (0.702) = 0.42 → Math.round → 0.
    const def = render(
      invoiceWith({
        paper: { margins: [0.6, 0.6, 0.6, 0.6] },
        pageFitting: { density: 'dense', autoFitOnePage: true },
      }),
    );
    expect(def.pageMargins).toEqual([1, 1, 1, 1]);
  });

  it('leaves a genuinely zero margin at zero', () => {
    const def = render(
      invoiceWith({
        paper: { margins: [0, 0, 0, 0] },
        pageFitting: { density: 'dense', autoFitOnePage: true },
      }),
    );
    expect(def.pageMargins).toEqual([0, 0, 0, 0]);
  });

  it('still scales an ordinary margin normally', () => {
    const def = render(
      invoiceWith({ paper: { margins: [40, 40, 40, 40] }, pageFitting: { density: 'dense' } }),
    );
    // 40 × 0.78 = 31.2 → 31.
    expect(def.pageMargins).toEqual([31, 31, 31, 31]);
  });
});

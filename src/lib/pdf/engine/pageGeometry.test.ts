import { describe, it, expect } from 'vitest';
import { resolvePageBox, contentWidth, footerContentWidth, SHEET_POINTS } from './pageGeometry';
import { renderTemplate } from './renderTemplate';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../templateConfig';
import { sampleInvoiceData } from './sampleData';
import { toEngineData } from './adapters/invoiceAdapter';
import type { TranslationContext } from '../types';

// Regression lock for QA RND-02: divider rules hardcoded `x2: 525` — the
// A4-portrait content width — in four engine renderers (footer ×2, header,
// reportFooter). On Letter the rule fell ~52pt short, on landscape A4 it
// spanned ~62% of the page, and with narrow custom margins it overflowed.
//
// NOTE: the same literal in src/lib/pdf/documents/* is CORRECT and deliberately
// untouched — those legacy builders hardcode pageSize 'A4' with 35pt side
// margins, so 595.28 - 70 = 525 is exactly their content width.

const CTX: TranslationContext = {
  t: (_k: string, en: string) => en,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

const paper = (over: Record<string, unknown> = {}) =>
  ({ ...BUILT_IN_TEMPLATE_CONFIGS.invoice.paper, ...over }) as typeof BUILT_IN_TEMPLATE_CONFIGS.invoice.paper;

describe('resolvePageBox', () => {
  it('resolves the predefined sheets portrait', () => {
    expect(resolvePageBox(paper({ size: 'A4', orientation: 'portrait' }))).toEqual({
      width: SHEET_POINTS.A4[0],
      height: SHEET_POINTS.A4[1],
    });
    expect(resolvePageBox(paper({ size: 'Letter', orientation: 'portrait' })).width).toBe(612);
  });

  it('swaps the axes for landscape', () => {
    const box = resolvePageBox(paper({ size: 'A4', orientation: 'landscape' }));
    expect(box.width).toBe(SHEET_POINTS.A4[1]);
    expect(box.height).toBe(SHEET_POINTS.A4[0]);
  });

  it('honours a custom box and degrades a malformed one to A4', () => {
    expect(resolvePageBox(paper({ size: 'custom', dimensions: [283, 170] })).width).toBe(283);
    // Zero/negative dimensions must not produce an invalid page box.
    expect(resolvePageBox(paper({ size: 'custom', dimensions: [0, 0] })).width).toBe(SHEET_POINTS.A4[0]);
  });
});

describe('derived widths', () => {
  it('contentWidth follows the sheet and its margins', () => {
    // A4 portrait with the built-in margins reproduces the legacy 525 constant.
    expect(contentWidth(paper({ margins: [30, 35, 30, 35] }))).toBe(525);
    // Letter is 17pt wider, so the rule must be too — this is the bug.
    expect(contentWidth(paper({ size: 'Letter', margins: [30, 35, 30, 35] }))).toBe(542);
  });

  it('contentWidth grows in landscape', () => {
    expect(contentWidth(paper({ orientation: 'landscape', margins: [30, 35, 30, 35] }))).toBe(772);
  });

  it('footerContentWidth is flush with the body text column', () => {
    // FOOTER_OUTDENT is 0, so the footer block insets exactly the page margins
    // and its divider spans the same width as body content. The default A4
    // template is therefore 595.28 - 80 = 515, NOT the historic 525 — a
    // deliberate 5pt output change (see FOOTER_OUTDENT).
    expect(footerContentWidth(paper({ margins: [30, 40, 30, 40] }))).toBe(515);
    expect(footerContentWidth(paper({ size: 'Letter' }))).toBe(532);
    expect(footerContentWidth(paper({ margins: [30, 120, 30, 120] }))).toBe(355);
    // Flush means it now agrees with contentWidth for the same paper.
    expect(footerContentWidth(paper({ margins: [30, 40, 30, 40] }))).toBe(
      contentWidth(paper({ margins: [30, 40, 30, 40] })),
    );
  });
});

describe('rendered divider width (RND-02)', () => {
  const dividerWidths = (over: Record<string, unknown>): number[] => {
    const config = {
      ...BUILT_IN_TEMPLATE_CONFIGS.invoice,
      paper: paper(over),
    } as typeof BUILT_IN_TEMPLATE_CONFIGS.invoice;
    const def = renderTemplate(config, toEngineData(sampleInvoiceData(), config), CTX);
    const found: number[] = [];
    const walk = (n: unknown): void => {
      if (Array.isArray(n)) return n.forEach(walk);
      if (!n || typeof n !== 'object') return;
      const o = n as Record<string, unknown>;
      if (Array.isArray(o.canvas)) {
        for (const c of o.canvas as Record<string, unknown>[]) {
          if (c.type === 'line' && typeof c.x2 === 'number') found.push(c.x2);
        }
      }
      Object.values(o).forEach(walk);
    };
    walk(def.content);
    return found;
  };

  it('draws A4 rules at the legacy width (parity)', () => {
    const widths = dividerWidths({ size: 'A4', margins: [30, 35, 30, 35] });
    expect(widths.length).toBeGreaterThan(0);
    expect(widths.every((w) => w === 525)).toBe(true);
  });

  it('widens the rules on Letter instead of leaving a gap', () => {
    const widths = dividerWidths({ size: 'Letter', margins: [30, 35, 30, 35] });
    expect(widths.length).toBeGreaterThan(0);
    expect(widths.every((w) => w === 542)).toBe(true);
  });

  it('never overflows the text column on narrow custom margins', () => {
    const widths = dividerWidths({ size: 'A4', margins: [30, 10, 30, 10] });
    expect(widths.every((w) => w === Math.round(SHEET_POINTS.A4[0]) - 20)).toBe(true);
  });
});

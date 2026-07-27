import { describe, it, expect } from 'vitest';
import { renderTemplate } from './renderTemplate';
import { BUILT_IN_TEMPLATE_CONFIGS, resolveTemplateConfig } from '../templateConfig';
import { sampleInvoiceData } from './sampleData';
import { toEngineData } from './adapters/invoiceAdapter';
import type { TranslationContext } from '../types';

// Regression lock for QA FUP-04: `pageBreakBefore` (TBL-02) existed in the
// config type and the engine, but no Studio control wrote it — reachable only
// from a hand-edited stored override, the same "config with no UI" shape RND-01
// was raised for. The checkbox now writes it through `api.patchSection`, which
// spreads the patch into `override.sections`. This pins the WHOLE chain the
// checkbox depends on: override → resolveTemplateConfig → rendered pageBreak.

const CTX: TranslationContext = {
  t: (_k: string, en: string) => en,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

/** Exactly the shape `patchSection` produces for the new checkbox. */
const renderWithOverride = (sections: { key: string; pageBreakBefore?: boolean }[]) => {
  const config = resolveTemplateConfig(
    BUILT_IN_TEMPLATE_CONFIGS.invoice,
    undefined,
    { sections } as never,
  );
  return renderTemplate(config, toEngineData(sampleInvoiceData(), config), CTX);
};

const breakingNodes = (content: unknown): unknown[] => {
  const found: unknown[] = [];
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== 'object') return;
    const o = n as Record<string, unknown>;
    if (o.pageBreak === 'before') found.push(o);
    Object.values(o).forEach(walk);
  };
  walk(content);
  return found;
};

/** A section that is actually visible on the built-in invoice. */
const MID_SECTION = BUILT_IN_TEMPLATE_CONFIGS.invoice.sections
  .filter((s) => s.visible)
  .map((s) => s.key)[2];

describe('pageBreakBefore wiring (FUP-04)', () => {
  it('the fixture targets a real, visible, non-first section', () => {
    expect(MID_SECTION).toBeTruthy();
  });

  it('emits no page break by default — the control is strictly opt-in', () => {
    const def = renderWithOverride([]);
    expect(breakingNodes(def.content)).toHaveLength(0);
  });

  it('a checkbox tick on a mid-document section reaches the rendered output', () => {
    const def = renderWithOverride([{ key: MID_SECTION, pageBreakBefore: true }]);
    expect(breakingNodes(def.content).length).toBeGreaterThan(0);
  });

  it('unticking it removes the break again (the override round-trips both ways)', () => {
    const on = renderWithOverride([{ key: MID_SECTION, pageBreakBefore: true }]);
    const off = renderWithOverride([{ key: MID_SECTION, pageBreakBefore: false }]);
    expect(breakingNodes(on.content).length).toBeGreaterThan(0);
    expect(breakingNodes(off.content)).toHaveLength(0);
  });
});

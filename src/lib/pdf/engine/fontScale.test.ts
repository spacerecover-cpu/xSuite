// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { renderTemplate } from './renderTemplate';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../templateConfig';
import { buildPreviewEngineData } from './sampleData';
import type { TranslationContext } from '../types';

const CTX = { lang: 'en' } as unknown as TranslationContext;

function collectFontSizes(node: unknown, out: number[]): void {
  if (Array.isArray(node)) return node.forEach((n) => collectFontSizes(n, out));
  if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (typeof o.fontSize === 'number') out.push(o.fontSize);
    Object.values(o).forEach((v) => collectFontSizes(v, out));
  }
}

function quoteDef(baseScale: number) {
  const config = { ...BUILT_IN_TEMPLATE_CONFIGS.quote, typography: { baseScale } };
  const data = buildPreviewEngineData('quote', config);
  return renderTemplate(config, data, CTX, null, null) as { content: unknown; footer?: unknown };
}

const sorted = (a: number[]) => [...a].sort((x, y) => x - y);
const round1 = (n: number) => Math.round(n * 10) / 10;

describe('document font scale — applies to inline section text', () => {
  it('scales every inline content font size by the typography base scale', () => {
    const at1: number[] = [];
    collectFontSizes(quoteDef(1.0).content, at1);
    const at12: number[] = [];
    collectFontSizes(quoteDef(1.2).content, at12);

    expect(at1.length).toBeGreaterThan(5); // the document has many inline sizes
    expect(sorted(at12)).toEqual(sorted(at1.map((s) => round1(s * 1.2))));
  });

  it('scales the page-footer text too', () => {
    const f1 = (quoteDef(1.0).footer as (c: number, p: number) => unknown)(1, 1);
    const f12 = (quoteDef(1.2).footer as (c: number, p: number) => unknown)(1, 1);
    const a1: number[] = []; collectFontSizes(f1, a1);
    const a12: number[] = []; collectFontSizes(f12, a12);
    expect(a1.length).toBeGreaterThan(0);
    expect(sorted(a12)).toEqual(sorted(a1.map((s) => round1(s * 1.2))));
  });

  it('leaves sizes unchanged at scale 1.0 (parity)', () => {
    const config = { ...BUILT_IN_TEMPLATE_CONFIGS.quote, typography: { baseScale: 1.0 } };
    const data = buildPreviewEngineData('quote', config);
    const def = renderTemplate(config, data, CTX, null, null) as { content: unknown };
    const sizes: number[] = [];
    collectFontSizes(def.content, sizes);
    // A known inline size from the bank/terms area (7pt body) survives unscaled.
    expect(sizes).toContain(7);
  });
});
